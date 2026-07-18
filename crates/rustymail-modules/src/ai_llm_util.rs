//! Utilitaires communs pour les appels prompts + parsing JSON sortie modèle.

/// Marqueur d’erreur renvoyé quand l’utilisateur annule une génération LLM en cours.
pub const LLM_CANCELLED: &str = "llm_cancelled";

use serde::de::DeserializeOwned;
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::ai_llm_contracts::untrusted_mail_content_block;
use rustymail_domain::{AssistLlmTier, TokenBudgetReport};
use rustymail_llm::{redact_user_content_if_needed, LlmEngine, LlmError, LlmGenParams};

/// Contenu mail encadré pour prompt LLM ; redaction PII si le moteur exfiltre vers un tiers (OpenRouter, API distante).
pub(crate) fn untrusted_mail_for_engine(engine: &LlmEngine, label: &str, content: &str) -> String {
    let body = redact_user_content_if_needed(engine, content);
    untrusted_mail_content_block(label, &body)
}

/// Texte utilisateur (hors bloc « non fiable ») avec la même politique de redaction cloud.
pub(crate) fn user_text_for_engine(engine: &LlmEngine, content: &str) -> String {
    redact_user_content_if_needed(engine, content)
}

pub(crate) fn effective_n_ctx(engine: &LlmEngine) -> u32 {
    engine.n_ctx().max(1024)
}

pub(crate) fn prompt_token_count(engine: &LlmEngine, system: &str, user: &str) -> u32 {
    engine.token_count(&format!("{system}\n{user}")) as u32
}

/// Espace restant pour la sortie après prompt + marge (aligné `n_ctx` prefs / sonde llama-server).
pub(crate) fn output_room_after_prompt(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    ctx_slack: u32,
) -> u32 {
    effective_n_ctx(engine)
        .saturating_sub(prompt_token_count(engine, system, user))
        .saturating_sub(ctx_slack)
}

/// Plafond `max_tokens` HTTP : `min(max_souhaité, n_ctx − prompt − marge)`.
pub(crate) fn resolve_max_output_tokens(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    min: u32,
    max: u32,
    ctx_slack: u32,
) -> u32 {
    let room = output_room_after_prompt(engine, system, user, ctx_slack);
    if room == 0 {
        return 1;
    }
    let cap = max.min(room);
    if cap < min {
        return cap.max(1);
    }
    min.max(cap)
}

/// Sortie ~longueur d’un texte source (traduction, brouillon, adaptation de ton).
pub(crate) fn resolve_max_output_tokens_for_echo(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    echo_text: &str,
    min: u32,
    max: u32,
    ctx_slack: u32,
) -> u32 {
    let room = output_room_after_prompt(engine, system, user, ctx_slack);
    if room == 0 {
        return 1;
    }
    let echo_tokens = engine.token_count(echo_text) as u32;
    let need = echo_tokens
        .saturating_mul(5)
        .saturating_div(4)
        .saturating_add(256);
    let target = need.clamp(min, max);
    target.min(room).max(1)
}

pub(crate) fn gen_params_for_tier(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    tier: AssistLlmTier,
) -> LlmGenParams {
    let (min, max) = match tier {
        AssistLlmTier::Light => (512, 4096),
        AssistLlmTier::Heavy => (1024, 8192),
    };
    gen_params_json_for_prompt(engine, system, user, min, max)
}

pub(crate) fn gen_params_json_for_prompt(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    min: u32,
    max: u32,
) -> LlmGenParams {
    gen_params_json(resolve_max_output_tokens(
        engine, system, user, min, max, 64,
    ))
}

pub(crate) fn gen_params_json_for_prompt_with_grammar(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    min: u32,
    max: u32,
    grammar_gbnf: &str,
) -> LlmGenParams {
    gen_params_json_with_grammar(
        resolve_max_output_tokens(engine, system, user, min, max, 64),
        Some(grammar_gbnf),
    )
}

pub(crate) fn gen_params_json_echo_for_prompt(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    echo_text: &str,
    min: u32,
    max: u32,
) -> LlmGenParams {
    gen_params_json(resolve_max_output_tokens_for_echo(
        engine, system, user, echo_text, min, max, 64,
    ))
}

pub(crate) fn gen_params_text_for_prompt(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    min: u32,
    max: u32,
) -> LlmGenParams {
    gen_params_text(resolve_max_output_tokens(
        engine, system, user, min, max, 64,
    ))
}

pub(crate) fn gen_params_text_echo_for_prompt(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    echo_text: &str,
    min: u32,
    max: u32,
) -> LlmGenParams {
    gen_params_text(resolve_max_output_tokens_for_echo(
        engine, system, user, echo_text, min, max, 64,
    ))
}

