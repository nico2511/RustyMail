use serde::Deserialize;

use crate::ai_llm_contracts::{
    introduces_llm_meta, validate_quick_replies_shape, MAIL_BODY_META_ERR,
};
use crate::ai_llm_util::{
    budget_report, gen_params_json_for_prompt, parse_model_json, truncate_chars,
    untrusted_mail_for_engine,
};
use rustymail_domain::QuickRepliesResult;
use rustymail_llm::{LlmEngine, LlmError};

const QUICK_REPLY_TONES: &[&str] = &["neutral", "formal", "warm", "direct"];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuickPack {
    suggestions: Vec<rustymail_domain::QuickReplySuggestion>,
}

/// Un seul enum anglais ; tolère concaténations du modèle (`NEUTRALFORMAL`) et alias FR.
pub(crate) fn normalize_quick_reply_tone(raw: &str) -> String {
    let v = raw.trim().to_ascii_lowercase().replace([' ', '-', '_'], "");
    if v.is_empty() {
        return "neutral".into();
    }
    for t in QUICK_REPLY_TONES {
        if v == *t || v.starts_with(t) {
            return (*t).into();
        }
    }
    match v.as_str() {
        "neutre" => "neutral".into(),
        "formel" | "formelle" => "formal".into(),
        "chaleureux" | "chaleureuse" => "warm".into(),
        "directe" => "direct".into(),
        _ => "neutral".into(),
    }
}

pub fn quick_replies_with_llm(
    engine: &mut LlmEngine,
    thread_context: Option<&str>,
    output_language: &str,
) -> Result<QuickRepliesResult, LlmError> {
    let ctx = thread_context
        .map(|s| truncate_chars(s, 24_000))
        .unwrap_or_default();

    let system = crate::prompts::system_prompt_for_language("quick_reply", output_language);
    let user = if ctx.is_empty() {
        "Aucune conversation donnée ; propose quand même 4 formulations générales de réponses polies type « merci », « bien reçu », « je reviens vers vous », etc.".to_string()
    } else {
        let body = untrusted_mail_for_engine(engine, "quick-reply-context", &ctx);
        format!(
            "Rôle : tu es le propriétaire de la boîte. Propose 4 réponses courtes au dernier message entrant.\n\
Interdiction : ne reformule pas leur message, ne signe pas à leur place.\n\
Fil :\n{body}"
        )
    };

    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_json_for_prompt(engine, system.as_str(), &user, 256, 1024),
    )?;
    let dto: QuickPack = parse_model_json(&raw)?;
    validate_quick_replies_shape(&dto.suggestions, |s| (&s.text, &s.tone, &s.rationale))?;

    let mut suggestions: Vec<_> = dto
        .suggestions
        .into_iter()
        .take(6)
        .map(|mut s| {
            s.text = s.text.trim().chars().take(400).collect();
            s.tone = normalize_quick_reply_tone(&s.tone);
            s.rationale = s.rationale.trim().chars().take(160).collect();
            s
        })
        .filter(|s| !s.text.is_empty())
        .collect();

    let mut saw_meta = false;
    suggestions.retain(|s| {
        if introduces_llm_meta(&ctx, &s.text) {
            saw_meta = true;
            false
        } else {
            true
        }
    });
    if suggestions.is_empty() && saw_meta {
        return Err(LlmError::Msg(MAIL_BODY_META_ERR.into()));
    }

    if suggestions.len() > 4 {
        suggestions.truncate(4);
    }

    Ok(QuickRepliesResult {
        suggestions,
        budget: budget_report(
            engine.n_ctx(),
            engine,
            system.as_str(),
            &user,
            Some(raw.as_str()),
            thread_context
                .map(|s| s.chars().count() > 24_000)
                .unwrap_or(false),
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_tone_picks_first_enum_from_concat() {
        assert_eq!(normalize_quick_reply_tone("NEUTRALFORMAL"), "neutral");
        assert_eq!(normalize_quick_reply_tone("formal-warm"), "formal");
        assert_eq!(normalize_quick_reply_tone("formel"), "formal");
        assert_eq!(normalize_quick_reply_tone(""), "neutral");
    }
}
