//! IPC vue Dossiers (arbre personnel).

use rustymail_infrastructure::{
    archive_mailbox_threads, delete_imap_mailbox_with_contents, list_mailbox_tree, load_accounts,
    load_app_prefs, prefs_path_from_db_dir, rename_mailbox_subtree_local_cache,
    retag_threads_in_mailboxes, set_mailbox_locked, ArchiveMailboxThreadsOutcome,
    DeleteMailboxWithContentsOutcome, MailboxTreeReport,
};
use tauri::State;

use crate::ipc_guard;
use crate::AppPaths;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderAccountPayload {
    pub account_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetMailboxLockedPayload {
    pub account_id: String,
    pub mailbox: String,
    pub locked: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveMailboxPayload {
    pub account_id: String,
    pub mailbox: String,
    #[serde(default)]
    pub remember_auto_archive: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteMailboxWithContentsPayload {
    pub account_id: String,
    pub mailbox: String,
    pub destructive_ack: Option<String>,
}

fn resolve_account(
    paths: &AppPaths,
    account_id: &str,
) -> Result<rustymail_domain::Account, String> {
    let accounts = load_accounts(&paths.db_path).map_err(|e| e.to_string())?;
    let id = account_id.trim();
    accounts
        .into_iter()
        .find(|a| a.id.0 == id)
        .ok_or_else(|| format!("Compte introuvable : {id}"))
}

#[tauri::command]
pub async fn list_mailbox_tree_cmd(
    paths: State<'_, AppPaths>,
    payload: FolderAccountPayload,
) -> Result<MailboxTreeReport, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let db_path = paths.db_path.clone();
    let account_id = payload.account_id.clone();
    tauri::async_runtime::spawn_blocking(move || list_mailbox_tree(&db_path, account_id.trim()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_mailbox_locked_cmd(
    paths: State<'_, AppPaths>,
    payload: SetMailboxLockedPayload,
) -> Result<Vec<String>, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    ipc_guard::validate_mailbox(&payload.mailbox)?;
    let db_path = paths.db_path.clone();
    let account_id = payload.account_id.clone();
    let mailbox = payload.mailbox.clone();
    let locked = payload.locked;
    tauri::async_runtime::spawn_blocking(move || {
        set_mailbox_locked(&db_path, account_id.trim(), mailbox.trim(), locked)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn archive_mailbox_threads_cmd(
    paths: State<'_, AppPaths>,
    payload: ArchiveMailboxPayload,
) -> Result<ArchiveMailboxThreadsOutcome, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    ipc_guard::validate_mailbox(&payload.mailbox)?;
    let account = resolve_account(&paths, &payload.account_id)?;
    archive_mailbox_threads(
        &paths.db_path,
        &account,
        payload.mailbox.trim(),
        payload.remember_auto_archive,
    )
    .await
}

#[tauri::command]
pub async fn delete_imap_mailbox_with_contents_cmd(
    paths: State<'_, AppPaths>,
    payload: DeleteMailboxWithContentsPayload,
) -> Result<DeleteMailboxWithContentsOutcome, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    ipc_guard::validate_mailbox(&payload.mailbox)?;
    ipc_guard::validate_delete_mailbox_with_contents_ack(payload.destructive_ack.as_deref())?;
    let account = resolve_account(&paths, &payload.account_id)?;
    let prefs_path = prefs_path_from_db_dir(paths.db_path.parent().unwrap_or(&paths.db_path));
    let prefs = load_app_prefs(&prefs_path);
    delete_imap_mailbox_with_contents(&paths.db_path, &account, payload.mailbox.trim(), &prefs)
        .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameSubtreeRetagPayload {
    pub account_id: String,
    pub from_mailbox: String,
    pub to_mailbox: String,
}

#[tauri::command]
pub async fn rename_mailbox_subtree_retag_cmd(
    paths: State<'_, AppPaths>,
    payload: RenameSubtreeRetagPayload,
) -> Result<usize, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    ipc_guard::validate_mailbox(&payload.from_mailbox)?;
    ipc_guard::validate_mailbox(&payload.to_mailbox)?;
    let db_path = paths.db_path.clone();
    let account_id = payload.account_id.clone();
    let from = payload.from_mailbox.clone();
    let to = payload.to_mailbox.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (_, affected) = rename_mailbox_subtree_local_cache(
            &db_path,
            account_id.trim(),
            from.trim(),
            to.trim(),
        )?;
        retag_threads_in_mailboxes(&db_path, account_id.trim(), &affected)
    })
    .await
    .map_err(|e| e.to_string())?
}
