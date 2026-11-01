//! Skills optionnels phase 3 — actions, risques, ton.

use serde::Deserialize;

use crate::ai_agent_prepare_reply::AgentIntentResult;
use crate::ai_assist_thread::transcript_message_ids;
use crate::ai_llm_contracts::{assist_actions_json_schema, ensure_mail_body_output};
use crate::ai_llm_util::{
    gen_params_text_echo_for_prompt, generate_fil_json_ex, parse_model_json, truncate_chars,
    untrusted_mail_for_engine,
};
use rustymail_domain::{AssistRecommendation, AssistUserPrefs, MailSecuritySeverity};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActionItemsDto {
    #[serde(default)]
    actions: Vec<ActionIn>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActionIn {
    #[serde(default)]
    text: String,
    #[serde(default)]
    owner: String,
    #[serde(default, alias = "due_hint")]
    due_hint: String,
    #[serde(default)]
    message_ids: Option<Vec<String>>,
}

fn filter_message_ids(raw: Option<Vec<String>>, transcript: &str) -> Vec<String> {
    let allowed = transcript_message_ids(transcript);
    let mut out = Vec::new();
    for id in raw.into_iter().flatten() {
        let t = id.trim();
        if t.is_empty() || t == "[REDACTED_ID]" {
            continue;
        }
        if !allowed.contains(t) {
            continue;
        }
        if out.iter().any(|x: &String| x == t) {
            continue;
        }
        out.push(t.to_string());
        if out.len() >= 3 {
            break;
        }
    }
    out
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
    let hint = prior_intent
        .map(|i| format!("\nDetected intent: {}", i.intent))
        .unwrap_or_default();
    let system = crate::prompts::system_prompt_for_language("assist_actions", lang);
    // Light tier ≈ 512–4096 ; calage pour éviter max_tokens=1 sur fils longs.
    let dto: ActionItemsDto = generate_fil_json_ex(
        engine,
        system.as_str(),
        thread_context,
        "assist-actions-thread",
        "Fil :\n",
        &hint,
        20_000,
        512,
        4096,
        Some(assist_actions_json_schema()),
    )?
    .0;
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
            message_ids: filter_message_ids(a.message_ids, thread_context),
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
    let draft_block = untrusted_mail_for_engine(engine, "assist-tone-draft", &draft_clip);
    let user = format!("Brouillon à adapter :{hint}\n\n{draft_block}");
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
    let t = ensure_mail_body_output(draft, &t)?;
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

    #[test]
    fn action_dto_reads_due_hint_camel_and_snake() {
        let a: ActionIn =
            serde_json::from_str(r#"{"text":"T","owner":"me","dueHint":"demain"}"#).unwrap();
        assert_eq!(a.due_hint, "demain");
        let b: ActionIn = serde_json::from_str(r#"{"text":"T","due_hint":"lundi"}"#).unwrap();
        assert_eq!(b.due_hint, "lundi");
    }

    #[test]
    fn filter_message_ids_exact_match_only() {
        let tx = "[message_id=m1] x\n[message_id=m10] y\n[message_id=ok] z";
        assert!(filter_message_ids(Some(vec!["ok".into()]), tx).contains(&"ok".into()));
        assert!(filter_message_ids(Some(vec!["m10".into()]), tx).contains(&"m10".into()));
        assert!(filter_message_ids(Some(vec!["m1".into()]), "[message_id=m10] y").is_empty());
        assert!(filter_message_ids(Some(vec!["[REDACTED_ID]".into()]), tx).is_empty());
        assert!(filter_message_ids(Some(vec!["missing".into()]), tx).is_empty());
    }

    #[test]
    fn action_null_message_ids_is_unanchored() {
        let ids = filter_message_ids(None, "[message_id=a] x");
        assert!(ids.is_empty());
    }
}
