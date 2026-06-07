//! Client HTTP `POST …/chat/completions` (API [OpenAI-compatible](https://platform.openai.com/docs/api-reference/chat)) —
//! utilisé pour OpenRouter (headers additionnels) et pour **llama-server** (souvent sans clé, loopback).

use crate::{LlmError, LlmGenParams};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::error::Error;
use std::fmt::Display;
use std::ops::ControlFlow;
use std::thread;
use std::time::Duration;

use reqwest::StatusCode;

#[derive(Debug, Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    max_tokens: u32,
    temperature: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    /// Grammaire GBNF (llama-server / llama.cpp) — ignorée par OpenRouter.
    #[serde(skip_serializing_if = "Option::is_none")]
    grammar: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessageOut,
}

#[derive(Debug, Deserialize)]
struct ChatMessageOut {
    content: Option<String>,
}

/// Grammaire effective : `LlmGenParams.grammar_gbnf` prioritaire, sinon `schema_gbnf` du caller.
pub(crate) fn effective_grammar<'a>(p: &'a LlmGenParams, schema_gbnf: &'a str) -> Option<&'a str> {
    if let Some(g) = p.grammar_gbnf.as_deref() {
        let t = g.trim();
        if !t.is_empty() {
            return Some(t);
        }
    }
    let t = schema_gbnf.trim();
    if t.is_empty() { None } else { Some(t) }
}

fn extract_jsonish_text(raw: &str) -> &str {
    let t = raw.trim();
    if let Some(i) = t.find("```") {
        let after = &t[i + 3..];
        let after = after.strip_prefix("json").unwrap_or(after).trim_start();
        if let Some(end) = after.find("```") {
            return after[..end].trim();
        }
    }
    if let Some(i) = t.find('{') {
        if let Some(j) = t.rfind('}') {
            if j >= i {
                return &t[i..=j];
            }
        }
    }
    t
}

/// Variante d’en-têtes / auth pour les backends compatibles chat/completions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpChatBackendKind {
    /// OpenRouter : clé obligatoire + `HTTP-Referer` / `X-Title`.
    OpenRouter,
    /// llama-server, vLLM, etc. : clé optionnelle, pas d’en-têtes fournisseur.
    OpenAiCompatible,
}

#[derive(Debug)]
pub struct HttpChatEngine {
    client: reqwest::blocking::Client,
    api_key: String,
    base_url: String,
    model: String,
    kind: HttpChatBackendKind,
    /// Contexte serveur (sonde `/props` ou cache boot).
    n_ctx_probe: Option<u32>,
}

fn map_reqwest_send_err(ctx: &str, e: reqwest::Error) -> LlmError {
    let mut msg = format!("{ctx}: {e}");
    let mut cur: Option<&dyn Error> = Error::source(&e);
    while let Some(s) = cur {
        msg.push_str(" — ");
        msg.push_str(&s.to_string());
        cur = s.source();
    }
    LlmError::Msg(msg)
}

/// `HTTP(S)_PROXY` / proxy système envoie parfois le trafic loopback vers un proxy qui refuse
/// `127.0.0.1` : on force « sans proxy » pour les bases locales.
fn base_url_looks_loopback(base_url: &str) -> bool {
    let lower = base_url.to_ascii_lowercase();
    lower.contains("127.0.0.1")
        || lower.contains("localhost")
        || lower.contains("[::1]")
        || lower.contains("0.0.0.0")
}

fn build_blocking_client(for_loopback: bool) -> Result<reqwest::blocking::Client, LlmError> {
    // Aligné avec le timeout front `LLM_INVOKE` (~200s) : une requête peut attendre chargement + génération longue.
    let mut b = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(195));
    if for_loopback {
        b = b.no_proxy();
    }
    b.build()
        .map_err(|e| LlmError::Msg(format!("client HTTP: {e}")))
}

