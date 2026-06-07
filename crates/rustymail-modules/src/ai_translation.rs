//! Traduction via LLM locale.

use serde::Deserialize;

use std::convert::Infallible;
use std::ops::ControlFlow;
use std::sync::atomic::AtomicBool;

use crate::ai_llm_contracts::{validate_translation_llm_shape, TRANSLATION_PLAIN_JSON_GBNF};
use crate::ai_llm_util::{
    budget_report, cancelled_llm_err, gen_params_json_echo_for_prompt, parse_model_json,
    stream_chunk_or_cancel, truncate_chars, untrusted_mail_for_engine,
};
use rustymail_domain::TranslationResult;
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranslationLlmDto {
    translated_text: String,
    #[serde(default)]
    preserved_entity_ids: Vec<String>,
    #[serde(default)]
    detected_source_lang: Option<String>,
}

fn system_translation(output_language: &str) -> String {
    crate::prompts::system_prompt_for_language("translation", output_language)
}

/// Paramètres de génération : corps traduit + JSON ; plafond = `n_ctx − prompt`.
fn translation_gen_params(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    body: &str,
) -> rustymail_llm::LlmGenParams {
    gen_params_json_echo_for_prompt(engine, system, user, body, 512, 32_768)
}

fn looks_like_css_rule_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() || !t.contains('{') || !t.contains('}') {
        return false;
    }
    let lower = t.to_ascii_lowercase();
    lower.contains("!important")
        || lower.contains("outlook-group-fix")
        || lower.contains("mj-outlook")
        || lower.contains("@media")
        || (t.starts_with('.') && lower.contains(':'))
}

fn strip_css_boilerplate_lines(text: &str) -> String {
    text.lines()
        .filter(|line| !looks_like_css_rule_line(line))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn normalize_detected_source_lang(raw: Option<String>, fallback: &str) -> String {
    let s = raw.unwrap_or_default().trim().to_lowercase();
    if s.is_empty() {
        return fallback.to_string();
    }
    if s.contains(' ') || s.len() > 8 {
        return fallback.to_string();
    }
    if s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') && (2..=8).contains(&s.len()) {
        return s;
    }
    fallback.to_string()
}

fn translation_from_raw(
    raw: &str,
    engine: &mut LlmEngine,
    system: &str,
    user: &str,
    source_message_id: &str,
    source_lang: &str,
    target_lang: &str,
    text: &str,
) -> Result<TranslationResult, LlmError> {
    let dto: TranslationLlmDto = parse_model_json(raw).map_err(|e| match e {
        LlmError::InvalidJson(msg)
            if msg.contains("EOF") && msg.contains("string") =>
        {
            LlmError::Msg(format!(
                "Traduction : réponse JSON tronquée par le modèle (souvent pas assez de tokens de sortie). Essayez un mail plus court ou augmentez la fenêtre côté llama-server. Détail : {msg}"
            ))
        }
        other => other,
    })?;
    validate_translation_llm_shape(
        dto.translated_text.trim(),
        &dto.preserved_entity_ids,
        dto.detected_source_lang.as_deref(),
    )?;
    let n_ctx_hint = engine.n_ctx();
    let src = normalize_detected_source_lang(dto.detected_source_lang, source_lang);

    Ok(TranslationResult {
        source_message_id: source_message_id.to_string(),
        source_lang: src,
        target_lang: target_lang.to_string(),
        translated_text: strip_css_boilerplate_lines(dto.translated_text.trim()),
        preserved_entity_ids: dto.preserved_entity_ids,
        budget: budget_report(n_ctx_hint, engine, system, user, Some(raw), text.chars().count() > 32_768),
    })
}

/// Traduit `text` vers `target_lang` (code court, ex. `fr`).
pub fn translate_plain_with_llm(
    engine: &mut LlmEngine,
    source_message_id: &str,
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult, LlmError> {
    let body = strip_css_boilerplate_lines(truncate_chars(text, 32_768).as_str());
    let user = format!(
        "Langue cible ISO 639-1 : {target_lang}\nLangue source indiquée (auto si inconnu): {source_lang}\n{}",
        untrusted_mail_for_engine(engine, "mail-translation", &body),
    );
    let system = system_translation(target_lang);

    let params = translation_gen_params(engine, system.as_str(), &user, &body);
    let raw = engine.generate_with_schema(
        system.as_str(),
        &user,
        &params,
        TRANSLATION_PLAIN_JSON_GBNF,
    )?;
    translation_from_raw(
        &raw,
        engine,
        system.as_str(),
        &user,
        source_message_id,
        source_lang,
        target_lang,
        text,
    )
}

/// Traduction avec fragments streamés (même JSON final que [`translate_plain_with_llm`]).
pub fn translate_plain_with_llm_streaming(
    engine: &mut LlmEngine,
    source_message_id: &str,
    text: &str,
    source_lang: &str,
    target_lang: &str,
    cancelled: &AtomicBool,
    mut on_chunk: impl FnMut(&str),
) -> Result<TranslationResult, LlmError> {
    let body = strip_css_boilerplate_lines(truncate_chars(text, 32_768).as_str());
    let user = format!(
        "Langue cible ISO 639-1 : {target_lang}\nLangue source indiquée (auto si inconnu): {source_lang}\n{}",
        untrusted_mail_for_engine(engine, "mail-translation", &body),
    );
    let system = system_translation(target_lang);
    let params = translation_gen_params(engine, system.as_str(), &user, &body);
    let raw = engine.generate_streaming_with_schema(
        system.as_str(),
        &user,
        &params,
        TRANSLATION_PLAIN_JSON_GBNF,
        |piece| -> ControlFlow<Result<(), Infallible>> {
            stream_chunk_or_cancel(cancelled, piece, &mut on_chunk)
        },
    )?;
    if let Some(e) = cancelled_llm_err(cancelled) {
        return Err(e);
    }
    translation_from_raw(
        &raw,
        engine,
        system.as_str(),
        &user,
        source_message_id,
        source_lang,
        target_lang,
        text,
    )
}

pub fn translation_stub_result(
    source_message_id: &str,
    source_lang: &str,
    target_lang: &str,
    text: &str,
) -> TranslationResult {
    use rustymail_domain::TokenBudgetReport;

    TranslationResult {
        source_message_id: source_message_id.to_string(),
        source_lang: source_lang.to_string(),
        target_lang: target_lang.to_string(),
        translated_text: text.to_string(),
        preserved_entity_ids: Vec::new(),
        budget: TokenBudgetReport::empty_stub(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_detected_source_lang_rejects_prompt_placeholder() {
        assert_eq!(
            normalize_detected_source_lang(
                Some("fr or ISO code if known else empty string".into()),
                "auto"
            ),
            "auto"
        );
        assert_eq!(normalize_detected_source_lang(Some("en".into()), "auto"), "en");
        assert_eq!(normalize_detected_source_lang(Some("".into()), "auto"), "auto");
    }

    #[test]
    fn strip_css_boilerplate_removes_outlook_rules() {
        let input = "Hello\n.outlook-group-fix { width: 100% !important; }\nWorld";
        assert_eq!(strip_css_boilerplate_lines(input), "Hello\nWorld");
    }
}
