//! IPC vues de recherche enregistrées.

use rustymail_domain::{SavedSearch, SavedSearchListItem, SavedSearchUpsert};
use rustymail_infrastructure::{
    delete_saved_search, get_saved_search, list_saved_searches, mark_saved_search_seen,
    upsert_saved_search,
};
use tauri::State;

use crate::ipc_guard;
use crate::AppPaths;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchIdPayload {
    pub account_id: String,
    pub id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchListPayload {
    pub account_id: String,
    #[serde(default)]
    pub include_counts: bool,
}

#[tauri::command]
pub async fn list_saved_searches_cmd(
    paths: State<'_, AppPaths>,
    payload: SavedSearchListPayload,
) -> Result<Vec<SavedSearchListItem>, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    let include_counts = payload.include_counts;
    tauri::async_runtime::spawn_blocking(move || {
        list_saved_searches(&db, &account_id, include_counts)
    })
    .await
    .map_err(|e| format!("list saved searches join: {e}"))?
}

#[tauri::command]
pub async fn upsert_saved_search_cmd(
    paths: State<'_, AppPaths>,
    payload: SavedSearchUpsert,
) -> Result<SavedSearch, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    ipc_guard::validate_search_query(&payload.query)?;
    let name = payload.name.trim();
    if name.is_empty() || name.len() > 120 {
        return Err("name: libellé invalide (1–120 caractères).".into());
    }
    let db = paths.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || upsert_saved_search(&db, payload))
        .await
        .map_err(|e| format!("upsert saved search join: {e}"))?
}

#[tauri::command]
pub async fn delete_saved_search_cmd(
    paths: State<'_, AppPaths>,
    payload: SavedSearchIdPayload,
) -> Result<(), String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let id = payload.id.trim();
    if id.is_empty() || id.len() > 80 {
        return Err("id: identifiant invalide.".into());
    }
    let id = id.to_string();
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || delete_saved_search(&db, &account_id, &id))
        .await
        .map_err(|e| format!("delete saved search join: {e}"))?
}

#[tauri::command]
pub async fn get_saved_search_cmd(
    paths: State<'_, AppPaths>,
    payload: SavedSearchIdPayload,
) -> Result<SavedSearch, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let id = payload.id.trim();
    if id.is_empty() || id.len() > 80 {
        return Err("id: identifiant invalide.".into());
    }
    let id = id.to_string();
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || get_saved_search(&db, &account_id, &id))
        .await
        .map_err(|e| format!("get saved search join: {e}"))?
}

#[tauri::command]
pub async fn mark_saved_search_seen_cmd(
    paths: State<'_, AppPaths>,
    payload: SavedSearchIdPayload,
) -> Result<SavedSearch, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let id = payload.id.trim();
    if id.is_empty() || id.len() > 80 {
        return Err("id: identifiant invalide.".into());
    }
    let id = id.to_string();
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        mark_saved_search_seen(&db, &account_id, &id)
    })
    .await
    .map_err(|e| format!("mark saved search seen join: {e}"))?
}

#[tauri::command]
pub async fn apply_saved_search_cmd(
    paths: State<'_, AppPaths>,
    payload: SavedSearchIdPayload,
) -> Result<SavedSearch, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let id = payload.id.trim();
    if id.is_empty() || id.len() > 80 {
        return Err("id: identifiant invalide.".into());
    }
    let id = id.to_string();
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || get_saved_search(&db, &account_id, &id))
        .await
        .map_err(|e| format!("apply saved search join: {e}"))?
}
