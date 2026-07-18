//! Streaming LLM vers le frontend (événements Tauri) + annulation coopérative.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use rustymail_domain::{AssistFactsSnapshot, AssistMode};
use rustymail_domain::{ThreadQaAnswer, TranslationResult};
use rustymail_infrastructure::{load_app_prefs, sqlite_ai_cache_put, AiFeature};
use rustymail_modules::ai_agent_prepare_reply::{AgentDraftResult, AgentIntentResult};
use rustymail_modules::ai_assist_thread::run_assist_draft_streaming;
use rustymail_modules::{ai_qa, ai_summary, ai_translation, LLM_CANCELLED};

use crate::llm_assist::{
    assist_thread_context_with_engine, default_assist_request, emit_assist_telemetry,
};
use rustymail_modules::ai_summary::SummaryResult;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::llm_commands::{
    ai_cache_summary_key, ai_cache_translate_thread_key, build_llm_engine, llm_gate_feature,
    open_thread_domain, transcript_for_llm,
};
use crate::AppPaths;

pub struct LlmJobRegistry {
    inner: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl LlmJobRegistry {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, job_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.inner
            .lock()
            .expect("llm job registry")
            .insert(job_id.to_string(), Arc::clone(&flag));
        flag
    }

    pub fn cancel(&self, job_id: &str) {
        if let Some(flag) = self.inner.lock().expect("llm job registry").get(job_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    pub fn remove(&self, job_id: &str) {
        self.inner.lock().expect("llm job registry").remove(job_id);
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmStreamChunkPayload {
    pub job_id: String,
    pub chunk: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmStreamDonePayload {
    pub job_id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<SummaryResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translation: Option<TranslationResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qa: Option<ThreadQaAnswer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_draft: Option<AgentDraftResult>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmStreamErrorPayload {
    pub job_id: String,
    pub message: String,
    pub cancelled: bool,
}

fn emit_chunk(app: &AppHandle, job_id: &str, chunk: &str) {
    let _ = app.emit(
        "llm-stream-chunk",
        LlmStreamChunkPayload {
            job_id: job_id.to_string(),
            chunk: chunk.to_string(),
        },
    );
}

fn emit_done(app: &AppHandle, payload: LlmStreamDonePayload) {
    let _ = app.emit("llm-stream-done", payload);
}

fn emit_error(app: &AppHandle, job_id: &str, message: String, cancelled: bool) {
    let _ = app.emit(
        "llm-stream-error",
        LlmStreamErrorPayload {
            job_id: job_id.to_string(),
            message,
            cancelled,
        },
    );
}

fn is_cancelled_msg(msg: &str) -> bool {
    msg.trim() == LLM_CANCELLED
}

fn summary_display_text(summary: &SummaryResult) -> String {
    let mut lines = vec![summary.title.clone()];
    for b in &summary.bullets {
        lines.push(format!("• {b}"));
    }
    lines.join("\n")
}

#[tauri::command]
pub fn llm_stream_cancel(
    registry: State<'_, LlmJobRegistry>,
    job_id: String,
) -> Result<(), String> {
    crate::ipc_guard::validate_job_id(&job_id)?;
    registry.cancel(job_id.trim());
    Ok(())
}

#[tauri::command]
pub async fn llm_stream_summarize_thread(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    registry: State<'_, LlmJobRegistry>,
    thread_id: String,
    job_id: String,
) -> Result<(), String> {
    crate::ipc_guard::validate_thread_id(&thread_id)?;
    crate::ipc_guard::validate_job_id(&job_id)?;
    let paths = Clone::clone(&*paths);
    let job_id = job_id.trim().to_string();
    let thread_id = thread_id.trim().to_string();
    let cancel = registry.register(&job_id);
    let app_c = app.clone();
    let job_id_c = job_id.clone();

    let out = tauri::async_runtime::spawn_blocking(move || {
        let prefs = load_app_prefs(&paths.prefs_path);
        llm_gate_feature(&prefs, &paths, AiFeature::ThreadSummary)?;
        let mut view = open_thread_domain(&paths.db_path, thread_id.as_str())?;
        crate::enrich_thread_newsletter(&paths, &mut view)?;
        if view.is_newsletter_thread {
            let s = rustymail_modules::ai_summary::newsletter_light_summary(&view);
            let display = summary_display_text(&s);
            emit_done(
                &app_c,
                LlmStreamDonePayload {
                    job_id: job_id_c.clone(),
                    kind: "summary".into(),
                    summary: Some(s),
                    translation: None,
                    qa: None,
                    display_text: Some(display),
                    agent_draft: None,
                },
            );
            return Ok(());
        }
        let mut engine = build_llm_engine(&prefs, &paths)?;
        let lang = prefs.general.mother_language.as_str();
        let summary = ai_summary::summarize_thread_with_llm_streaming(
            &view,
            &mut engine,
            lang,
            cancel.as_ref(),
            |piece| emit_chunk(&app_c, job_id_c.as_str(), piece),
        )
        .map_err(|e| e.to_string())?;
        let cache_key = ai_cache_summary_key(&prefs, thread_id.as_str());
        if let Ok(json) = serde_json::to_string(&summary) {
            let _ = sqlite_ai_cache_put(&paths.db_path, &cache_key, &json);
        }
        let display = summary_display_text(&summary);
        emit_done(
            &app_c,
            LlmStreamDonePayload {
                job_id: job_id_c,
                kind: "summary".into(),
                summary: Some(summary),
                translation: None,
                qa: None,
                display_text: Some(display),
                agent_draft: None,
            },
        );
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("llm_stream_summarize_thread join: {e}"))?;

    registry.remove(&job_id);
    if let Err(msg) = out {
        let cancelled = is_cancelled_msg(&msg);
        emit_error(&app, job_id.as_str(), msg.clone(), cancelled);
        if cancelled {
            return Ok(());
        }
        return Err(msg);
    }
    Ok(())
}

#[tauri::command]
pub async fn llm_stream_translate_thread(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    registry: State<'_, LlmJobRegistry>,
    thread_id: String,
    target_lang: String,
    job_id: String,
) -> Result<(), String> {
    crate::ipc_guard::validate_thread_id(&thread_id)?;
    crate::ipc_guard::validate_target_lang(&target_lang)?;
    crate::ipc_guard::validate_job_id(&job_id)?;
    let paths = Clone::clone(&*paths);
    let job_id = job_id.trim().to_string();
    let thread_id = thread_id.trim().to_string();
    let target_lang = target_lang.trim().to_string();
    let cancel = registry.register(&job_id);
    let app_c = app.clone();
    let job_id_c = job_id.clone();

    let out = tauri::async_runtime::spawn_blocking(move || {
        let prefs = load_app_prefs(&paths.prefs_path);
        llm_gate_feature(&prefs, &paths, AiFeature::ThreadTranslate)?;
        let mut engine = build_llm_engine(&prefs, &paths)?;
        let view = open_thread_domain(&paths.db_path, thread_id.as_str())?;
        let last = view
            .messages
            .last()
            .ok_or_else(|| "Fil vide.".to_string())?;
        let mut acc = String::new();
        for m in view.messages.iter().take(12) {
            acc.push_str(m.cleaned_text.as_str());
            acc.push('\n');
        }
        let res = ai_translation::translate_plain_with_llm_streaming(
            &mut engine,
            last.message_id.as_str(),
            acc.trim(),
            "auto",
            target_lang.as_str(),
            cancel.as_ref(),
            |piece| emit_chunk(&app_c, job_id_c.as_str(), piece),
        )
        .map_err(|e| e.to_string())?;
        let key = ai_cache_translate_thread_key(&prefs, thread_id.as_str(), target_lang.as_str());
        if let Ok(json) = serde_json::to_string(&res) {
            let _ = sqlite_ai_cache_put(&paths.db_path, &key, &json);
        }
        let display = res.translated_text.clone();
        emit_done(
            &app_c,
            LlmStreamDonePayload {
                job_id: job_id_c,
                kind: "translate".into(),
                summary: None,
                translation: Some(res),
                qa: None,
                display_text: Some(display),
                agent_draft: None,
            },
        );
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("llm_stream_translate_thread join: {e}"))?;

    registry.remove(&job_id);
    if let Err(msg) = out {
        let cancelled = is_cancelled_msg(&msg);
        emit_error(&app, job_id.as_str(), msg.clone(), cancelled);
        if cancelled {
            return Ok(());
        }
        return Err(msg);
    }
    Ok(())
}

#[tauri::command]
pub async fn llm_stream_qa_thread(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    registry: State<'_, LlmJobRegistry>,
    thread_id: String,
    question: String,
    job_id: String,
) -> Result<(), String> {
    crate::ipc_guard::validate_thread_id(&thread_id)?;
    crate::ipc_guard::validate_qa_question(&question)?;
    crate::ipc_guard::validate_job_id(&job_id)?;
    let paths = Clone::clone(&*paths);
    let job_id = job_id.trim().to_string();
    let thread_id = thread_id.trim().to_string();
    let question = question.trim().to_string();
    let cancel = registry.register(&job_id);
    let app_c = app.clone();
    let job_id_c = job_id.clone();

    let out = tauri::async_runtime::spawn_blocking(move || {
        let prefs = load_app_prefs(&paths.prefs_path);
        llm_gate_feature(&prefs, &paths, AiFeature::ThreadQa)?;
        let mut engine = build_llm_engine(&prefs, &paths)?;
        let view = open_thread_domain(&paths.db_path, thread_id.as_str())?;
        let ctx = transcript_for_llm(&view, &engine);
        let lang = prefs.general.mother_language.as_str();
        let qa = ai_qa::qa_thread_with_llm_streaming(
            &mut engine,
            ctx.as_str(),
            question.as_str(),
            lang,
            cancel.as_ref(),
            |piece| emit_chunk(&app_c, job_id_c.as_str(), piece),
        )
        .map_err(|e| e.to_string())?;
        emit_done(
            &app_c,
            LlmStreamDonePayload {
                job_id: job_id_c,
                kind: "qa".into(),
                summary: None,
                translation: None,
                qa: Some(qa),
                display_text: None,
                agent_draft: None,
            },
        );
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("llm_stream_qa_thread join: {e}"))?;

    registry.remove(&job_id);
    if let Err(msg) = out {
        let cancelled = is_cancelled_msg(&msg);
        emit_error(&app, job_id.as_str(), msg.clone(), cancelled);
        if cancelled {
            return Ok(());
        }
        return Err(msg);
    }
    Ok(())
}

#[tauri::command]
pub async fn llm_stream_agent_prepare_draft(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    registry: State<'_, LlmJobRegistry>,
    thread_id: String,
    job_id: String,
    prior_intent: Option<AgentIntentResult>,
    account_id: Option<String>,
    assist_mode: Option<AssistMode>,
    prior_facts: Option<AssistFactsSnapshot>,
    force_draft: Option<bool>,
) -> Result<(), String> {
    crate::ipc_guard::validate_thread_id(&thread_id)?;
    crate::ipc_guard::validate_job_id(&job_id)?;
    let account_id = account_id.unwrap_or_default();
    let assist_mode = assist_mode.unwrap_or(AssistMode::Deep);
    let force_draft = force_draft.unwrap_or(false);
    let paths = Clone::clone(&*paths);
    let job_id = job_id.trim().to_string();
    let thread_id = thread_id.trim().to_string();
    let cancel = registry.register(&job_id);
    let app_c = app.clone();
    let job_id_c = job_id.clone();

    let out = tauri::async_runtime::spawn_blocking(move || {
        let prefs = load_app_prefs(&paths.prefs_path);
        llm_gate_feature(&prefs, &paths, AiFeature::AgentPrepareReply)?;
        let mut engine = build_llm_engine(&prefs, &paths)?;
        let request =
            default_assist_request(thread_id.as_str(), account_id.as_str(), &prefs, assist_mode);
        let thread = assist_thread_context_with_engine(&paths, thread_id.as_str(), &engine)?;
        let (draft, run_step) = run_assist_draft_streaming(
            &mut engine,
            &request,
            &thread,
            prior_intent.as_ref(),
            prior_facts.as_ref(),
            force_draft,
            cancel.as_ref(),
            |piece| emit_chunk(&app_c, job_id_c.as_str(), piece),
        )
        .map_err(|e| e.to_string())?;
        emit_assist_telemetry(&app_c, thread_id.as_str(), run_step);
        let display = draft.draft.clone();
        emit_done(
            &app_c,
            LlmStreamDonePayload {
                job_id: job_id_c,
                kind: "agentDraft".into(),
                summary: None,
                translation: None,
                qa: None,
                display_text: Some(display),
                agent_draft: Some(draft),
            },
        );
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("llm_stream_agent_prepare_draft join: {e}"))?;

    registry.remove(&job_id);
    if let Err(msg) = out {
        let cancelled = is_cancelled_msg(&msg);
        emit_error(&app, job_id.as_str(), msg.clone(), cancelled);
        if cancelled {
            return Ok(());
        }
        return Err(msg);
    }
    Ok(())
}
