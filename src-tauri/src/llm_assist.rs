//! IPC assistance fil — plan, phases, télémétrie UI, cache faits.

use rustymail_domain::{
    AssistFactsSnapshot, AssistIntentSnapshot, AssistMode, AssistPhase, AssistRequest,
    AssistResult, AssistRunStep, AssistUserPrefs, MailSecuritySeverity,
};
use rustymail_infrastructure::{
    load_app_prefs, sqlite_ai_cache_get, sqlite_ai_cache_put, AiFeature,
};
use rustymail_modules::ai_agent_prepare_reply::AgentIntentResult;
use rustymail_modules::ai_assist_thread::{
    assist_request_from_prefs, assist_routing_plan, run_assist_phase, AssistThreadContext,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::llm_commands::{
    ai_cache_model_segment, build_llm_engine, llm_gate_feature, open_thread_domain,
    transcript_for_llm,
};
use crate::AppPaths;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmAssistTelemetryPayload {
    pub thread_id: String,
    pub run_step: AssistRunStep,
}

pub fn emit_assist_telemetry(app: &AppHandle, thread_id: &str, run_step: AssistRunStep) {
    let _ = app.emit(
        "llm-assist-telemetry",
        LlmAssistTelemetryPayload {
            thread_id: thread_id.to_string(),
            run_step,
        },
    );
}

fn assist_request_from_payload(
    payload: &LlmAssistThreadPayload,
    prefs: &rustymail_infrastructure::AppPrefs,
) -> AssistRequest {
    let lang = prefs.ai.draft_language.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let tone = payload
        .user_prefs
        .as_ref()
        .map(|p| p.tone.trim())
        .filter(|t| !t.is_empty())
        .unwrap_or("neutre");
    let timezone = payload
        .user_prefs
        .as_ref()
        .map(|p| p.timezone.trim())
        .filter(|t| !t.is_empty())
        .unwrap_or("Europe/Paris");
    AssistRequest {
        schema_version: payload.schema_version,
        thread_id: payload.thread_id.clone(),
        account_id: payload.account_id.clone(),
        user_prefs: AssistUserPrefs {
            lang: lang.to_string(),
            tone: tone.to_string(),
            timezone: timezone.to_string(),
        },
        assist_mode: payload.assist_mode,
        enabled_skills: payload.enabled_skills.clone(),
    }
}

fn thread_security_context(
    view: &rustymail_domain::DiscussionThreadView,
) -> (Vec<String>, Option<MailSecuritySeverity>) {
    let mut codes = Vec::new();
    let mut max: Option<MailSecuritySeverity> = None;
    for m in view.messages.iter().rev().take(12) {
        for f in &m.mail_security.findings {
            if !codes.contains(&f.code) {
                codes.push(f.code.clone());
            }
        }
        let sev = m.mail_security.severity;
        max = Some(match (max, sev) {
            (None, s) => s,
            (Some(MailSecuritySeverity::Suspicion), _) => MailSecuritySeverity::Suspicion,
            (Some(MailSecuritySeverity::Attention), MailSecuritySeverity::Suspicion) => {
                MailSecuritySeverity::Suspicion
            }
            (Some(a), b) if severity_rank(b) > severity_rank(a) => b,
            (Some(a), _) => a,
        });
    }
    (codes, max)
}

fn severity_rank(s: MailSecuritySeverity) -> u8 {
    match s {
        MailSecuritySeverity::Ok => 0,
        MailSecuritySeverity::Attention => 1,
        MailSecuritySeverity::Suspicion => 2,
    }
}

fn assist_thread_context(
    view: &rustymail_domain::DiscussionThreadView,
    engine: &rustymail_llm::LlmEngine,
) -> AssistThreadContext {
    let (codes, max) = thread_security_context(view);
    AssistThreadContext {
        transcript: transcript_for_llm(view, engine),
        thread_security_codes: codes,
        thread_security_max: max,
    }
}

fn ai_cache_assist_facts_key(
    prefs: &rustymail_infrastructure::AppPrefs,
    thread_id: &str,
) -> String {
    format!(
        "assist_facts:v3:{}:{}",
        ai_cache_model_segment(prefs),
        thread_id.trim()
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedAssistFacts {
    snapshot: AssistFactsSnapshot,
    clarification_questions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmAssistThreadPayload {
    #[serde(default)]
    pub schema_version: u32,
    pub thread_id: String,
    pub account_id: String,
    #[serde(default)]
    pub user_prefs: Option<AssistUserPrefs>,
    #[serde(default)]
    pub assist_mode: AssistMode,
    #[serde(default)]
    pub enabled_skills: Vec<rustymail_domain::AssistSkill>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmAssistPlanPayload {
    #[serde(flatten)]
    pub base: LlmAssistThreadPayload,
    #[serde(default)]
    pub prior_intent: Option<AssistIntentSnapshot>,
    #[serde(default)]
    pub draft: String,
    #[serde(default)]
    pub prior_facts: Option<AssistFactsSnapshot>,
}

fn llm_assist_plan_compute(
    paths: &AppPaths,
    payload: LlmAssistPlanPayload,
) -> Result<AssistResult, String> {
    crate::ipc_guard::validate_thread_id(&payload.base.thread_id)?;
    crate::ipc_guard::validate_account_id(&payload.base.account_id)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::AgentPrepareReply)?;
    let request = assist_request_from_payload(&payload.base, &prefs);
    let plan = assist_routing_plan(
        &request,
        payload.prior_intent.as_ref(),
        payload.draft.as_str(),
        payload.prior_facts.as_ref(),
    );
    let mut result = AssistResult::empty_v1();
    result.plan = Some(plan);
    Ok(result)
}

#[tauri::command]
pub async fn llm_assist_plan(
    paths: State<'_, AppPaths>,
    payload: LlmAssistPlanPayload,
) -> Result<AssistResult, String> {
    let paths = Clone::clone(&*paths);
    tauri::async_runtime::spawn_blocking(move || llm_assist_plan_compute(&paths, payload))
        .await
        .map_err(|e| format!("llm_assist_plan join: {e}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmAssistPhasePayload {
    #[serde(flatten)]
    pub base: LlmAssistThreadPayload,
    pub phase: AssistPhase,
    #[serde(default)]
    pub prior_intent: Option<AgentIntentResult>,
    #[serde(default)]
    pub draft_so_far: String,
    #[serde(default)]
    pub prior_facts: Option<AssistFactsSnapshot>,
    #[serde(default)]
    pub force_draft: bool,
}

fn try_load_cached_facts(db_path: &std::path::Path, key: &str) -> Option<CachedAssistFacts> {
    let raw = sqlite_ai_cache_get(db_path, key).ok()??;
    serde_json::from_str(&raw).ok()
}

fn llm_assist_thread_phase_compute(
    paths: &AppPaths,
    payload: LlmAssistPhasePayload,
) -> Result<AssistResult, String> {
    crate::ipc_guard::validate_thread_id(&payload.base.thread_id)?;
    crate::ipc_guard::validate_account_id(&payload.base.account_id)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::AgentPrepareReply)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let view = open_thread_domain(&paths.db_path, payload.base.thread_id.trim())?;
    let thread = assist_thread_context(&view, &engine);
    let request = assist_request_from_payload(&payload.base, &prefs);

    if payload.phase == AssistPhase::ExtractFacts {
        let cache_key = ai_cache_assist_facts_key(&prefs, payload.base.thread_id.as_str());
        if let Some(cached) = try_load_cached_facts(&paths.db_path, cache_key.as_str()) {
            let mut result = AssistResult::empty_v1();
            result.facts = Some(cached.snapshot.clone());
            result.confidence = Some(cached.snapshot.confidence);
            result.clarification_questions = cached.clarification_questions;
            result.needs_clarification =
                rustymail_modules::ai_assist_thread::needs_clarification_before_draft(
                    &request,
                    Some(&cached.snapshot),
                );
            result.executed_skills.push("extract_facts".into());
            let intent_snap = payload.prior_intent.as_ref().map(|i| AssistIntentSnapshot {
                intent: i.intent.clone(),
                tone_hint: i.tone_hint.clone(),
                needs_scheduling: i.needs_scheduling,
            });
            result.plan = Some(assist_routing_plan(
                &request,
                intent_snap.as_ref(),
                payload.draft_so_far.as_str(),
                Some(&cached.snapshot),
            ));
            result.run_steps.push(AssistRunStep {
                skill: "extract_facts".into(),
                status: "ok".into(),
                latency_ms: 0,
                input_tokens: 0,
                output_tokens: 0,
                message: Some("Cache faits.".into()),
            });
            return Ok(result);
        }
    }

    let out = run_assist_phase(
        &mut engine,
        &request,
        payload.phase,
        &thread,
        payload.prior_intent.as_ref(),
        payload.prior_facts.as_ref(),
        payload.draft_so_far.as_str(),
        payload.force_draft,
    )
    .map_err(|e| e.to_string())?;

    if payload.phase == AssistPhase::ExtractFacts {
        if let Some(f) = out.result.facts.as_ref() {
            let cache_key = ai_cache_assist_facts_key(&prefs, payload.base.thread_id.as_str());
            let pack = CachedAssistFacts {
                snapshot: f.clone(),
                clarification_questions: out.result.clarification_questions.clone(),
            };
            if let Ok(json) = serde_json::to_string(&pack) {
                let _ = sqlite_ai_cache_put(&paths.db_path, cache_key.as_str(), json.as_str());
            }
        }
    }

    Ok(out.result)
}

#[tauri::command]
pub async fn llm_assist_thread_phase(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    payload: LlmAssistPhasePayload,
) -> Result<AssistResult, String> {
    let thread_id = payload.base.thread_id.clone();
    let paths = Clone::clone(&*paths);
    let result = tauri::async_runtime::spawn_blocking(move || {
        llm_assist_thread_phase_compute(&paths, payload)
    })
    .await
    .map_err(|e| format!("llm_assist_thread_phase join: {e}"))??;
    for step in &result.run_steps {
        emit_assist_telemetry(&app, thread_id.as_str(), step.clone());
    }
    Ok(result)
}

/// Construit une requête assist par défaut pour le fil / compte courants.
pub fn default_assist_request(
    thread_id: &str,
    account_id: &str,
    prefs: &rustymail_infrastructure::AppPrefs,
    mode: AssistMode,
) -> AssistRequest {
    let lang = prefs.ai.draft_language.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    assist_request_from_prefs(thread_id, account_id, lang, "neutre", "Europe/Paris", mode)
}

/// Contexte fil pour l’assist, en réutilisant un moteur LLM déjà initialisé.
pub fn assist_thread_context_with_engine(
    paths: &AppPaths,
    thread_id: &str,
    engine: &rustymail_llm::LlmEngine,
) -> Result<AssistThreadContext, String> {
    let view = open_thread_domain(&paths.db_path, thread_id.trim())?;
    Ok(assist_thread_context(&view, engine))
}
