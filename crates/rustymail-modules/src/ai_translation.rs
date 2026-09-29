//! Traduction via LLM locale.

use serde::Deserialize;

use std::convert::Infallible;
use std::ops::ControlFlow;
use std::sync::atomic::AtomicBool;

use crate::ai_llm_contracts::{
    introduces_llm_meta, validate_translation_llm_shape, TRANSLATION_PLAIN_JSON_GBNF,
};
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
    let dto: TranslationLlmDto = parse_model_json(raw)?;
    let translated_raw = dto.translated_text.trim().to_string();
    validate_translation_llm_shape(
        &translated_raw,
        &dto.preserved_entity_ids,
        dto.detected_source_lang.as_deref(),
    )?;
    if introduces_llm_meta(text, &translated_raw) {
        return Err(LlmError::InvalidJson("meta-leak".into()));
    }
    let n_ctx_hint = engine.n_ctx();
    let src = normalize_detected_source_lang(dto.detected_source_lang, source_lang);

    Ok(TranslationResult {
        source_message_id: source_message_id.to_string(),
        source_lang: src,
        target_lang: target_lang.to_string(),
        translated_text: strip_css_boilerplate_lines(&translated_raw),
        preserved_entity_ids: dto.preserved_entity_ids,
        budget: budget_report(
            n_ctx_hint,
            engine,
            system,
            user,
            Some(raw),
            text.chars().count() > 32_768,
        ),
    })
}

const TRANSLATION_META_ERR: &str =
    "Traduction refusée : le modèle a renvoyé une consigne au lieu du message traduit.";
const TRANSLATION_PARSE_ERR: &str =
    "Traduction impossible : la réponse du modèle n’était pas un JSON exploitable.";
const TRANSLATION_SHORT_ERR: &str =
    "Traduction refusée : la réponse est anormalement plus courte que le message. Le texte n’a pas été remplacé.";
const TRANSLATION_CHUNK_CHARS: usize = 1_600;

fn paragraph_chunks(text: &str) -> Vec<String> {
    let mut chunks = Vec::new();
    for para in text.split("\n\n") {
        let para = para.trim();
        if para.is_empty() {
            continue;
        }
        if para.chars().count() <= TRANSLATION_CHUNK_CHARS {
            chunks.push(para.to_string());
        } else {
            chunks.extend(split_oversized_paragraph(para, TRANSLATION_CHUNK_CHARS));
        }
    }
    if chunks.is_empty() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            chunks.push(trimmed.chars().take(TRANSLATION_CHUNK_CHARS).collect());
        }
    }
    chunks
}

fn split_oversized_paragraph(para: &str, max_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for part in sentence_pieces(para) {
        if part.chars().count() > max_chars && current.is_empty() {
            chunks.extend(hard_split_chars(&part, max_chars));
            continue;
        }
        if !current.is_empty() && current.chars().count() + part.chars().count() > max_chars {
            let ready = current.trim().to_string();
            if !ready.is_empty() {
                chunks.push(ready);
            }
            current.clear();
        }
        current.push_str(&part);
    }
    let tail = current.trim().to_string();
    if !tail.is_empty() {
        chunks.push(tail);
    }
    chunks
}

fn sentence_pieces(para: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    for c in para.chars() {
        buf.push(c);
        if matches!(c, '.' | '!' | '?' | '…') {
            out.push(std::mem::take(&mut buf));
        }
    }
    if !buf.is_empty() {
        out.push(buf);
    }
    out
}

fn hard_split_chars(text: &str, max_chars: usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    for c in text.chars() {
        buf.push(c);
        if buf.chars().count() >= max_chars {
            out.push(std::mem::take(&mut buf));
        }
    }
    if !buf.is_empty() {
        out.push(buf);
    }
    out
}

fn translation_abnormally_short(source: &str, translated: &str) -> bool {
    let s = source.chars().count();
    let t = translated.chars().count();
    if s < 400 {
        return false;
    }
    if t.saturating_mul(4) < s {
        return true;
    }
    let src_paras = source
        .split("\n\n")
        .filter(|p| !p.trim().is_empty())
        .count();
    let out_paras = translated
        .split("\n\n")
        .filter(|p| !p.trim().is_empty())
        .count();
    src_paras >= 3 && out_paras <= 1 && t.saturating_mul(2) < s
}

