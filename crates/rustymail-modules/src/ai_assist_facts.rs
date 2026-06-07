//! Extraction de faits vérifiables et contrôle de cohérence brouillon ↔ fil.

use serde::Deserialize;

use crate::ai_agent_prepare_reply::AgentIntentResult;
use crate::ai_llm_util::{gen_params_json_for_prompt, parse_model_json, truncate_chars};
use rustymail_domain::{AssistFact, AssistFactsSnapshot, AssistUserPrefs};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FactsDto {
    #[serde(default)]
    facts: Vec<FactIn>,
    #[serde(default)]
    ambiguities: Vec<String>,
    #[serde(default)]
    clarification_questions: Vec<String>,
    #[serde(default)]
    confidence: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FactIn {
    kind: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    message_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConsistencyDto {
    #[serde(default)]
    aligned: bool,
    #[serde(default)]
    issues: Vec<String>,
    #[serde(default)]
    safety_flags: Vec<String>,
}

const VALID_KINDS: &[&str] = &["request", "deadline", "actor", "obligation"];

fn sanitize_facts(raw: Vec<FactIn>, transcript: &str) -> Vec<AssistFact> {
    let mut out = Vec::new();
    for f in raw.into_iter().take(24) {
        let kind = f.kind.trim().to_ascii_lowercase();
        if !VALID_KINDS.contains(&kind.as_str()) {
            continue;
        }
        let text = f.text.trim();
        if text.is_empty() || text.chars().count() > 400 {
            continue;
        }
        let message_ids: Vec<String> = f
            .message_ids
            .into_iter()
            .filter(|id| transcript.contains(id.as_str()))
            .take(6)
            .collect();
        out.push(AssistFact {
            kind,
            text: text.to_string(),
            message_ids,
        });
    }
    out
}

fn clip_questions(raw: Vec<String>) -> Vec<String> {
    raw.into_iter()
        .map(|q| q.trim().chars().take(280).collect::<String>())
        .filter(|q| !q.is_empty())
        .take(5)
        .collect()
}

pub struct ExtractFactsOutput {
    pub snapshot: AssistFactsSnapshot,
    pub clarification_questions: Vec<String>,
}

/// Extrait faits + ambiguïtés depuis le fil (messageId présents dans le transcript).
pub fn extract_facts_with_llm(
    engine: &mut LlmEngine,
    thread_context: &str,
    prior_intent: Option<&AgentIntentResult>,
    user_prefs: &AssistUserPrefs,
) -> Result<ExtractFactsOutput, LlmError> {
    let lang = user_prefs.lang.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let ctx = truncate_chars(thread_context, 24_000);
    let intent_hint = prior_intent
        .map(|i| format!("\nIntention déjà détectée : {}", i.intent))
        .unwrap_or_default();
    let system = crate::prompts::system_prompt_for_language("assist_facts", lang);
    let user = format!("Fil :\n{ctx}{intent_hint}");
    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_json_for_prompt(engine, system.as_str(), &user, 768, 4096),
    )?;
    let dto: FactsDto = parse_model_json(&raw)?;
    let facts = sanitize_facts(dto.facts, &ctx);
    let ambiguities = clip_questions(dto.ambiguities);
    let mut clarification_questions = clip_questions(dto.clarification_questions);
    if clarification_questions.is_empty() && !ambiguities.is_empty() {
        clarification_questions = ambiguities
            .iter()
            .map(|a| format!("Pouvez-vous préciser : {a} ?"))
            .take(3)
            .collect();
    }
    let confidence = dto.confidence.clamp(0.0, 1.0);
    let snapshot = AssistFactsSnapshot {
        facts,
        ambiguities,
        confidence,
    };
    Ok(ExtractFactsOutput {
        snapshot,
        clarification_questions,
    })
}

pub struct ConsistencyOutput {
    pub aligned: bool,
    pub issues: Vec<String>,
    pub safety_flags: Vec<String>,
}

/// Vérifie que le brouillon ne contredit pas les faits extraits.
pub fn consistency_check_with_llm(
    engine: &mut LlmEngine,
    thread_context: &str,
    facts: &AssistFactsSnapshot,
    draft: &str,
    user_prefs: &AssistUserPrefs,
) -> Result<ConsistencyOutput, LlmError> {
    let lang = user_prefs.lang.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let ctx = truncate_chars(thread_context, 12_000);
    let draft_clip = truncate_chars(draft, 8000);
    let facts_json = serde_json::to_string(facts).unwrap_or_else(|_| "{}".into());
    let system = crate::prompts::system_prompt_for_language("assist_consistency", lang);
    let user = format!(
        "FIL :\n{ctx}\n\nFAITS :\n{facts_json}\n\nBROUILLON :\n{draft_clip}"
    );
    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_json_for_prompt(engine, system.as_str(), &user, 256, 1536),
    )?;
    let dto: ConsistencyDto = parse_model_json(&raw)?;
    let issues: Vec<String> = dto
        .issues
        .into_iter()
        .map(|s| s.trim().chars().take(320).collect())
        .filter(|s: &String| !s.is_empty())
        .take(6)
        .collect();
    let safety_flags: Vec<String> = dto
        .safety_flags
        .into_iter()
        .map(|s| s.trim().chars().take(64).collect())
        .filter(|s: &String| !s.is_empty())
        .take(8)
        .collect();
    Ok(ConsistencyOutput {
        aligned: dto.aligned && issues.is_empty(),
        issues,
        safety_flags,
    })
}

pub fn facts_block_for_draft(facts: &AssistFactsSnapshot) -> String {
    if facts.facts.is_empty() {
        return String::new();
    }
    let mut lines = vec!["\nFaits établis (ne pas contredire) :".to_string()];
    for f in facts.facts.iter().take(16) {
        lines.push(format!("- [{}] {}", f.kind, f.text));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_drops_invalid_kind() {
        let raw = vec![
            FactIn {
                kind: "fantasy".into(),
                text: "x".into(),
                message_ids: vec![],
            },
            FactIn {
                kind: "request".into(),
                text: "Envoyer le devis".into(),
                message_ids: vec!["m1".into()],
            },
        ];
        let out = sanitize_facts(raw, "message_id=m1");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, "request");
    }
}
