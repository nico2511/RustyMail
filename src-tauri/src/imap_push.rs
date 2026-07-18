//! Veille IMAP en arrière-plan : événement `imap-push` vers le WebView.

use std::path::Path;
use std::sync::Arc;

use rustymail_infrastructure::{load_accounts, ImapIdleCoordinator, ImapPushEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::AppPaths;

pub struct ImapPushHandle(pub Arc<ImapIdleCoordinator>);

pub fn start_imap_push(app: &AppHandle, db_path: Arc<std::path::PathBuf>) {
    let app_emit = app.clone();
    let coord = ImapIdleCoordinator::new(
        db_path,
        Arc::new(move |ev: ImapPushEvent| {
            let _ = app_emit.emit("imap-push", ev);
        }),
    );
    let dispatcher = Arc::clone(&coord);
    tauri::async_runtime::spawn(async move {
        dispatcher.run_dispatcher().await;
    });
    app.manage(ImapPushHandle(coord));
}

pub fn refresh_imap_push_accounts(app: &AppHandle, paths: &AppPaths) {
    refresh_imap_push_accounts_db(app, paths.db_path.as_path());
}

pub fn refresh_imap_push_accounts_db(app: &AppHandle, db_path: &Path) {
    let coord = app.try_state::<ImapPushHandle>();
    let Some(coord) = coord.as_ref() else {
        return;
    };
    if let Ok(accounts) = load_accounts(db_path) {
        coord.0.sync_accounts(&accounts);
    }
}

/// Informe IDLE du dossier actuellement affiché (sync hors INBOX).
pub fn set_focused_mailbox(app: &AppHandle, account_id: &str, mailbox: &str) {
    let Some(coord) = app.try_state::<ImapPushHandle>() else {
        return;
    };
    coord.0.set_focused_mailbox(account_id, mailbox);
}
