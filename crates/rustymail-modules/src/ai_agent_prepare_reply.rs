use std::convert::Infallible;
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};

use crate::ai_assist_facts::{facts_block_for_draft, sender_proposes_meeting};
use crate::ai_assist_thread::facts_support_scheduling;
use crate::ai_llm_contracts::{ensure_reply_draft_output, introduces_llm_meta};
use crate::ai_llm_util::{
    budget_report, cancelled_llm_err, generate_fil_json, gen_params_text,
    output_room_after_prompt, resolve_max_output_tokens, truncate_chars,
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
    /// Peut manquer si le JSON LLM est tronqué après réparation.
    #[serde(default)]
    intent: String,
    #[serde(default = "default_tone_hint")]
    tone_hint: String,
    #[serde(default)]
    needs_scheduling: bool,
    #[serde(default)]
    speech_act: String,
}

fn default_tone_hint() -> String {
    "neutral".into()
}

#[derive(Deserialize)]
struct SlotsDto {
    #[serde(default)]
    slots: Vec<String>,
}

const MIN_DRAFT_OUTPUT_ROOM: u32 = 320;
const DRAFT_CTX_OVERFLOW_ERR: &str = "Brouillon impossible : fenêtre de contexte trop pleine. Augmentez n_ctx dans Paramètres → IA, ou ouvrez un fil plus court.";

fn draft_reply_prompts(
    engine: &LlmEngine,
    thread_context: &str,
    prior_intent: Option<&AgentIntentResult>,
    draft_language: &str,
    user_prefs: &AssistUserPrefs,
    prior_facts: Option<&AssistFactsSnapshot>,
) -> Result<(String, String, rustymail_llm::LlmGenParams), LlmError> {
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
    let system = system.trim().to_string();
    let prefix = "Rôle : tu es le destinataire du fil (propriétaire de la boîte, « vous » dans le fil = toi). Rédige ta réponse au dernier expéditeur entrant.\n\
Interdiction : ne reformule pas leur message, ne signe pas à leur place, ne réécris pas leur lettre.\n\
Contexte fil :\n";
    let mut max_chars = thread_context.chars().count().min(24_000).max(400);
    for _ in 0..24 {
        let ctx = truncate_chars(thread_context, max_chars);
        let user = format!("{prefix}{ctx}{hint}");
        let room = output_room_after_prompt(engine, system.as_str(), &user, 64);
        let max_tokens =
            resolve_max_output_tokens(engine, system.as_str(), &user, 320, 1_200, 64);
        if room >= MIN_DRAFT_OUTPUT_ROOM && max_tokens >= 128 {
            return Ok((system, user, gen_params_text(max_tokens)));
        }
        if max_chars <= 500 {
            return Err(LlmError::Msg(DRAFT_CTX_OVERFLOW_ERR.into()));
        }
        max_chars = (max_chars * 2 / 3).max(500);
    }
    Err(LlmError::Msg(DRAFT_CTX_OVERFLOW_ERR.into()))
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
    let (system, user, params) = draft_reply_prompts(
        engine,
        thread_context,
        prior_intent,
        draft_language,
        user_prefs,
        prior_facts,
    )?;
    let mut streamed = String::new();
    // Budget de réponse courte (pas un echo de la longueur du fil — sinon le modèle réécrit le mail).
    let raw = engine.generate_streaming(
        system.as_str(),
        &user,
        &params,
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
            let dto: IntentDto = generate_fil_json(
                engine,
                system.as_str(),
                &ctx,
                "Fil :\n",
                "",
                24_000,
                256,
                768,
            )?;
            let intent: String = dto.intent.trim().chars().take(600).collect();
            if intent.is_empty() {
                return Err(LlmError::InvalidJson(
                    "intention vide après parsing (réponse modèle inutilisable).".into(),
                ));
            }
            Ok(AgentStepResult {
                step,
                intent: Some(AgentIntentResult {
                    intent,
                    tone_hint: if dto.tone_hint.trim().is_empty() {
                        default_tone_hint()
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
            let dto: SlotsDto = generate_fil_json(
                engine,
                system.as_str(),
                &ctx,
                "Fil :\n",
                "\nPropose des créneaux pertinents pour répondre à la demande de rendez-vous.",
                24_000,
                256,
                768,
            )?;
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
    use crate::ai_llm_util::parse_model_json;
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
        assert_eq!(
            normalize_speech_act("owner_must_propose"),
            "owner_must_propose"
        );
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
    fn intent_dto_tolerates_truncated_json_missing_tone_hint() {
        // Truncation mid-`intent` after repair → missing toneHint / needsScheduling / speechAct.
        let partial = r#"{"intent":"ACTION DEPANNAGE propose le renouvellement du contrat"#;
        let dto: IntentDto = parse_model_json(partial).expect("repaired intent");
        assert!(!dto.intent.is_empty());
        assert_eq!(dto.tone_hint, "neutral");
        assert!(!dto.needs_scheduling);
        assert!(dto.speech_act.is_empty());
    }

    #[test]
    fn intent_dto_keeps_short_fields_when_intent_truncated() {
        let partial = r#"{"toneHint":"formal","needsScheduling":true,"speechAct":"sender_proposes_meeting","intent":"Le prestataire propose une intervention le"#;
        let dto: IntentDto = parse_model_json(partial).expect("repaired intent");
        assert_eq!(dto.tone_hint, "formal");
        assert!(dto.needs_scheduling);
        assert_eq!(dto.speech_act, "sender_proposes_meeting");
        assert!(dto.intent.contains("prestataire"));
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
        let mut engine = LlmEngine::open_ai_compatible(
            "http://127.0.0.1:8080/v1".into(),
            "test".into(),
            String::new(),
        )
        .expect("engine");
        engine.set_n_ctx_probe(8192);
        let (system, user, _) = draft_reply_prompts(
            &engine,
            "[message_id=m1] ...",
            Some(&i),
            "fr",
            &AssistUserPrefs::default(),
            Some(&facts),
        )
        .expect("fit");
        assert!(system.contains("PROPOSE"));
        assert!(system.contains("accepte, confirme"));
        assert!(!system.contains("disponibilité générale"));
        assert!(user.contains("(sender/proposer)"));
    }

    #[test]
    fn draft_prompt_owner_must_propose_has_no_inversion_note() {
        let i = intent("owner_must_propose");
        let mut engine = LlmEngine::open_ai_compatible(
            "http://127.0.0.1:8080/v1".into(),
            "test".into(),
            String::new(),
        )
        .expect("engine");
        engine.set_n_ctx_probe(8192);
        let (system, _, _) = draft_reply_prompts(
            &engine,
            "[message_id=m1] ...",
            Some(&i),
            "fr",
            &AssistUserPrefs::default(),
            None,
        )
        .expect("fit");
        assert!(system.contains("C’est à toi"));
        assert!(!system.contains("PROPOSE un rendez-vous"));
    }
}
