//! Orchestration assistance fil — routing skills, plan d’exécution, garde créneaux.

use std::time::Instant;

use rustymail_domain::{
    assist_clarification_threshold, AssistFactsSnapshot, AssistIntentSnapshot, AssistMode,
    AssistPhase, AssistPlannedStep, AssistRecommendation, AssistRequest, AssistResult,
    AssistRoutingPlan, AssistRunStep, AssistSkill, AssistUserPrefs, MailSecuritySeverity,
    ASSIST_SCHEMA_VERSION,
};
use rustymail_llm::{LlmEngine, LlmError};

use crate::ai_agent_prepare_reply::{
    agent_draft_reply_streaming, agent_prepare_reply_step, AgentDraftResult, AgentIntentResult,
    AgentPrepareReplyStep,
};
use crate::ai_assist_facts::{consistency_check_with_llm, extract_facts_with_llm};
use crate::ai_assist_skills::{
    adapt_draft_tone_with_llm, extract_action_items_with_llm, merge_recommendations,
    risk_flags_from_thread_security,
};

/// Contexte fil pour l’orchestrateur (transcript + signaux sécurité locaux).
pub struct AssistThreadContext {
    pub transcript: String,
    pub thread_security_codes: Vec<String>,
    pub thread_security_max: Option<MailSecuritySeverity>,
}

/// Skills activés par défaut si `enabled_skills` est vide.
pub fn default_enabled_skills(mode: AssistMode) -> Vec<AssistSkill> {
    match mode {
        AssistMode::Quick => vec![
            AssistSkill::AnalyzeIntent,
            AssistSkill::DraftReply,
            AssistSkill::ToneAdapter,
        ],
        AssistMode::Deep => vec![
            AssistSkill::AnalyzeIntent,
            AssistSkill::ExtractFacts,
            AssistSkill::ActionItems,
            AssistSkill::DraftReply,
            AssistSkill::ToneAdapter,
            AssistSkill::ConsistencyCheck,
            AssistSkill::SlotSuggestion,
        ],
        AssistMode::StrictSafe => vec![
            AssistSkill::AnalyzeIntent,
            AssistSkill::ExtractFacts,
            AssistSkill::ActionItems,
            AssistSkill::RiskFlagger,
            AssistSkill::DraftReply,
            AssistSkill::ToneAdapter,
            AssistSkill::ConsistencyCheck,
            AssistSkill::SlotSuggestion,
        ],
    }
}

pub fn resolved_enabled_skills(request: &AssistRequest) -> Vec<AssistSkill> {
    if request.enabled_skills.is_empty() {
        default_enabled_skills(request.assist_mode)
    } else {
        request.enabled_skills.clone()
    }
}

pub fn skill_enabled(request: &AssistRequest, skill: AssistSkill) -> bool {
    resolved_enabled_skills(request).contains(&skill)
}

/// Heuristique : le brouillon propose déjà des créneaux concrets.
pub fn draft_mentions_concrete_slots(draft: &str) -> bool {
    let t = draft.to_lowercase();
    let day = t.contains("lundi")
        || t.contains("mardi")
        || t.contains("mercredi")
        || t.contains("jeudi")
        || t.contains("vendredi")
        || t.contains("samedi")
        || t.contains("dimanche")
        || t.contains("lun ")
        || t.contains("mar ")
        || t.contains("mer ")
        || t.contains("jeu ")
        || t.contains("ven ");
    day && (t.contains('h') || t.contains("matin") || t.contains("après") || t.contains("soir"))
}

pub fn facts_support_scheduling(facts: Option<&AssistFactsSnapshot>) -> bool {
    let Some(facts) = facts else {
        return true;
    };
    facts.facts.iter().any(|f| {
        let text = f.text.to_lowercase();
        text.contains("rendez-vous")
            || text.contains("rdv")
            || text.contains("créneau")
            || text.contains("creneau")
            || text.contains("réunion")
            || text.contains("reunion")
            || text.contains("entretien")
            || text.contains("appel")
            || text.contains("visio")
            || text.contains("disponibil")
    })
}

