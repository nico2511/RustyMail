use serde::Deserialize;

use crate::ai_llm_contracts::validate_quick_replies_shape;
use crate::ai_llm_util::{
    budget_report, gen_params_json_for_prompt, parse_model_json, truncate_chars,
    untrusted_mail_for_engine,
};
use rustymail_domain::QuickRepliesResult;
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuickPack {
    suggestions: Vec<rustymail_domain::QuickReplySuggestion>,
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
        untrusted_mail_for_engine(engine, "quick-reply-context", &ctx)
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
            if s.tone.trim().is_empty() {
                s.tone = "neutre".into();
            }
            s.rationale = s.rationale.trim().chars().take(160).collect();
            s
        })
        .filter(|s| !s.text.is_empty())
        .collect();

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