pub(crate) fn gen_params_json(max_tokens: u32) -> LlmGenParams {
    gen_params_json_with_grammar(max_tokens, None)
}

pub(crate) fn gen_params_json_with_grammar(
    max_tokens: u32,
    grammar_gbnf: Option<&str>,
) -> LlmGenParams {
    LlmGenParams {
        max_tokens,
        temperature: 0.15,
        top_p: 0.92,
        stop: Vec::new(),
        grammar_gbnf: grammar_gbnf.map(str::to_string),
    }
}

pub(crate) fn gen_params_text(max_tokens: u32) -> LlmGenParams {
    LlmGenParams {
        max_tokens,
        temperature: 0.35,
        top_p: 0.92,
        stop: Vec::new(),
        grammar_gbnf: None,
    }
}

pub(crate) fn budget_report(
    n_ctx_hint: u32,
    engine: &LlmEngine,
    system: &str,
    user: &str,
    output: Option<&str>,
    input_truncated: bool,
) -> TokenBudgetReport {
    let input = engine.token_count(&format!("{system}\n{user}"));
    TokenBudgetReport {
        n_ctx: n_ctx_hint,
        input_tokens: input as u32,
        output_tokens: output.map(|o| engine.token_count(o) as u32).unwrap_or(0),
        truncated: input_truncated,
        strategy: "local_llm".into(),
        items_in: 0,
        items_used: 0,
    }
}

/// Profondeur de structures JSON non fermées (hors chaînes).
fn json_unclosed_depth(s: &str) -> usize {
    let mut stack: Vec<char> = Vec::new();
    let mut in_string = false;
    let mut escape = false;
    for c in s.chars() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if c == '\\' {
                escape = true;
                continue;
            }
            if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' => stack.push('}'),
            '[' => stack.push(']'),
            '}' | ']' => {
                if stack.last() == Some(&c) {
                    stack.pop();
                }
            }
            _ => {}
        }
    }
    stack.len()
}

pub(crate) fn extract_json_candidate(raw: &str) -> String {
    let t = raw.trim();
    if let Some(start_fence) = t.find("```") {
        let after = &t[start_fence + 3..];
        let after = after.strip_prefix("json").unwrap_or(after).trim_start();
        if let Some(end_fence) = after.find("```") {
            return after[..end_fence].trim().to_string();
        }
        return after.trim().to_string();
    }
    // Tableau racine avant objet : évite de ne garder que le premier `{…}` interne.
    if t.starts_with('[') {
        if let Some(j) = t.rfind(']') {
            return t[..=j].to_string();
        }
        return t.to_string();
    }
    if let Some(i) = t.find('{') {
        let rest = &t[i..];
        // JSON tronqué : ne pas couper au dernier `}` interne (sinon parse EOF / invalide).
        if json_unclosed_depth(rest) > 0 {
            return rest.to_string();
        }
        if let Some(j) = rest.rfind('}') {
            return rest[..=j].to_string();
        }
        return rest.to_string();
    }
    if let Some(i) = t.find('[') {
        let rest = &t[i..];
        if json_unclosed_depth(rest) > 0 {
            return rest.to_string();
        }
        if let Some(j) = rest.rfind(']') {
            return rest[..=j].to_string();
        }
        return rest.to_string();
    }
    t.to_string()
}

pub(crate) fn normalize_json_loose(s: &str) -> String {
    let mut t = s.replace('\u{00a0}', " ");
    t = t.replace('“', "\"");
    t = t.replace('”', "\"");
    t = t.replace('‘', "'");
    t = t.replace('’', "'");
    while t.contains(",}") {
        t = t.replace(",}", "}");
    }
    while t.contains(",]") {
        t = t.replace(",]", "]");
    }
    t
}

/// Ferme chaînes / tableaux / objets ouverts (sortie LLM coupée par max_tokens).
pub(crate) fn close_truncated_json(s: &str) -> String {
    let mut out = s.trim_end().to_string();
    let mut in_string = false;
    let mut escape = false;
    let mut stack: Vec<char> = Vec::new();
    for c in out.chars() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if c == '\\' {
                escape = true;
                continue;
            }
            if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' => stack.push('}'),
            '[' => stack.push(']'),
            '}' | ']' => {
                if stack.last() == Some(&c) {
                    stack.pop();
                }
            }
            _ => {}
        }
    }
    if in_string {
        out.push('"');
    }
    while out.ends_with(',') || out.ends_with(':') {
        out.pop();
    }
    while let Some(closer) = stack.pop() {
        out.push(closer);
    }
    out
}