pub fn should_run_slot_skill(
    request: &AssistRequest,
    intent: Option<&AssistIntentSnapshot>,
    draft: &str,
    facts: Option<&AssistFactsSnapshot>,
) -> bool {
    if !skill_enabled(request, AssistSkill::SlotSuggestion) {
        return false;
    }
    let needs = intent.map(|i| i.needs_scheduling).unwrap_or(false);
    if !needs {
        return false;
    }
    if !facts_support_scheduling(facts) {
        return false;
    }
    if draft_mentions_concrete_slots(draft) {
        return false;
    }
    true
}

/// Clarification recommandée : ambiguïtés ou confiance sous le seuil du mode.
pub fn needs_clarification_before_draft(
    request: &AssistRequest,
    facts: Option<&AssistFactsSnapshot>,
) -> bool {
    if request.assist_mode == AssistMode::Quick {
        return false;
    }
    let Some(f) = facts else {
        return false;
    };
    let threshold = assist_clarification_threshold(request.assist_mode);
    !f.ambiguities.is_empty() || f.confidence < threshold
}

pub fn assist_routing_plan(
    request: &AssistRequest,
    intent: Option<&AssistIntentSnapshot>,
    draft: &str,
    facts: Option<&AssistFactsSnapshot>,
) -> AssistRoutingPlan {
    let skills = resolved_enabled_skills(request);
    let mut steps = Vec::new();
    for skill in &skills {
        if *skill == AssistSkill::SlotSuggestion && !should_run_slot_skill(request, intent, draft, facts) {
            continue;
        }
        if *skill == AssistSkill::DraftReply && needs_clarification_before_draft(request, facts) {
            steps.push(AssistPlannedStep {
                skill: *skill,
                required: false,
            });
            continue;
        }
        let required = match skill {
            AssistSkill::AnalyzeIntent | AssistSkill::ExtractFacts | AssistSkill::DraftReply => true,
            AssistSkill::ActionItems
            | AssistSkill::RiskFlagger
            | AssistSkill::ToneAdapter
            | AssistSkill::ConsistencyCheck
            | AssistSkill::SlotSuggestion => false,
        };
        steps.push(AssistPlannedStep {
            skill: *skill,
            required,
        });
    }
    let offer_slot_step = steps.iter().any(|s| s.skill == AssistSkill::SlotSuggestion);
    let needs_clarification = needs_clarification_before_draft(request, facts);
    AssistRoutingPlan {
        assist_mode: request.assist_mode,
        steps,
        offer_slot_step,
        needs_clarification,
    }
}

pub fn phase_to_agent_step(phase: AssistPhase) -> Option<AgentPrepareReplyStep> {
    match phase {
        AssistPhase::AnalyzeIntent => Some(AgentPrepareReplyStep::AnalyzeIntent),
        AssistPhase::DraftReply => Some(AgentPrepareReplyStep::DraftReply),
        AssistPhase::SuggestSlots => Some(AgentPrepareReplyStep::SuggestSlots),
        AssistPhase::ExtractFacts
        | AssistPhase::ActionItems
        | AssistPhase::RiskFlag
        | AssistPhase::ConsistencyCheck
        | AssistPhase::ToneAdapt => None,
    }
}

fn skill_id_for_phase(phase: AssistPhase) -> &'static str {
    match phase {
        AssistPhase::AnalyzeIntent => AssistSkill::AnalyzeIntent.id(),
        AssistPhase::ExtractFacts => AssistSkill::ExtractFacts.id(),
        AssistPhase::ActionItems => AssistSkill::ActionItems.id(),
        AssistPhase::RiskFlag => AssistSkill::RiskFlagger.id(),
        AssistPhase::DraftReply => AssistSkill::DraftReply.id(),
        AssistPhase::ToneAdapt => AssistSkill::ToneAdapter.id(),
        AssistPhase::ConsistencyCheck => AssistSkill::ConsistencyCheck.id(),
        AssistPhase::SuggestSlots => AssistSkill::SlotSuggestion.id(),
    }
}

fn skipped_step(skill_id: &str, started: Instant, message: &str) -> AssistRunStep {
    AssistRunStep {
        skill: skill_id.to_string(),
        status: "skipped".into(),
        latency_ms: started.elapsed().as_millis() as u64,
        input_tokens: 0,
        output_tokens: 0,
        message: Some(message.into()),
    }
}

