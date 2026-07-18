//! Skills optionnels phase 3 — actions, risques, ton.

use serde::Deserialize;

use crate::ai_agent_prepare_reply::AgentIntentResult;
use crate::ai_llm_util::{
    gen_params_for_tier, gen_params_text_echo_for_prompt, parse_model_json, truncate_chars,
};
use rustymail_domain::{
    AssistLlmTier, AssistRecommendation, AssistUserPrefs, MailSecuritySeverity,
};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Deserialize)]
struct ActionItemsDto {
    #[serde(default)]
    actions: Vec<ActionIn>,
}

#[derive(Deserialize)]
struct ActionIn {
    #[serde(default)]
    text: String,
    #[serde(default)]
    owner: String,
    #[serde(default)]
    due_hint: String,
}

/// Extrait actions / tâches du fil.
pub fn extract_action_items_with_llm(
    engine: &mut LlmEngine,
    thread_context: &str,
    prior_intent: Option<&AgentIntentResult>,
    user_prefs: &AssistUserPrefs,
) -> Result<Vec<AssistRecommendation>, LlmError> {
    let lang = user_prefs.lang.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let ctx = truncate_chars(thread_context, 20_000);
    let hint = prior_intent
        .map(|i| format!("\nDetected intent: {}", i.intent))
        .unwrap_or_default();
    let system = crate::prompts::system_prompt_for_language("assist_actions", lang);
    let user = format!("Fil :\n{ctx}{hint}");
    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_for_tier(engine, system.as_str(), &user, AssistLlmTier::Light),
    )?;
    let dto: ActionItemsDto = parse_model_json(&raw)?;
    let mut out = Vec::new();
    for a in dto.actions.into_iter().take(6) {
        let text = a.text.trim();
        if text.is_empty() || text.chars().count() > 280 {
            continue;
        }
        let detail = match (a.owner.trim(), a.due_hint.trim()) {
            (o, d) if !o.is_empty() && !d.is_empty() => format!("{o} · {d}"),
            (o, _) if !o.is_empty() => o.to_string(),
            (_, d) if !d.is_empty() => d.to_string(),
            _ => String::new(),
        };
        out.push(AssistRecommendation {
            kind: "action".into(),
            label: text.to_string(),
            detail,
        });
    }
    Ok(out)
}

/// Signaux de risque heuristiques agrégés sur le fil (sans LLM).
pub fn risk_flags_from_thread_security(
    per_message_codes: &[String],
    max_severity: Option<MailSecuritySeverity>,
) -> Vec<String> {
    let mut out: Vec<String> = per_message_codes
        .iter()
        .take(10)
        .map(|c| format!("mail_security:{c}"))
        .collect();
    if let Some(sev) = max_severity {
        if !matches!(sev, MailSecuritySeverity::Ok) {
            out.push(format!("thread_security:{sev:?}"));
        }
    }
    out
}

/// Ajuste le ton du brouillon selon préférence utilisateur.
pub fn adapt_draft_tone_with_llm(
    engine: &mut LlmEngine,
    draft: &str,
    user_prefs: &AssistUserPrefs,
    intent_tone: Option<&str>,
) -> Result<String, LlmError> {
    let lang = user_prefs.lang.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let tone = user_prefs.tone.trim();
    let tone = if tone.is_empty() { "neutre" } else { tone };
    let hint = intent_tone
        .filter(|t| !t.is_empty())
        .map(|t| format!("\nTone detected in thread: {t}"))
        .unwrap_or_default();
    let draft_clip = truncate_chars(draft, 8000);
    let mut system = crate::prompts::system_prompt_for_language("assist_tone", lang);
    system = system.replace("{tone}", tone);
    let user = format!("Brouillon à adapter :{hint}\n\n{draft_clip}");
    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_text_echo_for_prompt(engine, system.as_str(), &user, &draft_clip, 1024, 8192),
    )?;
    let t = if raw.trim_start().starts_with('{') {
        #[derive(Deserialize)]
        struct ToneDto {
            #[serde(default)]
            text: String,
        }
        parse_model_json::<ToneDto>(&raw)
            .map(|d| d.text)
            .unwrap_or_else(|_| raw.trim().to_string())
    } else {
        raw.trim().to_string()
    };
    if t.is_empty() {
        return Ok(draft.to_string());
    }
    Ok(t.chars().take(8000).collect())
}

pub fn merge_recommendations(
    base: &mut Vec<AssistRecommendation>,
    extra: Vec<AssistRecommendation>,
) {
    for r in extra {
        if base.iter().any(|b| b.kind == r.kind && b.label == r.label) {
            continue;
        }
        base.push(r);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::MailSecuritySeverity;

    #[test]
    fn risk_flags_include_severity() {
        let flags = risk_flags_from_thread_security(
            &["phishing_hint".into()],
            Some(MailSecuritySeverity::Suspicion),
        );
        assert!(flags.iter().any(|f| f.contains("phishing_hint")));
        assert!(flags.iter().any(|f| f.contains("thread_security")));
    }
}
