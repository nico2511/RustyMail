use std::collections::HashSet;
use std::convert::Infallible;
use std::ops::ControlFlow;
use std::sync::atomic::AtomicBool;

use serde::Deserialize;

use crate::ai_llm_contracts::{validate_summary_llm_shape, SUMMARY_THREAD_JSON_GBNF};
use crate::ai_llm_util::{
    budget_report, cancelled_llm_err, gen_params_json_for_prompt, parse_model_json, stream_chunk_or_cancel,
    truncate_chars, untrusted_mail_for_engine,
};
use rustymail_domain::{DiscussionThreadView, Message, TokenBudgetReport};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct SummaryResult {
    pub title: String,
    pub bullets: Vec<String>,
    pub source_message_ids: Vec<String>,
    #[serde(default)]
    pub budget: TokenBudgetReport,
}

pub fn summarize_message(message: &Message) -> SummaryResult {
    let first_lines = message
        .plain_body
        .lines()
        .filter(|line| !line.trim().is_empty())
        .take(3)
        .map(|line| line.trim().to_string())
        .collect::<Vec<_>>();

    SummaryResult {
        title: message.subject.clone(),
        bullets: if first_lines.is_empty() {
            vec!["No readable content found.".to_string()]
        } else {
            first_lines
        },
        source_message_ids: vec![message.id.0.clone()],
        budget: TokenBudgetReport::empty_stub(),
    }
}

