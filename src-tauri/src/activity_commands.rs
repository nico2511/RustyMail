//! IPC activité locale + suggestions de vues.

use rustymail_domain::{
    ActivityCardCalibrationStats, ActivityEventInput, ActivityCardPolicy, SuggestedSavedView,
    SuggestionDecision,
};
use rustymail_infrastructure::{
    activity_card_calibration_stats, list_suggested_saved_views, record_activity_events,
    record_suggestion_decision,
};
use tauri::State;

use crate::ipc_guard;
use crate::AppPaths;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityAccountPayload {
    pub account_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordActivityEventsPayload {
    pub account_id: String,
    pub events: Vec<ActivityEventInput>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DismissViewSuggestionPayload {
    pub account_id: String,
    pub sender_email: String,
    pub decision: SuggestionDecisionKind,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SuggestionDecisionKind {
    Dismiss,
    Snooze,
    Accepted,
}

impl From<SuggestionDecisionKind> for SuggestionDecision {
    fn from(v: SuggestionDecisionKind) -> Self {
        match v {
            SuggestionDecisionKind::Dismiss => SuggestionDecision::Dismiss,
            SuggestionDecisionKind::Snooze => SuggestionDecision::Snooze,
            SuggestionDecisionKind::Accepted => SuggestionDecision::Accepted,
        }
    }
}

#[tauri::command]
pub async fn record_activity_events_cmd(
    paths: State<'_, AppPaths>,
    payload: RecordActivityEventsPayload,
) -> Result<usize, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    if payload.events.is_empty() {
        return Ok(0);
    }
    if payload.events.len() > 64 {
        return Err("events: maximum 64 par lot.".into());
    }
    for ev in &payload.events {
        if let Some(tid) = ev.thread_id.as_deref() {
            ipc_guard::validate_thread_id(tid)?;
        }
    }
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    let events = payload.events;
    tauri::async_runtime::spawn_blocking(move || {
        record_activity_events(&db, &account_id, &events)
    })
    .await
    .map_err(|e| format!("record activity join: {e}"))?
}

#[tauri::command]
pub async fn list_suggested_saved_views_cmd(
    paths: State<'_, AppPaths>,
    payload: ActivityAccountPayload,
) -> Result<Vec<SuggestedSavedView>, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        list_suggested_saved_views(&db, &account_id, Some(ActivityCardPolicy::default()))
    })
    .await
    .map_err(|e| format!("list suggested views join: {e}"))?
}

#[tauri::command]
pub async fn dismiss_view_suggestion_cmd(
    paths: State<'_, AppPaths>,
    payload: DismissViewSuggestionPayload,
) -> Result<(), String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let email = payload.sender_email.trim();
    if email.is_empty() || !email.contains('@') {
        return Err("senderEmail: adresse invalide.".into());
    }
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    let sender_email = email.to_string();
    let decision = SuggestionDecision::from(payload.decision);
    tauri::async_runtime::spawn_blocking(move || {
        record_suggestion_decision(&db, &account_id, &sender_email, decision, None)
    })
    .await
    .map_err(|e| format!("dismiss suggestion join: {e}"))?
}

#[tauri::command]
pub async fn activity_card_calibration_stats_cmd(
    paths: State<'_, AppPaths>,
    payload: ActivityAccountPayload,
) -> Result<ActivityCardCalibrationStats, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || activity_card_calibration_stats(&db, &account_id))
        .await
        .map_err(|e| format!("calibration stats join: {e}"))?
}
