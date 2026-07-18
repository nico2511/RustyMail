//! Opérations dossiers pour la vue Dossiers (structure, archivage lot, suppression avec contenu).

use std::collections::HashSet;
use std::path::Path;

use rustymail_domain::{Account, OrgMailboxEntry, OrgMailboxStructure};
use serde::Serialize;

use crate::app_prefs::{
    is_mailbox_locked_in_prefs, list_locked_mailboxes_for_account, load_app_prefs,
    prefs_path_from_db_dir, save_app_prefs, set_mailbox_locked_in_prefs, AppPrefs,
};
use crate::imap::ops::{
    expunge_after_delete_flags, format_uid_set, imap_delete_mailbox_with_fallback,
    imap_session_select_mailbox, list_selectable_mailbox_entries, mailbox_logical_path_key,
    resolve_mailbox_imap_command_names, uid_store,
};
use crate::imap::{login_session_for_account, ImapSession};
use crate::mail_ops::{is_sent_like_mailbox, is_trash_like_mailbox, move_thread_to_archive};
use crate::mailbox_local_cache::{purge_mailbox_local_cache, thread_ids_for_mailboxes};
use crate::org_mailbox_structure::analyze_mailbox_structure;
use crate::org_memory::{
    clear_mailbox_auto_archive, list_auto_archive_mailboxes, set_mailbox_auto_archive,
};
use crate::org_post_move::spawn_post_move_background_sync;
use crate::org_retag::org_retag_threads;
use crate::org_scan::{is_archive_like_mailbox, is_protected_mailbox_for_org_delete};
use crate::{open_sqlite_migrated, resolve_scoped_mailbox_for_account};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailboxTreeEntry {
    pub mailbox: String,
    pub thread_count: usize,
    pub message_count: usize,
    pub depth: u32,
    pub is_system: bool,
    pub is_empty: bool,
}