fn error_step(skill_id: &str, started: Instant, err: &LlmError) -> AssistRunStep {
    AssistRunStep {
        skill: skill_id.to_string(),
        status: "error".into(),
        latency_ms: started.elapsed().as_millis() as u64,
        input_tokens: 0,
        output_tokens: 0,
        message: Some(err.to_string()),
    }
}

fn intent_snapshot(i: &AgentIntentResult) -> AssistIntentSnapshot {
    AssistIntentSnapshot {
        intent: i.intent.clone(),
        tone_hint: i.tone_hint.clone(),
        needs_scheduling: i.needs_scheduling,
    }
}

fn slots_to_recommendations(slots: &[String]) -> Vec<AssistRecommendation> {
    slots
        .iter()
        .map(|s| AssistRecommendation {
            kind: "slot".into(),
            label: s.clone(),
            detail: String::new(),
        })
        .collect()
}

pub struct AssistPhaseOutput {
    pub result: AssistResult,
    pub run_step: AssistRunStep,
}

fn finalize_plan(
    result: &mut AssistResult,
    request: &AssistRequest,
    intent: Option<&AssistIntentSnapshot>,
    draft: &str,
    facts: Option<&AssistFactsSnapshot>,
) {
    result.plan = Some(assist_routing_plan(request, intent, draft, facts));
    result.needs_clarification = needs_clarification_before_draft(request, facts);
}