/// Retire les éléments de tableau/objet incomplets en queue (JSON coupé par max_tokens).
fn repair_truncated_json_drop_tail(s: &str) -> Option<String> {
    let mut base = close_truncated_json(s);
    for _ in 0..32 {
        if serde_json::from_str::<serde_json::Value>(&base).is_ok() {
            return Some(base);
        }
        let trimmed = base.trim_end();
        if let Some(pos) = trimmed.rfind(",{") {
            base = close_truncated_json(&trimmed[..pos]);
            continue;
        }
        if let Some(pos) = trimmed.rfind(",[") {
            base = close_truncated_json(&trimmed[..pos]);
            continue;
        }
        break;
    }
    None
}

fn parse_json_with_optional_repair<T: DeserializeOwned>(s: &str) -> Result<T, LlmError> {
    let normalized = normalize_json_loose(s);
    match serde_json::from_str::<T>(&normalized) {
        Ok(v) => return Ok(v),
        Err(e) => {
            let msg = e.to_string();
            let repairable = msg.contains("EOF")
                || msg.contains("expected")
                || msg.contains("trailing")
                || msg.contains("missing field")
                || json_unclosed_depth(&normalized) > 0;
            if !repairable {
                return Err(LlmError::InvalidJson(msg));
            }
            let repaired = close_truncated_json(&normalized);
            if let Ok(v) = serde_json::from_str::<T>(&repaired) {
                return Ok(v);
            }
            if let Some(dropped) = repair_truncated_json_drop_tail(&normalized) {
                return serde_json::from_str(&dropped)
                    .map_err(|e3| LlmError::InvalidJson(format!("{msg} — réparation: {e3}")));
            }
            serde_json::from_str(&repaired)
                .map_err(|e2| LlmError::InvalidJson(format!("{msg} — réparation: {e2}")))
        }
    }
}

pub(crate) fn parse_model_json<T: DeserializeOwned>(raw: &str) -> Result<T, LlmError> {
    let s = extract_json_candidate(raw);
    parse_json_with_optional_repair(&s)
}

pub(crate) fn truncate_chars(text: &str, max_chars: usize) -> String {
    if text.len() <= max_chars {
        return text.to_string();
    }
    let mut cut = text.chars().take(max_chars).collect::<String>();
    cut.push_str("\n…[tronqué]");
    cut
}

/// Callback `generate_streaming` : annule si le drapeau est levé.
pub(crate) fn stream_chunk_or_cancel<E>(
    cancelled: &AtomicBool,
    piece: &str,
    on_chunk: &mut impl FnMut(&str),
) -> ControlFlow<Result<(), E>>
where
    E: std::fmt::Display,
{
    if cancelled.load(Ordering::Relaxed) {
        return ControlFlow::Break(Ok(()));
    }
    on_chunk(piece);
    ControlFlow::Continue(())
}

pub(crate) fn cancelled_llm_err(cancelled: &AtomicBool) -> Option<LlmError> {
    if cancelled.load(Ordering::Relaxed) {
        Some(LlmError::Msg(LLM_CANCELLED.into()))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_truncated_json_repairs_eof_list() {
        let partial = r#"{
  "changes": [],
  "decisions": [
    {"rank": 1, "title": "x", "impact": "y", "optionsHint": ["a"
"#;
        let repaired = close_truncated_json(partial);
        let v: serde_json::Value = serde_json::from_str(&repaired).expect("valid json");
        assert!(v.get("decisions").is_some());
    }

    #[test]
    fn extract_json_candidate_keeps_truncated_outer_object() {
        let partial = r#"{"a": [{"b": 1}"#;
        let cand = extract_json_candidate(partial);
        assert!(cand.starts_with('{'));
        assert!(json_unclosed_depth(&cand) > 0);
    }

    #[test]
    fn repair_drops_incomplete_object_in_facts_array() {
        let partial = r#"{"facts":[{"kind":"request","text":"Devis","messageIds":[]},{"kind":"deadline","tex"#;
        let v: serde_json::Value =
            parse_json_with_optional_repair(partial).expect("facts json repaired");
        assert_eq!(v["facts"].as_array().map(|a| a.len()), Some(1));
    }

    #[test]
    fn resolve_output_respects_n_ctx_room() {
        use rustymail_llm::LlmEngine;
        let mut engine = LlmEngine::open_ai_compatible(
            "http://127.0.0.1:8080/v1".into(),
            "test".into(),
            String::new(),
        )
        .expect("engine");
        engine.set_n_ctx_probe(4096);
        let out = resolve_max_output_tokens(&engine, "system", "user prompt", 512, 8192, 64);
        assert!((512..=4096).contains(&out));
    }
}