/// Réponse **503** de llama-server pendant que le GGUF monte en VRAM / RAM.
fn llama_server_model_still_loading(status: StatusCode, body: &str) -> bool {
    if status != StatusCode::SERVICE_UNAVAILABLE {
        return false;
    }
    let b = body.to_ascii_lowercase();
    b.contains("loading model")
        || b.contains("loading_model")
        || (b.contains("unavailable") && b.contains("load"))
}

const MODEL_LOAD_POLL_MS: u64 = 700;
const MODEL_LOAD_MAX_ATTEMPTS: u32 = 90;

impl HttpChatEngine {
    fn normalize_base(mut base_url: String) -> Result<String, LlmError> {
        while base_url.ends_with('/') {
            base_url.pop();
        }
        if base_url.trim().is_empty() {
            return Err(LlmError::Msg("LLM HTTP: URL de base vide.".into()));
        }
        Ok(base_url.trim().to_string())
    }

    /// OpenRouter : Bearer obligatoire + en-têtes recommandés par le fournisseur.
    pub fn new_open_router(api_key: String, base_url: String, model: String) -> Result<Self, LlmError> {
        if api_key.trim().is_empty() {
            return Err(LlmError::Msg("OpenRouter: clé API vide.".into()));
        }
        let model = model.trim().to_string();
        if model.is_empty() {
            return Err(LlmError::Msg("OpenRouter: modèle vide.".into()));
        }
        let base_norm = Self::normalize_base(base_url)?;
        let client = build_blocking_client(base_url_looks_loopback(&base_norm))?;
        Ok(Self {
            client,
            api_key: api_key.trim().to_string(),
            base_url: base_norm,
            model,
            kind: HttpChatBackendKind::OpenRouter,
            n_ctx_probe: None,
        })
    }

    /// Serveur type llama-server : Bearer seulement si `api_key` non vide après trim.
    pub fn new_open_ai_compatible(
        base_url: String,
        model: String,
        api_key: String,
    ) -> Result<Self, LlmError> {
        let model = model.trim().to_string();
        if model.is_empty() {
            return Err(LlmError::Msg("Serveur LLM: modèle vide.".into()));
        }
        let base_norm = Self::normalize_base(base_url)?;
        let client = build_blocking_client(base_url_looks_loopback(&base_norm))?;
        Ok(Self {
            client,
            api_key: api_key.trim().to_string(),
            base_url: base_norm,
            model,
            kind: HttpChatBackendKind::OpenAiCompatible,
            n_ctx_probe: None,
        })
    }

    pub fn set_n_ctx_probe(&mut self, n_ctx: u32) {
        if n_ctx >= 1024 {
            self.n_ctx_probe = Some(n_ctx);
        }
    }

    fn url(&self) -> String {
        format!("{}/chat/completions", self.base_url)
    }

    fn apply_auth(&self, req: reqwest::blocking::RequestBuilder) -> reqwest::blocking::RequestBuilder {
        match self.kind {
            HttpChatBackendKind::OpenRouter => req
                .header("Authorization", format!("Bearer {}", self.api_key))
                .header("HTTP-Referer", "https://rustymail.local")
                .header("X-Title", "RustyMail"),
            HttpChatBackendKind::OpenAiCompatible => {
                if self.api_key.is_empty() {
                    req
                } else {
                    req.header("Authorization", format!("Bearer {}", self.api_key))
                }
            }
        }
    }