pub fn run_assist_phase(
    engine: &mut LlmEngine,
    request: &AssistRequest,
    phase: AssistPhase,
    thread: &AssistThreadContext,
    prior_intent: Option<&AgentIntentResult>,
    prior_facts: Option<&AssistFactsSnapshot>,
    draft_so_far: &str,
    force_draft: bool,
) -> Result<AssistPhaseOutput, LlmError> {
    let thread_context = thread.transcript.as_str();
    let lang = request.user_prefs.lang.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let started = Instant::now();
    let skill_id = skill_id_for_phase(phase);

    if phase == AssistPhase::SuggestSlots {
        let snap = prior_intent.map(intent_snapshot);
        if !should_run_slot_skill(request, snap.as_ref(), draft_so_far, prior_facts) {
            let plan = assist_routing_plan(request, snap.as_ref(), draft_so_far, prior_facts);
            let run_step = AssistRunStep {
                skill: skill_id.to_string(),
                status: "skipped".into(),
                latency_ms: started.elapsed().as_millis() as u64,
                input_tokens: 0,
                output_tokens: 0,
                message: Some("Créneaux non requis pour ce fil.".into()),
            };
            let mut result = AssistResult::empty_v1();
            result.plan = Some(plan);
            result.run_steps.push(run_step.clone());
            return Ok(AssistPhaseOutput { result, run_step });
        }
    }

    if phase == AssistPhase::DraftReply
        && needs_clarification_before_draft(request, prior_facts)
        && !force_draft
    {
        let snap = prior_intent.map(intent_snapshot);
        let run_step = AssistRunStep {
            skill: skill_id.to_string(),
            status: "blocked".into(),
            latency_ms: started.elapsed().as_millis() as u64,
            input_tokens: 0,
            output_tokens: 0,
            message: Some("Clarification recommandée avant brouillon.".into()),
        };
        let mut result = AssistResult::empty_v1();
        if let Some(f) = prior_facts {
            result.facts = Some(f.clone());
            result.confidence = Some(f.confidence);
            result.clarification_questions = f
                .ambiguities
                .iter()
                .map(|a| format!("Pouvez-vous préciser : {a} ?"))
                .take(3)
                .collect();
        }
        finalize_plan(&mut result, request, snap.as_ref(), draft_so_far, prior_facts);
        result.run_steps.push(run_step.clone());
        return Ok(AssistPhaseOutput { result, run_step });
    }

    let mut result = AssistResult::empty_v1();
    result.executed_skills.push(skill_id.to_string());

    match phase {
        AssistPhase::AnalyzeIntent => {
            if !skill_enabled(request, AssistSkill::AnalyzeIntent) {
                return Err(LlmError::Msg("Skill analyze_intent désactivé.".into()));
            }
            let agent_out = agent_prepare_reply_step(
                engine,
                AgentPrepareReplyStep::AnalyzeIntent,
                thread_context,
                prior_intent,
                lang,
                &request.user_prefs,
                prior_facts,
            )?;
            if let Some(i) = agent_out.intent.as_ref() {
                let snap = intent_snapshot(i);
                result.intent_summary = Some(snap.intent.clone());
                result.intent = Some(snap);
                result.confidence = Some(0.75);
            }
        }
        AssistPhase::ExtractFacts => {
            if !skill_enabled(request, AssistSkill::ExtractFacts) {
                let run_step = skipped_step(skill_id, started, "Extraction de faits désactivée.");
                result.run_steps.push(run_step.clone());
                return Ok(AssistPhaseOutput { result, run_step });
            }
            match extract_facts_with_llm(engine, thread_context, prior_intent, &request.user_prefs) {
                Ok(out) => {
                    result.facts = Some(out.snapshot.clone());
                    result.confidence = Some(out.snapshot.confidence);
                    result.clarification_questions = out.clarification_questions;
                    result.needs_clarification =
                        needs_clarification_before_draft(request, Some(&out.snapshot));
                }
                Err(e @ LlmError::InvalidJson(_)) => {
                    let run_step = error_step(skill_id, started, &e);
                    result.facts = Some(AssistFactsSnapshot {
                        facts: Vec::new(),
                        ambiguities: Vec::new(),
                        confidence: 0.25,
                    });
                    result.confidence = Some(0.25);
                    result.run_steps.push(run_step.clone());
                }
                Err(e) => return Err(e),
            }
        }
        AssistPhase::ActionItems => {
            if !skill_enabled(request, AssistSkill::ActionItems) {
                let run_step = skipped_step(skill_id, started, "Actions désactivées.");
                result.run_steps.push(run_step.clone());
                return Ok(AssistPhaseOutput { result, run_step });
            }
            match extract_action_items_with_llm(
                engine,
                thread_context,
                prior_intent,
                &request.user_prefs,
            ) {
                Ok(items) => merge_recommendations(&mut result.recommendations, items),
                Err(e) if AssistSkill::ActionItems.fallback_on_error() => {
                    let run_step = error_step(skill_id, started, &e);
                    result.run_steps.push(run_step.clone());
                    return Ok(AssistPhaseOutput { result, run_step });
                }
                Err(e) => return Err(e),
            }
        }
        AssistPhase::RiskFlag => {
            if !skill_enabled(request, AssistSkill::RiskFlagger) {
                let run_step = skipped_step(skill_id, started, "Analyse risque désactivée.");
                result.run_steps.push(run_step.clone());
                return Ok(AssistPhaseOutput { result, run_step });
            }
            let flags = risk_flags_from_thread_security(
                &thread.thread_security_codes,
                thread.thread_security_max,
            );
            result.safety_flags = flags;
        }
        AssistPhase::DraftReply => {
            if !skill_enabled(request, AssistSkill::DraftReply) {
                return Err(LlmError::Msg("Skill draft_reply désactivé.".into()));
            }
            let agent_out = agent_prepare_reply_step(
                engine,
                AgentPrepareReplyStep::DraftReply,
                thread_context,
                prior_intent,
                lang,
                &request.user_prefs,
                prior_facts,
            )?;
            if let Some(d) = agent_out.draft.as_ref() {
                result.draft_response = Some(d.draft.clone());
            }
        }
        AssistPhase::ConsistencyCheck => {
            let draft = draft_so_far.trim();
            if draft.is_empty() {
                let run_step = AssistRunStep {
                    skill: skill_id.to_string(),
                    status: "skipped".into(),
                    latency_ms: started.elapsed().as_millis() as u64,
                    input_tokens: 0,
                    output_tokens: 0,
                    message: Some("Pas de brouillon à vérifier.".into()),
                };
                result.run_steps.push(run_step.clone());
                return Ok(AssistPhaseOutput { result, run_step });
            }
            if !skill_enabled(request, AssistSkill::ConsistencyCheck) {
                let run_step = AssistRunStep {
                    skill: skill_id.to_string(),
                    status: "skipped".into(),
                    latency_ms: started.elapsed().as_millis() as u64,
                    input_tokens: 0,
                    output_tokens: 0,
                    message: None,
                };
                result.run_steps.push(run_step.clone());
                return Ok(AssistPhaseOutput { result, run_step });
            }
            let facts = prior_facts.cloned().unwrap_or(AssistFactsSnapshot {
                facts: Vec::new(),
                ambiguities: Vec::new(),
                confidence: 1.0,
            });
            let check =
                consistency_check_with_llm(engine, thread_context, &facts, draft, &request.user_prefs)?;
            result.consistency_issues = check.issues;
            result.safety_flags = check.safety_flags;
            if !check.aligned {
                result.safety_flags.push("consistency_warning".into());
            }
        }
        AssistPhase::ToneAdapt => {
            let draft = draft_so_far.trim();
            if draft.is_empty() {
                let run_step = skipped_step(skill_id, started, "Pas de brouillon à adapter.");
                result.run_steps.push(run_step.clone());
                return Ok(AssistPhaseOutput { result, run_step });
            }
            if !skill_enabled(request, AssistSkill::ToneAdapter) {
                let run_step = skipped_step(skill_id, started, "Adaptation de ton désactivée.");
                result.run_steps.push(run_step.clone());
                return Ok(AssistPhaseOutput { result, run_step });
            }
            let tone_hint = prior_intent.map(|i| i.tone_hint.as_str());
            match adapt_draft_tone_with_llm(engine, draft, &request.user_prefs, tone_hint) {
                Ok(text) => result.draft_response = Some(text),
                Err(e) if AssistSkill::ToneAdapter.fallback_on_error() => {
                    let run_step = error_step(skill_id, started, &e);
                    result.run_steps.push(run_step.clone());
                    return Ok(AssistPhaseOutput { result, run_step });
                }
                Err(e) => return Err(e),
            }
        }
        AssistPhase::SuggestSlots => {
            let agent_out = agent_prepare_reply_step(
                engine,
                AgentPrepareReplyStep::SuggestSlots,
                thread_context,
                prior_intent,
                lang,
                &request.user_prefs,
                prior_facts,
            )?;
            if let Some(s) = agent_out.slots.as_ref() {
                result.slots = s.slots.clone();
                result.recommendations = slots_to_recommendations(&s.slots);
            }
        }
    }

    let snap: Option<AssistIntentSnapshot> = result
        .intent
        .clone()
        .or_else(|| prior_intent.map(intent_snapshot));
    let draft_owned = result
        .draft_response
        .clone()
        .unwrap_or_else(|| draft_so_far.to_string());
    if result.facts.is_none() {
        if let Some(f) = prior_facts {
            result.facts = Some(f.clone());
        }
    }
    let facts_for_plan = result.facts.clone().or_else(|| prior_facts.cloned());
    finalize_plan(
        &mut result,
        request,
        snap.as_ref(),
        draft_owned.as_str(),
        facts_for_plan.as_ref(),
    );

    let run_step = AssistRunStep {
        skill: skill_id.to_string(),
        status: "ok".into(),
        latency_ms: started.elapsed().as_millis() as u64,
        input_tokens: 0,
        output_tokens: 0,
        message: None,
    };
    result.run_steps.push(run_step.clone());

    Ok(AssistPhaseOutput { result, run_step })
}