impl From<OrgMailboxEntry> for MailboxTreeEntry {
    fn from(e: OrgMailboxEntry) -> Self {
        Self {
            mailbox: e.mailbox,
            thread_count: e.thread_count,
            message_count: e.message_count,
            depth: e.depth,
            is_system: e.is_system,
            is_empty: e.is_empty,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailboxTreeReport {
    pub entries: Vec<MailboxTreeEntry>,
    pub locked_mailboxes: Vec<String>,
    pub auto_archive_mailboxes: Vec<String>,
    pub summary: OrgMailboxStructure,
}

pub fn list_mailbox_tree(db_path: &Path, account_id: &str) -> Result<MailboxTreeReport, String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let (structure, _) = analyze_mailbox_structure(&conn, account_id)?;
    let prefs_path = prefs_path_from_db_dir(db_path.parent().unwrap_or(db_path));
    let prefs = load_app_prefs(&prefs_path);
    let locked = list_locked_mailboxes_for_account(&prefs, account_id);
    let auto_archive = list_auto_archive_mailboxes(&conn, account_id)?;
    let entries: Vec<MailboxTreeEntry> = structure
        .entries
        .iter()
        .filter(|e| !e.is_system)
        .cloned()
        .map(MailboxTreeEntry::from)
        .collect();
    Ok(MailboxTreeReport {
        entries,
        locked_mailboxes: locked,
        auto_archive_mailboxes: auto_archive,
        summary: structure,
    })
}

pub fn set_mailbox_locked(
    db_path: &Path,
    account_id: &str,
    mailbox: &str,
    locked: bool,
) -> Result<Vec<String>, String> {
    let prefs_path = prefs_path_from_db_dir(db_path.parent().unwrap_or(db_path));
    let mut prefs = load_app_prefs(&prefs_path);
    set_mailbox_locked_in_prefs(&mut prefs, account_id, mailbox, locked)?;
    save_app_prefs(&prefs_path, &prefs)?;
    Ok(list_locked_mailboxes_for_account(&prefs, account_id))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveMailboxThreadsOutcome {
    pub archived: usize,
    pub errors: Vec<String>,
    pub dest_mailboxes: Vec<String>,
}

pub async fn archive_mailbox_threads(
    db_path: &Path,
    account: &Account,
    mailbox: &str,
    remember_auto_archive: bool,
) -> Result<ArchiveMailboxThreadsOutcome, String> {
    let mb = mailbox.trim();
    if mb.is_empty() {
        return Err("Dossier vide.".into());
    }
    if is_archive_like_mailbox(mb) || is_trash_like_mailbox(mb) || is_sent_like_mailbox(mb) {
        return Err("Ce dossier ne peut pas être archivé (archive, corbeille ou envoyés).".into());
    }
    let prefs_path = prefs_path_from_db_dir(db_path.parent().unwrap_or(db_path));
    let prefs = load_app_prefs(&prefs_path);
    if is_mailbox_locked_in_prefs(&prefs, &account.id.0, mb) {
        return Err("Dossier verrouillé — déverrouillez-le pour archiver.".into());
    }

    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let resolved =
        resolve_scoped_mailbox_for_account(&conn, &account.id.0, mb).map_err(|e| e.to_string())?;
    drop(conn);
    let thread_ids = thread_ids_for_mailboxes(db_path, &account.id.0, &[resolved.clone()])?;

    if remember_auto_archive {
        set_mailbox_auto_archive(db_path, &account.id.0, mb)?;
    } else {
        clear_mailbox_auto_archive(db_path, &account.id.0, mb)?;
    }

    if thread_ids.is_empty() {
        return Ok(ArchiveMailboxThreadsOutcome {
            archived: 0,
            errors: Vec::new(),
            dest_mailboxes: Vec::new(),
        });
    }

    let mut archived = 0usize;
    let mut errors = Vec::new();
    let mut dest_set: HashSet<String> = HashSet::new();

    for tid in &thread_ids {
        match move_thread_to_archive(db_path, account, &resolved, tid).await {
            Ok(out) => {
                archived += 1;
                dest_set.insert(out.dest_mailbox);
            }
            Err(e) => errors.push(format!("{tid}: {e}")),
        }
    }

    let dest_mailboxes: Vec<String> = dest_set.into_iter().collect();
    if archived > 0 {
        let mut sync_mbs = vec![resolved.clone()];
        sync_mbs.extend(dest_mailboxes.clone());
        spawn_post_move_background_sync(
            db_path.to_path_buf(),
            account.clone(),
            sync_mbs,
            dest_mailboxes.clone(),
            thread_ids.clone(),
            25,
        );
    }

    Ok(ArchiveMailboxThreadsOutcome {
        archived,
        errors,
        dest_mailboxes,
    })
}

fn descendant_mailboxes(logical_target: &str, all: &[String]) -> Vec<String> {
    let target_key = mailbox_logical_path_key(logical_target);
    let mut hits: Vec<String> = all
        .iter()
        .filter(|name| {
            let key = mailbox_logical_path_key(name);
            key.len() >= target_key.len() && key[..target_key.len()] == target_key[..]
        })
        .cloned()
        .collect();
    hits.sort_by_key(|n| mailbox_logical_path_key(n).len());
    hits.reverse();
    hits
}

fn imap_uids_for_mailbox(path: &Path, account_id: &str, mailbox: &str) -> Result<Vec<u32>, String> {
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let resolved = resolve_scoped_mailbox_for_account(&conn, account_id, mailbox)
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT imap_uid FROM messages
             WHERE account_id = ?1 AND lower(trim(mailbox)) = lower(trim(?2))
               AND imap_uid IS NOT NULL AND imap_uid > 0",
        )
        .map_err(|e| e.to_string())?;
    let mut imap_uids: Vec<u32> = stmt
        .query_map(
            rusqlite::params![account_id.trim(), resolved.as_str()],
            |row| row.get::<_, i64>(0).map(|u| u as u32),
        )
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    imap_uids.sort_unstable();
    imap_uids.dedup();
    Ok(imap_uids)
}

async fn expunge_uids_in_mailbox(
    session: &mut ImapSession,
    mailbox: &str,
    imap_uids: &[u32],
) -> Result<usize, String> {
    if imap_uids.is_empty() {
        return Ok(0);
    }
    imap_session_select_mailbox(session, mailbox).await?;
    const CHUNK: usize = 500;
    for chunk in imap_uids.chunks(CHUNK) {
        let set = format_uid_set(chunk);
        uid_store(session, &set, "+FLAGS (\\Deleted)").await?;
    }
    expunge_after_delete_flags(session).await?;
    Ok(imap_uids.len())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteMailboxWithContentsOutcome {
    pub deleted_mailboxes: usize,
    pub messages_removed: usize,
    pub errors: Vec<String>,
}

pub async fn delete_imap_mailbox_with_contents(
    db_path: &Path,
    account: &Account,
    mailbox: &str,
    prefs: &AppPrefs,
) -> Result<DeleteMailboxWithContentsOutcome, String> {
    let logical = mailbox.trim();
    if logical.is_empty() {
        return Err("Dossier vide.".into());
    }
    if is_protected_mailbox_for_org_delete(logical) {
        return Err("Dossier système protégé — suppression interdite.".into());
    }
    if is_mailbox_locked_in_prefs(prefs, &account.id.0, logical) {
        return Err("Dossier verrouillé — déverrouillez-le pour supprimer.".into());
    }

    let mut session = login_session_for_account(account).await?;
    let entries = list_selectable_mailbox_entries(&mut session).await?;
    let list: Vec<String> = entries.iter().map(|e| e.decoded_name.clone()).collect();
    let targets = descendant_mailboxes(logical, &list);
    if targets.is_empty() {
        let _ = purge_mailbox_local_cache(db_path, &account.id.0, logical);
        let _ = session.logout().await;
        return Ok(DeleteMailboxWithContentsOutcome {
            deleted_mailboxes: 1,
            messages_removed: 0,
            errors: Vec::new(),
        });
    }

    let mut deleted_mailboxes = 0usize;
    let mut messages_removed = 0usize;
    let mut errors = Vec::new();

    for target in &targets {
        let command_names = resolve_mailbox_imap_command_names(target, &entries);
        if command_names.is_empty() {
            if let Ok(stats) = purge_mailbox_local_cache(db_path, &account.id.0, target) {
                messages_removed += stats.messages_deleted;
                deleted_mailboxes += 1;
            }
            continue;
        }
        match imap_session_select_mailbox(&mut session, command_names[0].as_str()).await {
            Ok(_) => {
                let uids =
                    imap_uids_for_mailbox(db_path, &account.id.0, target).unwrap_or_default();
                if let Ok(n) =
                    expunge_uids_in_mailbox(&mut session, command_names[0].as_str(), &uids).await
                {
                    messages_removed += n;
                }
            }
            Err(e) => {
                errors.push(format!("{target}: SELECT — {e}"));
                continue;
            }
        }
        match imap_delete_mailbox_with_fallback(&mut session, &command_names).await {
            Ok(_) => {
                if let Ok(stats) = purge_mailbox_local_cache(db_path, &account.id.0, target) {
                    messages_removed += stats.messages_deleted;
                }
                deleted_mailboxes += 1;
            }
            Err(e) => errors.push(format!("{target}: DELETE — {e}")),
        }
    }

    let _ = session.logout().await;
    Ok(DeleteMailboxWithContentsOutcome {
        deleted_mailboxes,
        messages_removed,
        errors,
    })
}

pub fn retag_threads_in_mailboxes(
    db_path: &Path,
    account_id: &str,
    mailboxes: &[String],
) -> Result<usize, String> {
    let thread_ids = thread_ids_for_mailboxes(db_path, account_id, mailboxes)?;
    if thread_ids.is_empty() {
        return Ok(0);
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    org_retag_threads(&conn, account_id, &thread_ids)
}
