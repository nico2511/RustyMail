//! IPC historique de recherche + index sémantique incrémental.

use rustymail_domain::SearchHistoryEntry;
use rustymail_infrastructure::{
    clear_search_history, list_search_history, record_search_history, reindex_semantic_missing,
    SemanticReindexStats,
};
use tauri::State;

use crate::ipc_guard;
use crate::AppPaths;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHistoryRecordPayload {
    pub account_id: String,
    pub query_text: String,
    pub query_json: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHistoryListPayload {
    pub account_id: String,
    #[serde(default = "default_history_limit")]
    pub limit: usize,
}

fn default_history_limit() -> usize {
    20
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHistoryClearPayload {
    pub account_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReindexMissingPayload {
    pub account_id: String,
}

#[tauri::command]
pub async fn record_search_history_cmd(
    paths: State<'_, AppPaths>,
    payload: SearchHistoryRecordPayload,
) -> Result<(), String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let db = paths.db_path.clone();
    let aid = payload.account_id.trim().to_string();
    let text = payload.query_text;
    let json = payload.query_json;
    tauri::async_runtime::spawn_blocking(move || record_search_history(&db, &aid, &text, &json))
        .await
        .map_err(|e| format!("record search history join: {e}"))?
}

#[tauri::command]
pub async fn list_search_history_cmd(
    paths: State<'_, AppPaths>,
    payload: SearchHistoryListPayload,
) -> Result<Vec<SearchHistoryEntry>, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let db = paths.db_path.clone();
    let aid = payload.account_id.trim().to_string();
    let limit = payload.limit;
    tauri::async_runtime::spawn_blocking(move || list_search_history(&db, &aid, limit))
        .await
        .map_err(|e| format!("list search history join: {e}"))?
}

#[tauri::command]
pub async fn clear_search_history_cmd(
    paths: State<'_, AppPaths>,
    payload: SearchHistoryClearPayload,
) -> Result<(), String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let db = paths.db_path.clone();
    let aid = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || clear_search_history(&db, &aid))
        .await
        .map_err(|e| format!("clear search history join: {e}"))?
}

#[tauri::command]
pub async fn reindex_semantic_missing_cmd(
    paths: State<'_, AppPaths>,
    payload: ReindexMissingPayload,
) -> Result<SemanticReindexStats, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let db = paths.db_path.clone();
    let aid = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || reindex_semantic_missing(&db, &aid, true))
        .await
        .map_err(|e| format!("reindex semantic missing join: {e}"))?
}