pub fn run_assist_draft_streaming(
    engine: &mut LlmEngine,
    request: &AssistRequest,
    thread: &AssistThreadContext,
    prior_intent: Option<&AgentIntentResult>,
    prior_facts: Option<&AssistFactsSnapshot>,
    force_draft: bool,
    cancelled: &std::sync::atomic::AtomicBool,
    mut on_chunk: impl FnMut(&str),
) -> Result<(AgentDraftResult, AssistRunStep), LlmError> {
    let thread_context = thread.transcript.as_str();
    if needs_clarification_before_draft(request, prior_facts) && !force_draft {
        return Err(LlmError::Msg(
            "Clarification requise avant génération du brouillon.".into(),
        ));
    }
    let lang = request.user_prefs.lang.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let started = Instant::now();
    let draft = agent_draft_reply_streaming(
        engine,
        thread_context,
        prior_intent,
        lang,
        &request.user_prefs,
        prior_facts,
        cancelled,
        &mut on_chunk,
    )?;
    let run_step = AssistRunStep {
        skill: AssistSkill::DraftReply.id().to_string(),
        status: "ok".into(),
        latency_ms: started.elapsed().as_millis() as u64,
        input_tokens: 0,
        output_tokens: 0,
        message: None,
    };
    Ok((draft, run_step))
}