    pub fn generate(
        &mut self,
        system: &str,
        user: &str,
        p: &LlmGenParams,
        schema_gbnf: &str,
    ) -> Result<String, LlmError> {
        let grammar = match self.kind {
            HttpChatBackendKind::OpenAiCompatible => effective_grammar(p, schema_gbnf),
            HttpChatBackendKind::OpenRouter => None,
        };
        let body = ChatCompletionRequest {
            model: self.model.as_str(),
            messages: vec![
                ChatMessage {
                    role: "system",
                    content: system,
                },
                ChatMessage {
                    role: "user",
                    content: user,
                },
            ],
            max_tokens: p.max_tokens.max(1),
            temperature: p.temperature.max(1e-6),
            top_p: if p.top_p > 1e-6 && p.top_p <= 1.0 {
                Some(p.top_p)
            } else {
                None
            },
            grammar,
        };

        let mut last_loading_hint: Option<String> = None;
        for attempt in 0..MODEL_LOAD_MAX_ATTEMPTS {
            if attempt > 0 {
                thread::sleep(Duration::from_millis(MODEL_LOAD_POLL_MS));
            }
            let req = self.client.post(self.url()).json(&body);
            let t0 = std::time::Instant::now();
            let resp = self
                .apply_auth(req)
                .send()
                .map_err(|e| map_reqwest_send_err("LLM HTTP", e))?;

            let status = resp.status();
            if status.is_success() {
                let t_body = std::time::Instant::now();
                let parsed: ChatCompletionResponse = resp
                    .json()
                    .map_err(|e| LlmError::Msg(format!("LLM JSON: {e}")))?;
                let text = parsed
                    .choices
                    .first()
                    .and_then(|c| c.message.content.clone())
                    .unwrap_or_default();
                if std::env::var_os("RUSTYMAIL_AI_PERF").is_some() {
                    let total_ms = t0.elapsed().as_millis();
                    let parse_ms = t_body.elapsed().as_millis();
                    let prompt_chars = system.chars().count() + user.chars().count();
                    eprintln!(
                        "[RustyMail AI] llm_http_total_ms={total_ms} llm_resp_json_ms={parse_ms} prompt_chars={prompt_chars} est_in_tokens={} out_chars={}",
                        crate::rough_token_estimate(&format!("{system}\n{user}")),
                        text.chars().count(),
                    );
                }
                return Ok(text);
            }

            let txt = resp.text().unwrap_or_default();
            let retry = self.kind == HttpChatBackendKind::OpenAiCompatible
                && llama_server_model_still_loading(status, &txt);
            if retry {
                last_loading_hint = Some(format!(
                    "LLM HTTP {status} (chargement modèle, tentative {}/{})",
                    attempt + 1,
                    MODEL_LOAD_MAX_ATTEMPTS
                ));
                continue;
            }
            return Err(LlmError::Msg(format!(
                "LLM HTTP {status}: {}",
                txt.chars().take(800).collect::<String>()
            )));
        }
        Err(LlmError::Msg(format!(
            "{} — le serveur répond encore 503 pendant le chargement du modèle (VRAM). Augmentez le délai ou attendez la fin du chargement.",
            last_loading_hint
                .unwrap_or_else(|| "LLM HTTP 503 (timeout attente chargement)".into())
        )))
    }

    pub fn generate_json<T: DeserializeOwned>(
        &mut self,
        system: &str,
        user: &str,
        schema_gbnf: &str,
        p: &LlmGenParams,
    ) -> Result<T, LlmError> {
        let sys = format!(
            "{system}\nRéponds **uniquement** avec un objet JSON valide (pas de markdown, pas de texte avant/après)."
        );
        let raw = self.generate(&sys, user, p, schema_gbnf)?;
        let slice = extract_jsonish_text(&raw);
        serde_json::from_str(slice).map_err(|e| LlmError::InvalidJson(e.to_string()))
    }

