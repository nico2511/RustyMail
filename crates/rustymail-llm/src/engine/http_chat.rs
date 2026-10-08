//! Client HTTP chat : OpenRouter et llama-server via `POST …/chat/completions`
//! (API [OpenAI-compatible](https://platform.openai.com/docs/api-reference/chat)).
//! Ollama utilise l’API native `POST {racine}/api/chat` (`num_ctx`, `keep_alive`).

use crate::{LlmError, LlmGenParams};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::error::Error;
use std::fmt::Display;
use std::io::Read;
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
    /// Modèles « think » (Ollama) : repli si `content` est vide.
    #[serde(default)]
    reasoning: Option<String>,
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
    if t.is_empty() {
        None
    } else {
        Some(t)
    }
}

fn extract_jsonish_text(raw: &str) -> String {
    let mut t = raw.trim().trim_start_matches('\u{feff}').to_string();
    if let Some(i) = t.find("```") {
        let after = &t[i + 3..];
        let after = after
            .trim_start()
            .strip_prefix("json")
            .or_else(|| after.trim_start().strip_prefix("JSON"))
            .unwrap_or(after)
            .trim_start();
        let inner = if let Some(end) = after.find("```") {
            after[..end].trim()
        } else {
            after.trim()
        };
        if inner.contains('{') || inner.contains('[') {
            t = inner.to_string();
        }
    }
    let t = t.trim();
    if let Some(rel) = t.find(['{', '[']) {
        let slice = &t[rel..];
        let mut stream = serde_json::Deserializer::from_str(slice).into_iter::<serde_json::Value>();
        if let Some(Ok(value)) = stream.next() {
            if matches!(
                value,
                serde_json::Value::Object(_) | serde_json::Value::Array(_)
            ) {
                let end = stream.byte_offset();
                return slice[..end].to_string();
            }
        }
    }
    t.to_string()
}

/// Variante d’en-têtes / auth pour les backends compatibles chat/completions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpChatBackendKind {
    /// OpenRouter : clé obligatoire + `HTTP-Referer` / `X-Title`.
    OpenRouter,
    /// llama-server, vLLM, etc. : clé optionnelle, pas d’en-têtes fournisseur. GBNF envoyée.
    OpenAiCompatible,
    /// Ollama (`/api/chat`). Pas de grammaire GBNF : le JSON est validé ensuite en Rust.
    Ollama,
}

fn grammar_for_kind<'a>(
    kind: HttpChatBackendKind,
    p: &'a LlmGenParams,
    schema_gbnf: &'a str,
) -> Option<&'a str> {
    match kind {
        HttpChatBackendKind::OpenAiCompatible => effective_grammar(p, schema_gbnf),
        HttpChatBackendKind::OpenRouter | HttpChatBackendKind::Ollama => None,
    }
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
    /// Ollama `keep_alive` (ex. `30m`). Ignoré par les autres backends.
    keep_alive: String,
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