fn ensure_translation_length(source: &str, translated: &str) -> Result<(), LlmError> {
    if translation_abnormally_short(source, translated) {
        Err(LlmError::Msg(TRANSLATION_SHORT_ERR.into()))
    } else {
        Ok(())
    }
}

fn join_chunk_translations(
    mut parts: Vec<TranslationResult>,
    source_body: &str,
) -> Result<TranslationResult, LlmError> {
    let joined = parts
        .iter()
        .map(|p| p.translated_text.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    if introduces_llm_meta(source_body, &joined) {
        return Err(LlmError::Msg(TRANSLATION_META_ERR.into()));
    }
    ensure_translation_length(source_body, &joined)?;
    if parts.is_empty() {
        return Err(LlmError::Msg(TRANSLATION_PARSE_ERR.into()));
    }
    let mut head = parts.remove(0);
    let mut ids = head.preserved_entity_ids.clone();
    for extra in &parts {
        for id in &extra.preserved_entity_ids {
            if !ids.iter().any(|known| known == id) {
                ids.push(id.clone());
            }
        }
    }
    head.translated_text = joined;
    head.preserved_entity_ids = ids;
    Ok(head)
}

fn translation_user(
    engine: &LlmEngine,
    body: &str,
    source_lang: &str,
    target_lang: &str,
) -> String {
    format!(
        "Langue cible ISO 639-1 : {target_lang}\nLangue source indiquée (auto si inconnu): {source_lang}\nTraduis uniquement le message entre les délimiteurs. translatedText = cette traduction, sans consigne ni mention de JSON.\n{}",
        untrusted_mail_for_engine(engine, "mail-translation", body),
    )
}

fn map_translation_retry_err(err: LlmError) -> LlmError {
    match err {
        LlmError::InvalidJson(msg) if msg.contains("meta") => {
            LlmError::Msg(TRANSLATION_META_ERR.into())
        }
        LlmError::InvalidJson(msg) if msg.contains("EOF") => LlmError::Msg(format!(
            "Traduction impossible : la réponse du modèle est restée incomplète. Essayez un mail plus court. Détail : {msg}"
        )),
        LlmError::InvalidJson(_) => LlmError::Msg(TRANSLATION_PARSE_ERR.into()),
        other => other,
    }
}

fn translate_nonstream_body(
    engine: &mut LlmEngine,
    source_message_id: &str,
    body: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<TranslationResult, LlmError> {
    let system = system_translation(target_lang);
    let user = translation_user(engine, body, source_lang, target_lang);
    let params = translation_gen_params(engine, system.as_str(), &user, body);
    let raw = engine.generate_with_schema(
        system.as_str(),
        &user,
        &params,
        TRANSLATION_PLAIN_JSON_GBNF,
    )?;
    match translation_from_raw(
        &raw,
        engine,
        system.as_str(),
        &user,
        source_message_id,
        source_lang,
        target_lang,
        body,
    ) {
        Ok(res) => Ok(res),
        Err(LlmError::InvalidJson(_)) => {
            let user_retry = format!(
                "{user}\n\nRetry: one JSON object only. translatedText is the translation of the message and nothing else."
            );
            let params = translation_gen_params(engine, system.as_str(), &user_retry, body);
            let raw = engine.generate(system.as_str(), &user_retry, &params)?;
            translation_from_raw(
                &raw,
                engine,
                system.as_str(),
                &user_retry,
                source_message_id,
                source_lang,
                target_lang,
                body,
            )
            .map_err(map_translation_retry_err)
        }
        Err(e) => Err(e),
    }
}

fn translate_chunked(
    engine: &mut LlmEngine,
    source_message_id: &str,
    body: &str,
    source_lang: &str,
    target_lang: &str,
    cancelled: Option<&AtomicBool>,
) -> Result<TranslationResult, LlmError> {
    let chunks = paragraph_chunks(body);
    if chunks.len() <= 1 {
        let res =
            translate_nonstream_body(engine, source_message_id, body, source_lang, target_lang)?;
        ensure_translation_length(body, &res.translated_text)?;
        return Ok(res);
    }
    let mut parts = Vec::with_capacity(chunks.len());
    for chunk in &chunks {
        if let Some(flag) = cancelled {
            if let Some(e) = cancelled_llm_err(flag) {
                return Err(e);
            }
        }
        parts.push(translate_nonstream_body(
            engine,
            source_message_id,
            chunk,
            source_lang,
            target_lang,
        )?);
    }
    join_chunk_translations(parts, body)
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
    translate_chunked(
        engine,
        source_message_id,
        &body,
        source_lang,
        target_lang,
        None,
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
    if paragraph_chunks(&body).len() > 1 {
        return translate_chunked(
            engine,
            source_message_id,
            &body,
            source_lang,
            target_lang,
            Some(cancelled),
        );
    }
    let system = system_translation(target_lang);
    let user = translation_user(engine, &body, source_lang, target_lang);
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
    let res = match translation_from_raw(
        &raw,
        engine,
        system.as_str(),
        &user,
        source_message_id,
        source_lang,
        target_lang,
        text,
    ) {
        Ok(res) => res,
        Err(LlmError::InvalidJson(_)) => {
            if let Some(e) = cancelled_llm_err(cancelled) {
                return Err(e);
            }
            let user_retry = format!(
                "{user}\n\nRetry: one JSON object only. translatedText is the translation of the message and nothing else."
            );
            let params = translation_gen_params(engine, system.as_str(), &user_retry, &body);
            let raw = engine.generate(system.as_str(), &user_retry, &params)?;
            translation_from_raw(
                &raw,
                engine,
                system.as_str(),
                &user_retry,
                source_message_id,
                source_lang,
                target_lang,
                text,
            )
            .map_err(map_translation_retry_err)?
        }
        Err(e) => return Err(e),
    };
    ensure_translation_length(&body, &res.translated_text)?;
    Ok(res)
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
        assert_eq!(
            normalize_detected_source_lang(Some("en".into()), "auto"),
            "en"
        );
        assert_eq!(
            normalize_detected_source_lang(Some("".into()), "auto"),
            "auto"
        );
    }

    #[test]
    fn strip_css_boilerplate_removes_outlook_rules() {
        let input = "Hello\n.outlook-group-fix { width: 100% !important; }\nWorld";
        assert_eq!(strip_css_boilerplate_lines(input), "Hello\nWorld");
    }

    #[test]
    fn paragraph_chunks_keep_short_paragraphs() {
        let text = "Premier paragraphe.\n\nDeuxième paragraphe.";
        let chunks = paragraph_chunks(text);
        assert_eq!(
            chunks,
            vec![
                "Premier paragraphe.".to_string(),
                "Deuxième paragraphe.".to_string()
            ]
        );
    }

    #[test]
    fn paragraph_chunks_split_oversized_paragraph_on_sentences() {
        let sentence = "Phrase de test pour le découpage. ";
        let mut para = String::new();
        while para.chars().count() < 2_000 {
            para.push_str(sentence);
        }
        let chunks = paragraph_chunks(&para);
        assert!(chunks.len() >= 2, "chunks={}", chunks.len());
        assert!(chunks.iter().all(|c| c.chars().count() <= 1_600));
    }

    #[test]
    fn translation_short_detects_collapsed_body_and_ignores_greetings() {
        let src = "a".repeat(400);
        assert!(translation_abnormally_short(&src, &"b".repeat(50)));
        assert!(!translation_abnormally_short("Bonjour", "Hello"));
        let paras = format!(
            "{}\n\n{}\n\n{}",
            "x".repeat(200),
            "y".repeat(200),
            "z".repeat(200)
        );
        assert!(translation_abnormally_short(&paras, &"x".repeat(250)));
        let faithful = format!(
            "{}\n\n{}\n\n{}",
            "a".repeat(180),
            "b".repeat(180),
            "c".repeat(180)
        );
        assert!(!translation_abnormally_short(&paras, &faithful));
    }
}