pub fn assist_request_from_prefs(
    thread_id: &str,
    account_id: &str,
    lang: &str,
    tone: &str,
    timezone: &str,
    assist_mode: AssistMode,
) -> AssistRequest {
    AssistRequest {
        schema_version: ASSIST_SCHEMA_VERSION,
        thread_id: thread_id.to_string(),
        account_id: account_id.to_string(),
        user_prefs: AssistUserPrefs {
            lang: lang.to_string(),
            tone: tone.to_string(),
            timezone: timezone.to_string(),
        },
        assist_mode,
        enabled_skills: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::{AssistFact, AssistMode};

    fn base_request() -> AssistRequest {
        AssistRequest {
            schema_version: ASSIST_SCHEMA_VERSION,
            thread_id: "t1".into(),
            account_id: "a1".into(),
            user_prefs: AssistUserPrefs {
                lang: "fr".into(),
                tone: "neutre".into(),
                timezone: "Europe/Paris".into(),
            },
            assist_mode: AssistMode::Deep,
            enabled_skills: Vec::new(),
        }
    }

    #[test]
    fn quick_mode_excludes_facts_and_consistency() {
        let mut r = base_request();
        r.assist_mode = AssistMode::Quick;
        let skills = resolved_enabled_skills(&r);
        assert!(!skills.contains(&AssistSkill::ExtractFacts));
        assert!(!skills.contains(&AssistSkill::ConsistencyCheck));
    }

    #[test]
    fn deep_mode_includes_facts_pipeline() {
        let r = base_request();
        let skills = resolved_enabled_skills(&r);
        assert!(skills.contains(&AssistSkill::ExtractFacts));
        assert!(skills.contains(&AssistSkill::ActionItems));
        assert!(skills.contains(&AssistSkill::ConsistencyCheck));
    }

    #[test]
    fn strict_includes_risk_flagger() {
        let mut r = base_request();
        r.assist_mode = AssistMode::StrictSafe;
        let skills = resolved_enabled_skills(&r);
        assert!(skills.contains(&AssistSkill::RiskFlagger));
    }

    #[test]
    fn clarification_when_low_confidence() {
        let r = base_request();
        let facts = AssistFactsSnapshot {
            facts: vec![AssistFact {
                kind: "request".into(),
                text: "Devis".into(),
                message_ids: vec![],
            }],
            ambiguities: vec![],
            confidence: 0.4,
        };
        assert!(needs_clarification_before_draft(&r, Some(&facts)));
    }

    #[test]
    fn slots_skipped_without_scheduling_need() {
        let r = base_request();
        let intent = AssistIntentSnapshot {
            intent: "Question".into(),
            tone_hint: "neutre".into(),
            needs_scheduling: false,
        };
        assert!(!should_run_slot_skill(&r, Some(&intent), "", None));
    }

    #[test]
    fn slots_skipped_when_intent_overreads_deadline() {
        let r = base_request();
        let intent = AssistIntentSnapshot {
            intent: "Suivi devis".into(),
            tone_hint: "neutre".into(),
            needs_scheduling: true,
        };
        let facts = AssistFactsSnapshot {
            facts: vec![
                AssistFact {
                    kind: "request".into(),
                    text: "Transmettre le devis validé au client.".into(),
                    message_ids: vec![],
                },
                AssistFact {
                    kind: "deadline".into(),
                    text: "Campagne e-mail prévue jeudi matin.".into(),
                    message_ids: vec![],
                },
            ],
            ambiguities: vec![],
            confidence: 0.9,
        };
        assert!(!should_run_slot_skill(&r, Some(&intent), "", Some(&facts)));
    }

    #[test]
    fn plan_flags_clarification() {
        let r = base_request();
        let facts = AssistFactsSnapshot {
            facts: Vec::new(),
            ambiguities: vec!["Date limite inconnue".into()],
            confidence: 0.5,
        };
        let plan = assist_routing_plan(&r, None, "", Some(&facts));
        assert!(plan.needs_clarification);
    }
}
