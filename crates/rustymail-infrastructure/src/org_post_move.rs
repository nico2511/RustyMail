//! Après un déplacement IMAP : sync des dossiers touchés + retag heuristique des fils concernés.

use std::collections::HashSet;
use std::path::Path;

use rustymail_domain::Account;

use rusqlite::params;

use crate::org_retag::org_retag_threads;
use crate::open_sqlite_migrated;
use crate::reset_imap_last_uid;
use crate::resolve_scoped_mailbox_for_account;
use crate::sync_mailboxes_single_session;

const DEFAULT_SYNC_LIMIT: usize = 80;

#[derive(Debug, Clone)]
pub struct PostMoveRefreshOutcome {
    pub synced_mailboxes: Vec<String>,
    pub retagged_threads: usize,
}

/// Synchronise les dossiers indiqués puis recalcule les tags des fils listés (s’ils existent encore en base).
pub async fn post_move_heuristic_refresh(
    path: &Path,
    account: &Account,
    sync_mailboxes: impl IntoIterator<Item = String>,
    thread_ids: impl IntoIterator<Item = String>,
    limit_per_mailbox: Option<usize>,
) -> Result<PostMoveRefreshOutcome, String> {
    let mailboxes: Vec<String> = sync_mailboxes
        .into_iter()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    let threads: Vec<String> = thread_ids
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty() && !t.starts_with("mailbox:"))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    if !mailboxes.is_empty() {
        let account_id = account.id.0.as_str();
        for mb in &mailboxes {
            let _ = reset_imap_last_uid(path, account_id, mb);
        }
        let limit = limit_per_mailbox.unwrap_or(DEFAULT_SYNC_LIMIT);
        let _ = sync_mailboxes_single_session(path, account, &mailboxes, Some(limit)).await;
        if !threads.is_empty() {
            let path = path.to_path_buf();
            let account_id = account.id.0.clone();
            let mboxes = mailboxes.clone();
            let ids = threads.clone();
            let _ = tokio::task::spawn_blocking(move || {
                purge_relocated_orphans(&path, &account_id, &mboxes, &ids)
            })
            .await;
        }
    }

    let retagged_threads = if threads.is_empty() {
        0
    } else {
        let path = path.to_path_buf();
        let account_id = account.id.0.clone();
        let ids = threads.clone();
        tokio::task::spawn_blocking(move || {
            let conn = open_sqlite_migrated(&path).map_err(|e| e.to_string())?;
            org_retag_threads(&conn, &account_id, &ids)
        })
        .await
        .map_err(|e| format!("retag join: {e}"))??
    };

    Ok(PostMoveRefreshOutcome {
        synced_mailboxes: mailboxes,
        retagged_threads,
    })
}

/// Resync IMAP en arrière-plan (ne pas bloquer l’UI après un MOVE : le cache local est déjà à jour).
pub fn spawn_post_move_background_sync(
    path: std::path::PathBuf,
    account: Account,
    sync_mailboxes: Vec<String>,
    thread_ids: Vec<String>,
    limit_per_mailbox: usize,
) {
    if sync_mailboxes.is_empty() {
        return;
    }
    tokio::spawn(async move {
        if let Err(e) = post_move_heuristic_refresh(
            &path,
            &account,
            sync_mailboxes,
            thread_ids,
            Some(limit_per_mailbox),
        )
        .await
        {
            log::warn!(
                target: "rustymail::audit",
                "post_move_background_sync: {e}"
            );
        }
    });
}

/// Supprime les lignes locales sans `imap_uid` restées après un déplacement (doublons avant resync).
fn purge_relocated_orphans(
    path: &Path,
    account_id: &str,
    mailboxes: &[String],
    thread_ids: &[String],
) -> Result<usize, String> {
    if mailboxes.is_empty() || thread_ids.is_empty() {
        return Ok(0);
    }
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let mut total = 0usize;
    for mbox in mailboxes {
        let resolved = resolve_scoped_mailbox_for_account(&conn, account_id, mbox)
            .map_err(|e| e.to_string())?;
        for tid in thread_ids {
            let n = conn
                .execute(
                    "DELETE FROM messages
                     WHERE account_id = ?1 AND mailbox = ?2 AND thread_id = ?3 AND imap_uid IS NULL",
                    params![account_id.trim(), resolved.as_str(), tid.trim()],
                )
                .map_err(|e| e.to_string())?;
            total += n;
        }
    }
    Ok(total)
}