    pub fn generate_streaming<E: Display>(
        &mut self,
        system: &str,
        user: &str,
        p: &LlmGenParams,
        schema_gbnf: &str,
        mut on_chunk: impl FnMut(&str) -> ControlFlow<Result<(), E>>,
    ) -> Result<String, LlmError> {
        let grammar = match self.kind {
            HttpChatBackendKind::OpenAiCompatible => effective_grammar(p, schema_gbnf),
            HttpChatBackendKind::OpenRouter => None,
        };
        let mut body = json!({
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": p.max_tokens.max(1),
            "temperature": p.temperature.max(1e-6),
            "stream": true,
        });
        if let Some(g) = grammar {
            if let Some(obj) = body.as_object_mut() {
                obj.insert("grammar".into(), json!(g));
            }
        }
        if let Some(tp) = (p.top_p > 1e-6 && p.top_p <= 1.0).then_some(p.top_p) {
            if let Some(obj) = body.as_object_mut() {
                obj.insert("top_p".into(), json!(tp));
            }
        }

        let mut last_loading_hint: Option<String> = None;
        let mut text_out: Option<String> = None;
        for attempt in 0..MODEL_LOAD_MAX_ATTEMPTS {
            if attempt > 0 {
                thread::sleep(Duration::from_millis(MODEL_LOAD_POLL_MS));
            }
            let req = self
                .client
                .post(self.url())
                .header("Accept", "text/event-stream")
                .json(&body);
            let resp = self
                .apply_auth(req)
                .send()
                .map_err(|e| map_reqwest_send_err("LLM stream HTTP", e))?;

            let status = resp.status();
            if status.is_success() {
                let text = resp.text().map_err(|e| LlmError::Msg(e.to_string()))?;
                text_out = Some(text);
                break;
            }
            let txt = resp.text().unwrap_or_default();
            let retry = self.kind == HttpChatBackendKind::OpenAiCompatible
                && llama_server_model_still_loading(status, &txt);
            if retry {
                last_loading_hint = Some(format!(
                    "LLM stream {status} (chargement modèle, tentative {}/{})",
                    attempt + 1,
                    MODEL_LOAD_MAX_ATTEMPTS
                ));
                continue;
            }
            return Err(LlmError::Msg(format!(
                "LLM stream {status}: {}",
                txt.chars().take(800).collect::<String>()
            )));
        }
        let text = text_out.ok_or_else(|| {
            LlmError::Msg(format!(
                "{} — timeout attente fin du chargement modèle (503).",
                last_loading_hint.unwrap_or_else(|| "LLM stream 503".into())
            ))
        })?;

        let mut full = String::new();
        for line in text.lines() {
            let line = line.trim();
            if !line.starts_with("data:") {
                continue;
            }
            let payload = line.trim_start_matches("data:").trim();
            if payload == "[DONE]" {
                break;
            }
            let v: serde_json::Value = match serde_json::from_str(payload) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let piece = v["choices"][0]["delta"]["content"].as_str().unwrap_or("");
            if piece.is_empty() {
                continue;
            }
            full.push_str(piece);
            match on_chunk(piece) {
                ControlFlow::Continue(()) => {}
                ControlFlow::Break(Ok(())) => return Ok(full),
                ControlFlow::Break(Err(e)) => {
                    return Err(LlmError::Msg(e.to_string()));
                }
            }
        }
        Ok(full)
    }

    pub fn token_count(&self, s: &str) -> usize {
        crate::rough_token_estimate(s)
    }

    pub fn n_ctx(&self) -> u32 {
        if let Some(n) = self.n_ctx_probe.filter(|&n| n >= 1024) {
            return n;
        }
        std::env::var("RUSTYMAIL_LLM_N_CTX_HINT")
            .ok()
            .and_then(|s| s.parse::<u32>().ok())
            .filter(|&n| n >= 1024)
            .unwrap_or(8192)
    }

    /// OpenRouter ou API compatible hébergée hors loopback : le prompt peut quitter la machine.
    pub fn exfiltrates_to_third_party(&self) -> bool {
        match self.kind {
            HttpChatBackendKind::OpenRouter => true,
            HttpChatBackendKind::OpenAiCompatible => !base_url_looks_loopback(&self.base_url),
        }
    }
}

#[cfg(test)]
mod grammar_tests {
    use super::effective_grammar;
    use crate::LlmGenParams;

    #[test]
    fn effective_grammar_prefers_params() {
        let p = LlmGenParams {
            grammar_gbnf: Some("from-params".into()),
            ..Default::default()
        };
        assert_eq!(
            effective_grammar(&p, "from-schema"),
            Some("from-params")
        );
    }

    #[test]
    fn effective_grammar_falls_back_to_schema() {
        let p = LlmGenParams::default();
        assert_eq!(
            effective_grammar(&p, "from-schema"),
            Some("from-schema")
        );
    }
}
