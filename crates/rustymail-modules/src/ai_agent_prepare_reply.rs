use std::convert::Infallible;
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};

use crate::ai_assist_facts::{facts_block_for_draft, sender_proposes_meeting};
use crate::ai_assist_thread::facts_support_scheduling;
use crate::ai_llm_contracts::{ensure_reply_draft_output, introduces_llm_meta};
use crate::ai_llm_util::{
    budget_report, cancelled_llm_err, gen_params_json_for_prompt, gen_params_text_for_prompt,
    parse_model_json, truncate_chars,
};
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
    /// Acte de langage dirigé : voir `SPEECH_ACTS`. Vide = inconnu (anciens caches / clients).
    #[serde(default)]
    pub speech_act: String,
}

/// Actes de langage dirigés pour l’intention (qui doit agir, vu du propriétaire de la boîte).
pub const SPEECH_ACTS: &[&str] = &[
    "sender_proposes_meeting",
    "owner_must_propose",
    "sender_requests_info",
    "sender_informs",
    "owner_must_confirm",
    "other",
];

fn normalize_speech_act(raw: &str) -> String {
    let v = raw.trim().to_ascii_lowercase().replace([' ', '-'], "_");
    if SPEECH_ACTS.contains(&v.as_str()) {
        v
    } else {
        String::new()
    }
}