fn build_blocking_client(
    kind: HttpChatBackendKind,
    for_loopback: bool,
) -> Result<reqwest::blocking::Client, LlmError> {
    // OpenRouter / llama-server : aligné sur le timeout front `LLM_INVOKE` (~200s).
    // Ollama : borne plus courte pour qu’un chargement ou une génération sans fin s’arrête.
    let (total, connect) = match kind {
        HttpChatBackendKind::Ollama => (OLLAMA_REQUEST_TIMEOUT, OLLAMA_CONNECT_TIMEOUT),
        HttpChatBackendKind::OpenRouter | HttpChatBackendKind::OpenAiCompatible => {
            (Duration::from_secs(195), Duration::from_secs(10))
        }
    };
    let mut b = reqwest::blocking::Client::builder()
        .connect_timeout(connect)
        .timeout(total);
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
/// Ollama : quelques essais si le serveur dit « modèle en chargement », puis échec visible.
const OLLAMA_LOAD_MAX_ATTEMPTS: u32 = 3;
const OLLAMA_REQUEST_TIMEOUT: Duration = Duration::from_secs(180);
const OLLAMA_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

fn ollama_status_retryable(status: StatusCode, body: &str) -> bool {
    let b = body.to_ascii_lowercase();
    if status == StatusCode::NOT_FOUND
        || b.contains("not found")
        || b.contains("try pulling")
        || b.contains("try pull")
    {
        return false;
    }
    status == StatusCode::SERVICE_UNAVAILABLE || status == StatusCode::TOO_MANY_REQUESTS
}

fn ollama_native_error_text(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    if let Some(msg) = v.get("error").and_then(|e| e.as_str()) {
        let msg = msg.trim();
        if !msg.is_empty() {
            return Some(msg.to_string());
        }
    }
    v.pointer("/error/message")
        .and_then(|m| m.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Durée avec unité (`30m`) → chaîne JSON. Sans unité (`-1`, `120`) → nombre JSON
/// (une chaîne `"120"` est refusée par le décodeur `time.Duration` d'Ollama).
fn ollama_keep_alive_json(normalized: &str) -> serde_json::Value {
    let t = normalized.trim();
    let has_unit = t.chars().any(|c| c.is_ascii_alphabetic());
    if !has_unit {
        if let Ok(n) = t.parse::<i64>() {
            return json!(n);
        }
        if let Ok(n) = t.parse::<f64>() {
            if n.is_finite() {
                return json!(n);
            }
        }
    }
    json!(t)
}

fn ollama_status_error(status: StatusCode, body: &str, model: &str) -> LlmError {
    let b = body.to_ascii_lowercase();
    if status == StatusCode::NOT_FOUND
        || b.contains("not found")
        || b.contains("try pulling")
        || b.contains("try pull")
    {
        return LlmError::Msg(format!(
            "Ollama : modèle « {model} » introuvable. Vérifiez le nom (`ollama list`) ou téléchargez-le (`ollama pull {model}`)."
        ));
    }
    if let Some(msg) = ollama_native_error_text(body) {
        return LlmError::Msg(format!("Ollama : {msg}"));
    }
    let snippet: String = body.chars().take(400).collect();
    LlmError::Msg(format!("Ollama HTTP {status} : {snippet}"))
}

fn message_visible_text(message: &ChatMessageOut) -> String {
    let content = message.content.clone().unwrap_or_default();
    if content.trim().is_empty() {
        message.reasoning.clone().unwrap_or_default()
    } else {
        content
    }
}

/// Corps OpenAI unique, ou flux SSE / NDJSON (Ollama qui streame malgré `stream: false`).
fn completion_text_from_body(body: &str) -> Result<String, LlmError> {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        if v.get("choices").is_none() {
            if let Some(msg) = v
                .get("error")
                .and_then(|e| e.as_str())
                .filter(|s| !s.trim().is_empty())
            {
                return Err(LlmError::Msg(format!("Ollama : {msg}")));
            }
            if let Some(msg) = v
                .pointer("/error/message")
                .and_then(|m| m.as_str())
                .filter(|s| !s.trim().is_empty())
            {
                return Err(LlmError::Msg(format!("Moteur LLM : {msg}")));
            }
        }
    }
    if let Ok(parsed) = serde_json::from_str::<ChatCompletionResponse>(body) {
        let text = parsed
            .choices
            .first()
            .map(message_visible_text_choice)
            .unwrap_or_default();
        return Ok(text);
    }
    if let Some(text) = assemble_streamed_completion(body) {
        return Ok(text);
    }
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .err()
        .map(|e| e.to_string())
        .unwrap_or_else(|| "corps inattendu".into());
    Err(LlmError::InvalidJson(format!(
        "Réponse du moteur illisible ({detail})."
    )))
}

fn message_visible_text_choice(choice: &ChatChoice) -> String {
    message_visible_text(&choice.message)
}

fn assemble_streamed_completion(body: &str) -> Option<String> {
    let mut delta_acc = String::new();
    let mut message_acc = String::new();
    let mut saw_delta = false;
    let mut saw_native = false;
    let mut first_full_message: Option<String> = None;
    let mut pieces = 0u32;
    for line in body.lines() {
        let payload = line.trim();
        let payload = payload
            .strip_prefix("data:")
            .map(str::trim)
            .unwrap_or(payload);
        if payload.is_empty() {
            continue;
        }
        if payload == "[DONE]" {
            break;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(payload) else {
            continue;
        };
        pieces += 1;
        if v.get("done").is_some() {
            saw_native = true;
        }
        if let Some(d) = v
            .pointer("/choices/0/delta/content")
            .and_then(|c| c.as_str())
        {
            saw_delta = true;
            delta_acc.push_str(d);
        }
        if let Some(m) = v
            .pointer("/choices/0/message/content")
            .and_then(|c| c.as_str())
        {
            if first_full_message.is_none() && !m.is_empty() {
                first_full_message = Some(m.to_string());
            }
            if saw_native {
                message_acc.push_str(m);
            }
        }
        if let Some(m) = v.pointer("/message/content").and_then(|c| c.as_str()) {
            saw_native = true;
            message_acc.push_str(m);
        }
        if v.get("done").and_then(|d| d.as_bool()) == Some(true) {
            break;
        }
    }
    if pieces == 0 {
        return None;
    }
    if saw_delta {
        return Some(delta_acc);
    }
    if saw_native {
        return Some(message_acc);
    }
    first_full_message
}

enum SseFeed {
    Continue,
    Done,
}

fn feed_sse_line<E: Display>(
    kind: HttpChatBackendKind,
    line: &str,
    full: &mut String,
    on_chunk: &mut impl FnMut(&str) -> ControlFlow<Result<(), E>>,
) -> Result<SseFeed, LlmError> {
    let line = line.trim();
    if line.is_empty() {
        return Ok(SseFeed::Continue);
    }
    let payload = if let Some(rest) = line.strip_prefix("data:") {
        rest.trim()
    } else if kind == HttpChatBackendKind::Ollama && line.starts_with('{') {
        line
    } else {
        return Ok(SseFeed::Continue);
    };
    if payload == "[DONE]" {
        return Ok(SseFeed::Done);
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(payload) else {
        return Ok(SseFeed::Continue);
    };
    let delta = v
        .pointer("/choices/0/delta/content")
        .and_then(|c| c.as_str())
        .unwrap_or("");
    let native = v
        .pointer("/message/content")
        .and_then(|c| c.as_str())
        .unwrap_or("");
    let piece = if !delta.is_empty() { delta } else { native };
    if !piece.is_empty() {
        full.push_str(piece);
        match on_chunk(piece) {
            ControlFlow::Continue(()) => {}
            ControlFlow::Break(Ok(())) => return Ok(SseFeed::Done),
            ControlFlow::Break(Err(e)) => return Err(LlmError::Msg(e.to_string())),
        }
    }
    let finish = v["choices"][0]["finish_reason"].as_str().unwrap_or("");
    let native_done = v.get("done").and_then(|d| d.as_bool()) == Some(true);
    if native_done || (!finish.is_empty() && finish != "null") {
        return Ok(SseFeed::Done);
    }
    Ok(SseFeed::Continue)
}

fn output_repeats(text: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    const WINDOW: usize = 64;
    if chars.len() < WINDOW * 3 {
        return false;
    }
    let n = chars.len();
    let a = &chars[n - WINDOW..];
    let b = &chars[n - 2 * WINDOW..n - WINDOW];
    let c = &chars[n - 3 * WINDOW..n - 2 * WINDOW];
    a == b && b == c
}

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
    pub fn new_open_router(
        api_key: String,
        base_url: String,
        model: String,
    ) -> Result<Self, LlmError> {
        if api_key.trim().is_empty() {
            return Err(LlmError::Msg("OpenRouter: clé API vide.".into()));
        }
        let model = model.trim().to_string();
        if model.is_empty() {
            return Err(LlmError::Msg("OpenRouter: modèle vide.".into()));
        }
        let base_norm = Self::normalize_base(base_url)?;
        let client = build_blocking_client(
            HttpChatBackendKind::OpenRouter,
            base_url_looks_loopback(&base_norm),
        )?;
        Ok(Self {
            client,
            api_key: api_key.trim().to_string(),
            base_url: base_norm,
            model,
            kind: HttpChatBackendKind::OpenRouter,
            n_ctx_probe: None,
            keep_alive: String::new(),
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
        let client = build_blocking_client(
            HttpChatBackendKind::OpenAiCompatible,
            base_url_looks_loopback(&base_norm),
        )?;
        Ok(Self {
            client,
            api_key: api_key.trim().to_string(),
            base_url: base_norm,
            model,
            kind: HttpChatBackendKind::OpenAiCompatible,
            n_ctx_probe: None,
            keep_alive: String::new(),
        })
    }

    /// Ollama : API native `/api/chat`, sans Bearer ni GBNF.
    pub fn new_ollama(
        base_url: String,
        model: String,
        keep_alive: String,
    ) -> Result<Self, LlmError> {
        let model = model.trim().to_string();
        if model.is_empty() {
            return Err(LlmError::Msg(
                "Ollama : nom de modèle vide (voir `ollama list`).".into(),
            ));
        }
        let base_norm = Self::normalize_base(base_url)?;
        let client = build_blocking_client(
            HttpChatBackendKind::Ollama,
            base_url_looks_loopback(&base_norm),
        )?;
        Ok(Self {
            client,
            api_key: String::new(),
            base_url: base_norm,
            model,
            kind: HttpChatBackendKind::Ollama,
            n_ctx_probe: None,
            keep_alive: super::normalize_ollama_keep_alive(&keep_alive),
        })
    }

    pub fn set_n_ctx_probe(&mut self, n_ctx: u32) {
        if n_ctx >= 1024 {
            self.n_ctx_probe = Some(n_ctx);
        }
    }

    fn url(&self) -> String {
        match self.kind {
            HttpChatBackendKind::Ollama => {
                format!("{}/api/chat", ollama_native_base_url(&self.base_url))
            }
            HttpChatBackendKind::OpenRouter | HttpChatBackendKind::OpenAiCompatible => {
                format!("{}/chat/completions", self.base_url)
            }
        }
    }

    fn ollama_native_body(
        &self,
        system: &str,
        user: &str,
        p: &LlmGenParams,
        stream: bool,
    ) -> serde_json::Value {
        let mut options = json!({
            "num_ctx": self.n_ctx(),
            "num_predict": p.max_tokens.max(1),
            "temperature": p.temperature.max(1e-6),
        });
        if p.top_p > 1e-6 && p.top_p <= 1.0 {
            options["top_p"] = json!(p.top_p);
        }
        let mut body = json!({
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": stream,
            "think": false,
            "options": options,
        });
        body["keep_alive"] = ollama_keep_alive_json(&self.keep_alive);
        if p.expect_json {
            body["format"] = json!("json");
        }
        body
    }

    fn apply_auth(
        &self,
        req: reqwest::blocking::RequestBuilder,
    ) -> reqwest::blocking::RequestBuilder {
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
            HttpChatBackendKind::Ollama => req,
        }
    }

    pub fn generate(
        &mut self,
        system: &str,
        user: &str,
        p: &LlmGenParams,
        schema_gbnf: &str,
    ) -> Result<String, LlmError> {
        let grammar = grammar_for_kind(self.kind, p, schema_gbnf);
        let body = if self.kind == HttpChatBackendKind::Ollama {
            self.ollama_native_body(system, user, p, false)
        } else {
            serde_json::to_value(&ChatCompletionRequest {
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
            })
            .map_err(|e| LlmError::Msg(e.to_string()))?
        };

        let attempts = self.max_http_attempts();
        let mut last_loading_hint: Option<String> = None;
        for attempt in 0..attempts {
            if attempt > 0 {
                thread::sleep(Duration::from_millis(MODEL_LOAD_POLL_MS));
            }
            let req = self.client.post(self.url()).json(&body);
            let t0 = std::time::Instant::now();
            let resp = self
                .apply_auth(req)
                .send()
                .map_err(|e| self.map_transport_err("LLM HTTP", e))?;

            let status = resp.status();
            if status.is_success() {
                let t_body = std::time::Instant::now();
                let raw_body = resp
                    .text()
                    .map_err(|e| self.map_transport_err("LLM HTTP", e))?;
                let text = completion_text_from_body(&raw_body)?;
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
            if self.http_status_retry(status, &txt) {
                last_loading_hint = Some(format!(
                    "LLM HTTP {status} (chargement modèle, tentative {}/{attempts})",
                    attempt + 1
                ));
                if attempt + 1 < attempts {
                    continue;
                }
                return Err(self.loading_exhausted_err(last_loading_hint.as_deref()));
            }
            return Err(self.http_status_err(status, &txt));
        }
        Err(self.loading_exhausted_err(last_loading_hint.as_deref()))
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
        if slice.trim().is_empty() || (!slice.contains('{') && !slice.contains('[')) {
            return Err(LlmError::InvalidJson(
                "Réponse du modèle sans JSON exploitable (objet ou tableau attendu).".into(),
            ));
        }
        serde_json::from_str(&slice).map_err(|e| LlmError::InvalidJson(e.to_string()))
    }

    pub fn generate_streaming<E: Display>(
        &mut self,
        system: &str,
        user: &str,
        p: &LlmGenParams,
        schema_gbnf: &str,
        mut on_chunk: impl FnMut(&str) -> ControlFlow<Result<(), E>>,
    ) -> Result<String, LlmError> {
        let grammar = grammar_for_kind(self.kind, p, schema_gbnf);
        let body = if self.kind == HttpChatBackendKind::Ollama {
            self.ollama_native_body(system, user, p, true)
        } else {
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
            body
        };

        let attempts = self.max_http_attempts();
        let mut last_loading_hint: Option<String> = None;
        let mut text_out: Option<String> = None;
        for attempt in 0..attempts {
            if attempt > 0 {
                thread::sleep(Duration::from_millis(MODEL_LOAD_POLL_MS));
            }
            let mut req = self.client.post(self.url()).json(&body);
            if self.kind != HttpChatBackendKind::Ollama {
                req = req.header("Accept", "text/event-stream");
            }
            let resp = self
                .apply_auth(req)
                .send()
                .map_err(|e| self.map_transport_err("LLM stream HTTP", e))?;

            let status = resp.status();
            if status.is_success() {
                let text = self.read_sse_body(resp, &mut on_chunk)?;
                text_out = Some(text);
                break;
            }
            let txt = resp.text().unwrap_or_default();
            if self.http_status_retry(status, &txt) {
                last_loading_hint = Some(format!(
                    "LLM stream {status} (chargement modèle, tentative {}/{attempts})",
                    attempt + 1
                ));
                if attempt + 1 < attempts {
                    continue;
                }
                return Err(self.loading_exhausted_err(last_loading_hint.as_deref()));
            }
            return Err(self.http_status_err(status, &txt));
        }
        text_out.ok_or_else(|| self.loading_exhausted_err(last_loading_hint.as_deref()))
    }

    fn max_http_attempts(&self) -> u32 {
        match self.kind {
            HttpChatBackendKind::Ollama => OLLAMA_LOAD_MAX_ATTEMPTS,
            HttpChatBackendKind::OpenRouter | HttpChatBackendKind::OpenAiCompatible => {
                MODEL_LOAD_MAX_ATTEMPTS
            }
        }
    }

    fn http_status_retry(&self, status: StatusCode, body: &str) -> bool {
        match self.kind {
            HttpChatBackendKind::OpenAiCompatible => llama_server_model_still_loading(status, body),
            HttpChatBackendKind::Ollama => ollama_status_retryable(status, body),
            HttpChatBackendKind::OpenRouter => false,
        }
    }

    fn map_transport_err(&self, ctx: &str, e: reqwest::Error) -> LlmError {
        if e.is_timeout() {
            let who = match self.kind {
                HttpChatBackendKind::Ollama => "Ollama",
                HttpChatBackendKind::OpenRouter => "OpenRouter",
                HttpChatBackendKind::OpenAiCompatible => "llama-server",
            };
            return LlmError::Msg(format!(
                "{who} : délai dépassé ({ctx}). Le modèle n’a pas fini (chargement ou génération trop longue)."
            ));
        }
        if self.kind == HttpChatBackendKind::Ollama && e.is_connect() {
            return LlmError::Msg(format!(
                "Ollama injoignable. Lancez `ollama serve` ou corrigez l’URL. Détail : {e}"
            ));
        }
        map_reqwest_send_err(ctx, e)
    }

    fn http_status_err(&self, status: StatusCode, body: &str) -> LlmError {
        if self.kind == HttpChatBackendKind::Ollama {
            return ollama_status_error(status, body, &self.model);
        }
        LlmError::Msg(format!(
            "LLM HTTP {status}: {}",
            body.chars().take(800).collect::<String>()
        ))
    }

    fn loading_exhausted_err(&self, hint: Option<&str>) -> LlmError {
        if self.kind == HttpChatBackendKind::Ollama {
            return LlmError::Msg(
                "Ollama : le modèle met trop longtemps à se charger. Réessayez dans un instant, ou lancez `ollama run <modèle>` une fois pour le précharger."
                    .into(),
            );
        }
        LlmError::Msg(format!(
            "{} — le serveur répond encore 503 pendant le chargement du modèle (VRAM). Augmentez le délai ou attendez la fin du chargement.",
            hint.unwrap_or("LLM HTTP 503 (timeout attente chargement)")
        ))
    }

    fn read_sse_body<E: Display>(
        &self,
        mut resp: impl Read,
        on_chunk: &mut impl FnMut(&str) -> ControlFlow<Result<(), E>>,
    ) -> Result<String, LlmError> {
        let mut raw: Vec<u8> = Vec::new();
        let mut buf = [0u8; 4096];
        let mut consumed_lines = 0usize;
        let mut full = String::new();
        loop {
            let n = resp.read(&mut buf).map_err(|e| {
                let msg = e.to_string();
                let lower = msg.to_ascii_lowercase();
                if e.kind() == std::io::ErrorKind::TimedOut
                    || lower.contains("timed out")
                    || lower.contains("timeout")
                {
                    let who = match self.kind {
                        HttpChatBackendKind::Ollama => "Ollama",
                        HttpChatBackendKind::OpenRouter => "OpenRouter",
                        HttpChatBackendKind::OpenAiCompatible => "llama-server",
                    };
                    return LlmError::Msg(format!(
                        "{who} : délai dépassé (flux). Le modèle n’a pas fini (chargement ou génération trop longue)."
                    ));
                }
                LlmError::Msg(format!("Lecture du flux LLM : {e}"))
            })?;
            if n == 0 {
                let text = String::from_utf8_lossy(&raw);
                let pending = match text.rsplit_once('\n') {
                    Some((_, rest)) => rest,
                    None => text.as_ref(),
                };
                if !pending.trim().is_empty() {
                    feed_sse_line(self.kind, pending, &mut full, on_chunk)?;
                    if self.kind == HttpChatBackendKind::Ollama && output_repeats(&full) {
                        return Err(LlmError::Msg(
                            "Ollama : la génération se répète. Arrêt pour éviter une boucle."
                                .into(),
                        ));
                    }
                }
                break;
            }
            raw.extend_from_slice(&buf[..n]);
            let text = String::from_utf8_lossy(&raw);
            let lines = text.split_inclusive('\n');
            let mut seen = 0usize;
            let mut stopped = false;
            for line in lines {
                if !line.ends_with('\n') {
                    break;
                }
                seen += 1;
                if seen <= consumed_lines {
                    continue;
                }
                consumed_lines = seen;
                match feed_sse_line(self.kind, line, &mut full, on_chunk)? {
                    SseFeed::Continue => {}
                    SseFeed::Done => {
                        stopped = true;
                        break;
                    }
                }
                if self.kind == HttpChatBackendKind::Ollama && output_repeats(&full) {
                    return Err(LlmError::Msg(
                        "Ollama : la génération se répète. Arrêt pour éviter une boucle.".into(),
                    ));
                }
            }
            if stopped {
                break;
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
            HttpChatBackendKind::OpenAiCompatible | HttpChatBackendKind::Ollama => {
                !base_url_looks_loopback(&self.base_url)
            }
        }
    }
}

/// `GET {base}/models` (API OpenAI). Timeout court : sert à dire si Ollama répond.
pub fn probe_openai_models(base_url: &str) -> Result<(), String> {
    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Ollama : URL vide.".into());
    }
    let url = format!("{base}/models");
    let loopback = base_url_looks_loopback(base);
    let mut builder = reqwest::blocking::Client::builder().timeout(Duration::from_secs(2));
    if loopback {
        builder = builder.no_proxy();
    }
    let client = builder
        .build()
        .map_err(|e| format!("Ollama : client HTTP ({e})."))?;
    match client.get(&url).send() {
        Ok(resp) if resp.status().is_success() => Ok(()),
        Ok(resp) => Err(format!(
            "Ollama injoignable à {base} (HTTP {}). Vérifiez l’URL, souvent http://127.0.0.1:11434/v1.",
            resp.status()
        )),
        Err(e) => Err(format!(
            "Ollama injoignable à {base}. Lancez `ollama serve` ou corrigez l’URL. Détail : {e}"
        )),
    }
}

/// Racine native Ollama (`http://127.0.0.1:11434`) à partir d’une base OpenAI-compatible (`…/v1`).
pub fn ollama_native_base_url(openai_compatible_base: &str) -> String {
    let mut base = openai_compatible_base
        .trim()
        .trim_end_matches('/')
        .to_string();
    if base.is_empty() {
        return base;
    }
    if base.to_ascii_lowercase().ends_with("/v1") {
        base.truncate(base.len().saturating_sub(3));
        while base.ends_with('/') {
            base.pop();
        }
    }
    base
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaTagModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaTagModel {
    #[serde(default)]
    name: String,
}

/// Extrait les noms de modèles depuis le JSON `GET /api/tags` d’Ollama.
pub fn parse_ollama_tags_json(body: &str) -> Result<Vec<String>, String> {
    let parsed: OllamaTagsResponse = serde_json::from_str(body)
        .map_err(|e| format!("Ollama : réponse /api/tags illisible ({e})."))?;
    let mut names: Vec<String> = parsed
        .models
        .into_iter()
        .map(|m| m.name.trim().to_string())
        .filter(|n| !n.is_empty())
        .collect();
    names.sort();
    names.dedup();
    Ok(names)
}

/// Liste les modèles locaux via l’API native Ollama `GET /api/tags`.
pub fn list_ollama_tags(base_url: &str) -> Result<Vec<String>, String> {
    let root = ollama_native_base_url(base_url);
    if root.is_empty() {
        return Err("Ollama : URL vide.".into());
    }
    let url = format!("{root}/api/tags");
    let loopback = base_url_looks_loopback(&root);
    let mut builder = reqwest::blocking::Client::builder().timeout(Duration::from_secs(3));
    if loopback {
        builder = builder.no_proxy();
    }
    let client = builder
        .build()
        .map_err(|e| format!("Ollama : client HTTP ({e})."))?;
    match client.get(&url).send() {
        Ok(resp) if resp.status().is_success() => {
            let body = resp
                .text()
                .map_err(|e| format!("Ollama : lecture /api/tags ({e})."))?;
            parse_ollama_tags_json(&body)
        }
        Ok(resp) => Err(format!(
            "Ollama injoignable à {root} (HTTP {}). Vérifiez `ollama serve` et l’URL.",
            resp.status()
        )),
        Err(e) => Err(format!(
            "Ollama injoignable à {root}. Lancez `ollama serve` ou corrigez l’URL. Détail : {e}"
        )),
    }
}

#[cfg(test)]
mod grammar_tests {
    use super::{
        completion_text_from_body, effective_grammar, grammar_for_kind, ollama_keep_alive_json,
        ollama_native_base_url, ollama_status_error, parse_ollama_tags_json, probe_openai_models,
        HttpChatBackendKind,
    };
    use crate::LlmGenParams;
    use reqwest::StatusCode;
    use serde_json::json;

    #[test]
    fn effective_grammar_prefers_params() {
        let p = LlmGenParams {
            grammar_gbnf: Some("from-params".into()),
            ..Default::default()
        };
        assert_eq!(effective_grammar(&p, "from-schema"), Some("from-params"));
    }

    #[test]
    fn effective_grammar_falls_back_to_schema() {
        let p = LlmGenParams::default();
        assert_eq!(effective_grammar(&p, "from-schema"), Some("from-schema"));
    }

    #[test]
    fn ollama_loading_retries_are_bounded_and_skip_missing_model() {
        use super::ollama_status_retryable;
        use reqwest::StatusCode;
        assert!(ollama_status_retryable(
            StatusCode::SERVICE_UNAVAILABLE,
            "loading model"
        ));
        assert!(!ollama_status_retryable(
            StatusCode::NOT_FOUND,
            "model 'x' not found, try pulling it first"
        ));
        assert_eq!(super::OLLAMA_LOAD_MAX_ATTEMPTS, 3);
    }

    #[test]
    fn streamed_completion_keeps_first_value_not_trailing_chunks() {
        let body = "{\"choices\":[{\"delta\":{\"content\":\"{\\\"a\\\":1}\"}}]}\n{\"choices\":[{\"delta\":{\"content\":\"ignored\"}}]}\n";
        let text = super::assemble_streamed_completion(body).expect("deltas");
        assert_eq!(text, "{\"a\":1}ignored");
        let single = "{\"choices\":[{\"message\":{\"content\":\"{\\\"diagnosis\\\":\\\"ok\\\"}\"}}]}\n{\"note\":true}\n";
        let text = super::completion_text_from_body(single).expect("first object fails, assemble");
        assert!(text.contains("diagnosis"), "{text}");
        assert!(!text.contains("note"));
    }

    #[test]
    fn extract_jsonish_drops_fence_and_trailing_object() {
        let raw = "```json\n{\"a\":1}\n```\n{\"b\":2}";
        let slice = super::extract_jsonish_text(raw);
        let v: serde_json::Value = serde_json::from_str(&slice).expect("json");
        assert_eq!(v["a"], 1);
        assert!(v.get("b").is_none());
    }

    #[test]
    fn repetition_detector_trips_on_three_identical_windows() {
        let looping = "x".repeat(64 * 3);
        assert!(super::output_repeats(&looping));
        assert!(!super::output_repeats("une réponse normale, sans boucle."));
    }

    #[test]
    fn ollama_does_not_send_gbnf() {
        let p = LlmGenParams::default();
        assert_eq!(
            grammar_for_kind(HttpChatBackendKind::Ollama, &p, "root ::= \"{\" "),
            None
        );
        assert_eq!(
            grammar_for_kind(HttpChatBackendKind::OpenRouter, &p, "root"),
            None
        );
        assert!(grammar_for_kind(HttpChatBackendKind::OpenAiCompatible, &p, "root").is_some());
    }

    #[test]
    fn probe_models_accepts_local_http_mock() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().expect("accept");
            let mut buf = [0u8; 1024];
            let _ = sock.read(&mut buf);
            let body = br#"{"object":"list","data":[]}"#;
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = sock.write_all(resp.as_bytes());
            let _ = sock.write_all(body);
        });
        let base = format!("http://127.0.0.1:{port}/v1");
        probe_openai_models(&base).expect("probe ok");
    }

    #[test]
    fn probe_models_reports_ollama_when_nothing_listens() {
        let err = probe_openai_models("http://127.0.0.1:1/v1").expect_err("refused");
        assert!(err.contains("Ollama injoignable"));
        assert!(err.contains("11434") || err.contains("127.0.0.1:1"));
    }

    #[test]
    fn ollama_native_base_strips_v1_suffix() {
        assert_eq!(
            ollama_native_base_url("http://127.0.0.1:11434/v1"),
            "http://127.0.0.1:11434"
        );
        assert_eq!(
            ollama_native_base_url("http://127.0.0.1:11434/v1/"),
            "http://127.0.0.1:11434"
        );
        assert_eq!(
            ollama_native_base_url("http://127.0.0.1:11434"),
            "http://127.0.0.1:11434"
        );
    }

    #[test]
    fn parse_ollama_tags_extracts_sorted_names() {
        let body =
            r#"{"models":[{"name":"qwen2.5:7b"},{"name":"llama3.2"},{"name":"qwen2.5:7b"}]}"#;
        let names = parse_ollama_tags_json(body).expect("parse");
        assert_eq!(
            names,
            vec!["llama3.2".to_string(), "qwen2.5:7b".to_string()]
        );
    }

    fn spawn_one_shot(response_body: &str) -> (u16, std::sync::Arc<std::sync::Mutex<String>>) {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::sync::{Arc, Mutex};
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let captured = Arc::new(Mutex::new(String::new()));
        let slot = captured.clone();
        let response_body = response_body.to_string();
        std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().expect("accept");
            let _ = sock.set_read_timeout(Some(std::time::Duration::from_secs(5)));
            let mut buf = Vec::new();
            let mut tmp = [0u8; 4096];
            loop {
                match sock.read(&mut tmp) {
                    Ok(0) => break,
                    Ok(n) => {
                        buf.extend_from_slice(&tmp[..n]);
                        if let Some(header_end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                            let headers = String::from_utf8_lossy(&buf[..header_end]);
                            let len = headers
                                .lines()
                                .find_map(|line| {
                                    let rest = line
                                        .strip_prefix("Content-Length:")
                                        .or_else(|| line.strip_prefix("content-length:"))?;
                                    rest.trim().parse::<usize>().ok()
                                })
                                .unwrap_or(0);
                            if buf.len() >= header_end + 4 + len {
                                break;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
            *slot.lock().expect("capture") = String::from_utf8_lossy(&buf).into_owned();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            let _ = sock.write_all(resp.as_bytes());
        });
        (port, captured)
    }

    fn captured_request(slot: &std::sync::Mutex<String>) -> (String, serde_json::Value) {
        let raw = slot.lock().expect("capture").clone();
        let (head, body) = raw.split_once("\r\n\r\n").expect("headers");
        let path = head
            .lines()
            .next()
            .expect("request line")
            .split_whitespace()
            .nth(1)
            .expect("path")
            .to_string();
        let json: serde_json::Value = serde_json::from_str(body).expect("json body");
        (path, json)
    }

    #[test]
    fn unitless_keep_alive_is_json_number_and_native_error_is_text() {
        assert_eq!(ollama_keep_alive_json("-1"), json!(-1));
        assert_eq!(ollama_keep_alive_json("120"), json!(120));
        assert_eq!(ollama_keep_alive_json("45m"), json!("45m"));
        assert_eq!(ollama_keep_alive_json("30m"), json!("30m"));
        let err = completion_text_from_body(r#"{"error":"time: invalid duration 120"}"#)
            .expect_err("native error");
        let msg = err.to_string();
        assert!(msg.contains("invalid duration"), "{msg}");
        assert!(msg.contains("Ollama"), "{msg}");
        let http = ollama_status_error(
            StatusCode::BAD_REQUEST,
            r#"{"error":"time: invalid duration"}"#,
            "llama3.2",
        );
        let http_msg = http.to_string();
        assert!(http_msg.contains("invalid duration"), "{http_msg}");
        assert!(!http_msg.contains('{'), "{http_msg}");
    }

    #[test]
    fn ollama_native_chat_sends_num_ctx_keep_alive_and_parses_message() {
        let (port, slot) = spawn_one_shot(
            r#"{"model":"llama3.2","message":{"role":"assistant","content":"{\"ok\":true}"},"done":true}"#,
        );
        let mut engine = super::HttpChatEngine::new_ollama(
            format!("http://127.0.0.1:{port}/v1"),
            "llama3.2".into(),
            "45m".into(),
        )
        .expect("engine");
        engine.set_n_ctx_probe(4096);
        let params = LlmGenParams {
            expect_json: true,
            max_tokens: 128,
            ..LlmGenParams::default()
        };
        let text = engine
            .generate("sys", "user", &params, "")
            .expect("generate");
        assert!(text.contains("\"ok\""), "{text}");
        let (path, body) = captured_request(&slot);
        assert_eq!(path, "/api/chat");
        assert_eq!(body["keep_alive"], "45m");
        assert_eq!(body["think"], false);
        assert_eq!(body["stream"], false);
        assert_eq!(body["format"], "json");
        assert_eq!(body["options"]["num_ctx"], 4096);
        assert_eq!(body["options"]["num_predict"], 128);
        assert!(body.get("max_tokens").is_none());
        assert!(body.get("response_format").is_none());
    }

    #[test]
    fn ollama_native_chat_parses_ndjson_stream() {
        let (port, slot) = spawn_one_shot(
            "{\"message\":{\"content\":\"hel\"},\"done\":false}\n{\"message\":{\"content\":\"lo\"},\"done\":false}\n{\"message\":{\"content\":\"\"},\"done\":true}\n",
        );
        let mut engine = super::HttpChatEngine::new_ollama(
            format!("http://127.0.0.1:{port}/v1"),
            "llama3.2".into(),
            "30m".into(),
        )
        .expect("engine");
        engine.set_n_ctx_probe(2048);
        let params = LlmGenParams {
            max_tokens: 32,
            ..LlmGenParams::default()
        };
        let mut pieces = Vec::new();
        let text = engine
            .generate_streaming("sys", "user", &params, "", |chunk| {
                pieces.push(chunk.to_string());
                std::ops::ControlFlow::<Result<(), String>>::Continue(())
            })
            .expect("stream");
        assert_eq!(text, "hello");
        assert_eq!(pieces, vec!["hel".to_string(), "lo".to_string()]);
        let (path, body) = captured_request(&slot);
        assert_eq!(path, "/api/chat");
        assert_eq!(body["stream"], true);
        assert_eq!(body["keep_alive"], "30m");
        assert_eq!(body["options"]["num_ctx"], 2048);
        assert!(body.get("format").is_none());
    }

    #[test]
    fn llama_server_stays_on_chat_completions() {
        let (port, slot) = spawn_one_shot(r#"{"choices":[{"message":{"content":"ok"}}]}"#);
        let mut engine = super::HttpChatEngine::new_open_ai_compatible(
            format!("http://127.0.0.1:{port}/v1"),
            "local".into(),
            String::new(),
        )
        .expect("engine");
        let text = engine
            .generate("sys", "user", &LlmGenParams::default(), "")
            .expect("generate");
        assert_eq!(text, "ok");
        let (path, body) = captured_request(&slot);
        assert_eq!(path, "/v1/chat/completions");
        assert!(body.get("keep_alive").is_none());
        assert!(body.get("options").is_none());
        assert!(body.get("max_tokens").is_some());
    }
}
