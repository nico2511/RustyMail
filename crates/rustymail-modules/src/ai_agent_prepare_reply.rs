use std::convert::Infallible;
use std::ops::ControlFlow;
use std::sync::atomic::AtomicBool;

use serde::{Deserialize, Serialize};

use crate::ai_llm_util::{
    budget_report, cancelled_llm_err, gen_params_json_for_prompt, gen_params_text_echo_for_prompt,
    parse_model_json, stream_chunk_or_cancel, truncate_chars,
};
use crate::ai_assist_facts::facts_block_for_draft;
use crate::ai_assist_thread::facts_support_scheduling;
use rustymail_domain::{AssistFactsSnapshot, AssistUserPrefs};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentPrepareReplyStep {
    AnalyzeIntent,
    DraftReply,
    SuggestSlots,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentIntentResult {
    pub intent: String,
    pub tone_hint: String,
    pub needs_scheduling: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDraftResult {
    pub draft: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSlotsResult {
    pub slots: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStepResult {
    pub step: AgentPrepareReplyStep,
    pub intent: Option<AgentIntentResult>,
    pub draft: Option<AgentDraftResult>,
    pub slots: Option<AgentSlotsResult>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntentDto {
    intent: String,
    tone_hint: String,
    needs_scheduling: bool,
}

#[derive(Deserialize)]
struct SlotsDto {
    slots: Vec<String>,
}

fn draft_reply_prompts(
    thread_context: &str,
    prior_intent: Option<&AgentIntentResult>,
    draft_language: &str,
    user_prefs: &AssistUserPrefs,
    prior_facts: Option<&AssistFactsSnapshot>,
) -> (String, String) {
    let ctx = truncate_chars(thread_context, 24_000);
    let tone = user_prefs.tone.trim();
    let tone = if tone.is_empty() { "neutre" } else { tone };
    let facts_hint = prior_facts
        .map(facts_block_for_draft)
        .unwrap_or_default();
    let hint = prior_intent
        .map(|i| {
            format!(
                "\nIntention détectée : {}\nTon suggéré : {}\nPréférence utilisateur : {}{facts_hint}",
                i.intent, i.tone_hint, tone
            )
        })
        .unwrap_or_else(|| format!("\nPréférence utilisateur : {tone}{facts_hint}"));
    let intent_needs_scheduling = prior_intent
        .map(|i| i.needs_scheduling)
        .unwrap_or(false);
    let scheduling_note = if intent_needs_scheduling && facts_support_scheduling(prior_facts) {
        "\nLe fil demande un rendez-vous : si des créneaux horaires précis seront proposés à l’étape suivante, limite-toi à l’accord de principe (disponibilité générale) sans lister jours/heures dans ce brouillon."
    } else {
        "\nInterdiction : ne propose pas de rendez-vous, d’appel, de créneaux horaires, ni de demande de date/heure si les faits établis ne mentionnent pas explicitement une planification de rendez-vous/réunion/appel."
    };
    let lang = crate::prompts::normalize_output_language(draft_language);
    let mut system = crate::prompts::system_prompt_for_language("agent_draft", &lang);
    system = system.replace("{draft_language}", draft_language.trim());
    let system = format!("{system}{scheduling_note}");
    let user = format!("Contexte fil :\n{ctx}{hint}");
    (system.trim().to_string(), user)
}

/// Brouillon étape 2 avec fragments streamés (même sortie que l’appel synchrone).
pub fn agent_draft_reply_streaming(
    engine: &mut LlmEngine,
    thread_context: &str,
    prior_intent: Option<&AgentIntentResult>,
    draft_language: &str,
    user_prefs: &AssistUserPrefs,
    prior_facts: Option<&AssistFactsSnapshot>,
    cancelled: &AtomicBool,
    mut on_chunk: impl FnMut(&str),
) -> Result<AgentDraftResult, LlmError> {
    let (system, user) = draft_reply_prompts(
        thread_context,
        prior_intent,
        draft_language,
        user_prefs,
        prior_facts,
    );
    let raw = engine.generate_streaming(
        system.as_str(),
        &user,
        &gen_params_text_echo_for_prompt(
            engine,
            system.as_str(),
            &user,
            thread_context,
            1024,
            8192,
        ),
        |piece| -> ControlFlow<Result<(), Infallible>> {
            stream_chunk_or_cancel(cancelled, piece, &mut on_chunk)
        },
    )?;
    if let Some(e) = cancelled_llm_err(cancelled) {
        return Err(e);
    }
    let draft = raw.trim().chars().take(8000).collect::<String>();
    let _ = budget_report(
        engine.n_ctx(),
        engine,
        system.as_str(),
        &user,
        Some(draft.as_str()),
        thread_context.chars().count() > 24_000,
    );
    Ok(AgentDraftResult { draft })
}

pub fn agent_prepare_reply_step(
    engine: &mut LlmEngine,
    step: AgentPrepareReplyStep,
    thread_context: &str,
    prior_intent: Option<&AgentIntentResult>,
    draft_language: &str,
    user_prefs: &AssistUserPrefs,
    prior_facts: Option<&AssistFactsSnapshot>,
) -> Result<AgentStepResult, LlmError> {
    let ctx = truncate_chars(thread_context, 24_000);
    let lang = draft_language.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let tz = user_prefs.timezone.trim();
    let tz = if tz.is_empty() {
        "Europe/Paris"
    } else {
        tz
    };
    match step {
        AgentPrepareReplyStep::AnalyzeIntent => {
            let system = crate::prompts::system_prompt_for_language("agent_intent", lang);
            let user = format!("Fil :\n{ctx}");
            let raw = engine.generate(
                system.as_str(),
                &user,
                &gen_params_json_for_prompt(engine, system.as_str(), &user, 256, 768),
            )?;
            let dto: IntentDto = parse_model_json(&raw)?;
            Ok(AgentStepResult {
                step,
                intent: Some(AgentIntentResult {
                    intent: dto.intent.trim().chars().take(600).collect(),
                    tone_hint: if dto.tone_hint.trim().is_empty() {
                        "neutre".into()
                    } else {
                        dto.tone_hint.trim().chars().take(40).collect()
                    },
                    needs_scheduling: dto.needs_scheduling,
                }),
                draft: None,
                slots: None,
            })
        }
        AgentPrepareReplyStep::DraftReply => {
            let draft = agent_draft_reply_streaming(
                engine,
                thread_context,
                prior_intent,
                draft_language,
                user_prefs,
                prior_facts,
                &AtomicBool::new(false),
                |_| {},
            )?;
            Ok(AgentStepResult {
                step,
                intent: None,
                draft: Some(draft),
                slots: None,
            })
        }
        AgentPrepareReplyStep::SuggestSlots => {
            let needs = prior_intent.map(|i| i.needs_scheduling).unwrap_or(false);
            if !needs {
                return Ok(AgentStepResult {
                    step,
                    intent: None,
                    draft: None,
                    slots: Some(AgentSlotsResult { slots: Vec::new() }),
                });
            }
            let mut system = crate::prompts::system_prompt_for_language("agent_slots", lang);
            system = system.replace("{timezone}", tz);
            let user = format!(
                "Fil :\n{ctx}\nPropose des créneaux pertinents pour répondre à la demande de rendez-vous."
            );
            let raw = engine.generate(
                system.as_str(),
                &user,
                &gen_params_json_for_prompt(engine, system.as_str(), &user, 256, 768),
            )?;
            let dto: SlotsDto = parse_model_json(&raw)?;
            let slots: Vec<String> = dto
                .slots
                .into_iter()
                .map(|s| s.trim().chars().take(120).collect())
                .filter(|s: &String| !s.is_empty())
                .take(6)
                .collect();
            Ok(AgentStepResult {
                step,
                intent: None,
                draft: None,
                slots: Some(AgentSlotsResult { slots }),
            })
        }
    }
}