/// Consigne de rôle pour le brouillon selon l’acte de langage (vide si rien de spécifique).
fn speech_act_draft_note(speech_act: &str) -> &'static str {
    match speech_act {
        "sender_proposes_meeting" => {
            "\nL’expéditeur PROPOSE un rendez-vous / une intervention (date ou créneau déjà donné). Tu es le propriétaire de la boîte : accepte, confirme ou pose une question de précision (heure, accès, durée). Interdiction : remercier l’expéditeur de « nous informer » et lui demander ses disponibilités ou une date."
        }
        "owner_must_propose" => {
            "\nC’est à toi (propriétaire de la boîte) de proposer un rendez-vous ou des disponibilités à l’expéditeur."
        }
        "sender_requests_info" => {
            "\nL’expéditeur te demande une information : réponds-lui directement (tu es le propriétaire de la boîte)."
        }
        "owner_must_confirm" => {
            "\nL’expéditeur attend ta confirmation (tu es le propriétaire de la boîte) : confirme ou précise."
        }
        _ => "",
    }
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
    #[serde(default)]
    speech_act: String,
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
    let facts_hint = prior_facts.map(facts_block_for_draft).unwrap_or_default();
    let hint = prior_intent
        .map(|i| {
            format!(
                "\nIntention détectée : {}\nTon suggéré : {}\nPréférence utilisateur : {}{facts_hint}",
                i.intent, i.tone_hint, tone
            )
        })
        .unwrap_or_else(|| format!("\nPréférence utilisateur : {tone}{facts_hint}"));
    let intent_needs_scheduling = prior_intent.map(|i| i.needs_scheduling).unwrap_or(false);
    let sender_proposes = sender_proposes_meeting(prior_intent, prior_facts);
    let speech_act = if sender_proposes {
        "sender_proposes_meeting"
    } else {
        prior_intent.map(|i| i.speech_act.trim()).unwrap_or("")
    };
    let role_note = speech_act_draft_note(speech_act);
    let scheduling_note = if sender_proposes {
        // L’expéditeur a déjà proposé : pas de « disponibilité générale » ni de demande de date.
        ""
    } else if intent_needs_scheduling && facts_support_scheduling(prior_facts) {
        "\nLe fil demande un rendez-vous : si des créneaux horaires précis seront proposés à l’étape suivante, limite-toi à l’accord de principe (disponibilité générale) sans lister jours/heures dans ce brouillon."
    } else {
        "\nInterdiction : ne propose pas de rendez-vous, d’appel, de créneaux horaires, ni de demande de date/heure si les faits établis ne mentionnent pas explicitement une planification de rendez-vous/réunion/appel."
    };
    let lang = crate::prompts::normalize_output_language(draft_language);
    let mut system = crate::prompts::system_prompt_for_language("agent_draft", &lang);
    system = system.replace("{draft_language}", draft_language.trim());
    let system = format!("{system}{scheduling_note}{role_note}");
    let user = format!(
        "Rôle : tu es le destinataire du fil (propriétaire de la boîte, « vous » dans le fil = toi). Rédige ta réponse au dernier expéditeur entrant.\n\
Interdiction : ne reformule pas leur message, ne signe pas à leur place, ne réécris pas leur lettre.\n\
Contexte fil :\n{ctx}{hint}"
    );
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
    let mut streamed = String::new();
    // Budget de réponse courte (pas un echo de la longueur du fil — sinon le modèle réécrit le mail).
    let raw = engine.generate_streaming(
        system.as_str(),
        &user,
        &gen_params_text_for_prompt(engine, system.as_str(), &user, 320, 1_200),
        |piece| -> ControlFlow<Result<(), Infallible>> {
            if cancelled.load(Ordering::Relaxed) {
                return ControlFlow::Break(Ok(()));
            }
            streamed.push_str(piece);
            if introduces_llm_meta(thread_context, &streamed) {
                return ControlFlow::Break(Ok(()));
            }
            on_chunk(piece);
            ControlFlow::Continue(())
        },
    )?;
    if let Some(e) = cancelled_llm_err(cancelled) {
        return Err(e);
    }
    let draft = ensure_reply_draft_output(thread_context, raw.trim())?;
    let draft: String = draft.chars().take(8000).collect();
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
    let tz = if tz.is_empty() { "Europe/Paris" } else { tz };
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
                    speech_act: normalize_speech_act(&dto.speech_act),
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

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::AssistFact;

    fn intent(act: &str) -> AgentIntentResult {
        AgentIntentResult {
            intent: "Le prestataire propose le nettoyage de la chaudière".into(),
            tone_hint: "neutral".into(),
            needs_scheduling: true,
            speech_act: act.into(),
        }
    }

    #[test]
    fn speech_act_is_normalized_to_known_values() {
        assert_eq!(
            normalize_speech_act(" Sender-Proposes Meeting "),
            "sender_proposes_meeting"
        );
        assert_eq!(normalize_speech_act("owner_must_propose"), "owner_must_propose");
        assert_eq!(normalize_speech_act("whatever"), "");
    }

    #[test]
    fn intent_without_speech_act_deserializes() {
        let i: AgentIntentResult =
            serde_json::from_str(r#"{"intent":"x","toneHint":"neutral","needsScheduling":false}"#)
                .unwrap();
        assert_eq!(i.speech_act, "");
    }

    #[test]
    fn draft_prompt_guides_accept_or_clarify_when_sender_proposes() {
        let mut fact = AssistFact::new("proposal", "Nettoyage le mercredi 18 novembre le matin");
        fact.actor = Some("sender".into());
        fact.actor_role = Some("proposer".into());
        let facts = AssistFactsSnapshot {
            facts: vec![fact],
            ambiguities: vec![],
            confidence: 0.9,
        };
        let i = intent("sender_proposes_meeting");
        let (system, user) = draft_reply_prompts(
            "[message_id=m1] ...",
            Some(&i),
            "fr",
            &AssistUserPrefs::default(),
            Some(&facts),
        );
        assert!(system.contains("PROPOSE"));
        assert!(system.contains("accepte, confirme"));
        assert!(!system.contains("disponibilité générale"));
        assert!(user.contains("(sender/proposer)"));
    }

    #[test]
    fn draft_prompt_owner_must_propose_has_no_inversion_note() {
        let i = intent("owner_must_propose");
        let (system, _) = draft_reply_prompts(
            "[message_id=m1] ...",
            Some(&i),
            "fr",
            &AssistUserPrefs::default(),
            None,
        );
        assert!(system.contains("C’est à toi"));
        assert!(!system.contains("PROPOSE un rendez-vous"));
    }
}