/// Réponse courte quand le fil est classé « expéditeur automatique » : pas de parcours « synthèse » sur le corps
/// (aujourd’hui module local ; prêt pour ignorer un futur résumé IA sur ce type d’envoi).
pub fn newsletter_light_summary(thread: &DiscussionThreadView) -> SummaryResult {
    SummaryResult {
        title: thread.subject.clone(),
        bullets: vec![
            "Fil détecté comme envoi automatique (noreply, notification, etc.) : pas d’aperçu synthétique pour ce message."
                .to_string(),
        ],
        source_message_ids: thread
            .messages
            .iter()
            .map(|message| message.message_id.clone())
            .collect(),
        budget: TokenBudgetReport::empty_stub(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SummaryLlmDto {
    #[serde(default)]
    title: String,
    #[serde(default)]
    bullets: Vec<String>,
    #[serde(default)]
    source_message_ids: Vec<String>,
}

fn transcript_for_summary(view: &DiscussionThreadView) -> String {
    let mut parts = Vec::with_capacity(view.messages.len().min(42) + 1);
    parts.push(format!("Sujet du fil : {}\n", view.subject));
    for message in view.messages.iter().take(40) {
        parts.push(format!(
            "[message_id={}] {}\n{}\n",
            message.message_id,
            message.sender,
            truncate_chars(message.cleaned_text.as_str(), 4000),
        ));
    }
    parts.join("\n")
}

fn filter_evidence(ids: &[String], view: &DiscussionThreadView) -> Vec<String> {
    let ok: HashSet<&str> = view
        .messages
        .iter()
        .map(|m| m.message_id.as_str())
        .collect();
    ids.iter()
        .filter(|id| ok.contains(id.as_str()))
        .cloned()
        .take(20)
        .collect()
}

fn summary_system(lang: &str) -> String {
    let ctx = crate::prompts::PromptCtx::from_language(lang);
    crate::prompts::system_prompt("summary", &ctx).unwrap_or_default()
}

fn summary_from_raw(
    raw: &str,
    view: &DiscussionThreadView,
    engine: &mut LlmEngine,
    system: &str,
    user: &str,
) -> Result<SummaryResult, LlmError> {
    let dto: SummaryLlmDto = match parse_model_json(raw) {
        Ok(d) => d,
        Err(parse_err) => {
            let trimmed = raw.trim();
            if !trimmed.is_empty() && trimmed.len() >= 24 {
                let mut fallback = summarize_thread(view);
                fallback.title = view.subject.clone();
                let excerpt = trimmed.chars().take(400).collect::<String>();
                if fallback.bullets.is_empty()
                    || fallback.bullets.iter().all(|b| b.contains("No readable"))
                {
                    fallback.bullets = vec![excerpt];
                } else {
                    fallback
                        .bullets
                        .insert(0, format!("(extrait modèle) {}", excerpt));
                }
                fallback.budget = budget_report(
                    engine.n_ctx(),
                    engine,
                    system,
                    user,
                    Some(raw),
                    user.contains("[tronqué]"),
                );
                fallback.budget.strategy =
                    format!("local_llm_summary:fallback_text:{}", parse_err);
                return Ok(fallback);
            }
            return Err(LlmError::InvalidJson(parse_err.to_string()));
        }
    };

    validate_summary_llm_shape(&dto.title, &dto.bullets, &dto.source_message_ids)?;

    let title = dto
        .title
        .trim()
        .chars()
        .take(260)
        .collect::<String>();
    let title_resolved = if title.is_empty() {
        view.subject.clone()
    } else {
        title
    };

    let mut bullets = dto.bullets;
    bullets.retain_mut(|s| !s.trim().is_empty());
    for b in bullets.iter_mut().take(8) {
        *b = b.trim().chars().take(300).collect();
    }
    if bullets.len() > 8 {
        bullets.truncate(8);
    }
    let bullets_fin = if bullets.is_empty() {
        summarize_thread(view).bullets
    } else {
        bullets
    };

    let evid = filter_evidence(&dto.source_message_ids, view);
    let source_message_ids = if evid.is_empty() {
        view.messages
            .iter()
            .map(|message| message.message_id.clone())
            .collect::<Vec<_>>()
    } else {
        evid
    };

    let mut out = SummaryResult {
        title: title_resolved,
        bullets: bullets_fin,
        source_message_ids,
        budget: budget_report(
            engine.n_ctx(),
            engine,
            system,
            user,
            Some(raw),
            user.contains("[tronqué]"),
        ),
    };
    let n_seen = dto.source_message_ids.len().min(view.messages.len());
    out.budget.strategy = format!("local_llm_summary:{n_seen}");
    Ok(out)
}

/// Synthèse courte du fil avec le LLM local (réponse JSON puis normalisation).
pub fn summarize_thread_with_llm(
    view: &DiscussionThreadView,
    engine: &mut LlmEngine,
    output_language: &str,
) -> Result<SummaryResult, LlmError> {
    let system = summary_system(output_language);
    let user = untrusted_mail_for_engine(engine, "thread-summary", &transcript_for_summary(view));
    let params = gen_params_json_for_prompt(engine, system.as_str(), &user, 512, 4096);
    let raw = engine.generate_with_schema(system.as_str(), &user, &params, SUMMARY_THREAD_JSON_GBNF)?;
    summary_from_raw(&raw, view, engine, system.as_str(), &user)
}

/// Même sortie que [`summarize_thread_with_llm`] avec émission de fragments pendant la génération.
pub fn summarize_thread_with_llm_streaming(
    view: &DiscussionThreadView,
    engine: &mut LlmEngine,
    output_language: &str,
    cancelled: &AtomicBool,
    mut on_chunk: impl FnMut(&str),
) -> Result<SummaryResult, LlmError> {
    let system = summary_system(output_language);
    let user = untrusted_mail_for_engine(engine, "thread-summary", &transcript_for_summary(view));
    let params = gen_params_json_for_prompt(engine, system.as_str(), &user, 512, 4096);
    let raw = engine.generate_streaming_with_schema(
        system.as_str(),
        &user,
        &params,
        SUMMARY_THREAD_JSON_GBNF,
        |piece| -> ControlFlow<Result<(), Infallible>> {
            stream_chunk_or_cancel(cancelled, piece, &mut on_chunk)
        },
    )?;
    if let Some(e) = cancelled_llm_err(cancelled) {
        return Err(e);
    }
    summary_from_raw(&raw, view, engine, system.as_str(), &user)
}

pub fn summarize_thread(thread: &DiscussionThreadView) -> SummaryResult {
    let mut bullets = Vec::new();
    for message in thread.messages.iter().take(5) {
        let content = message
            .cleaned_text
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("No readable content found.")
            .trim();
        bullets.push(format!("{}: {}", message.sender, content));
    }

    SummaryResult {
        title: thread.subject.clone(),
        bullets,
        source_message_ids: thread
            .messages
            .iter()
            .map(|message| message.message_id.clone())
            .collect(),
        budget: TokenBudgetReport::empty_stub(),
    }
}
