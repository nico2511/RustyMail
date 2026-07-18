//! Application des propositions d'organisation par lots.

use std::collections::HashSet;
use std::path::Path;

use rusqlite::{params, OptionalExtension};
use rustymail_domain::{Account, OrgApplyProgress, OrgProposal, OrgSuggestedAction};

use crate::imap::ops::{
    find_mailbox_list_entry, imap_delete_mailbox_with_fallback, imap_session_select_variants,
    list_selectable_mailbox_entries, list_selectable_mailboxes, mailbox_logical_path_key,
    mailbox_name_match_key, resolve_mailbox_imap_command_names,
};
use crate::mailbox_local_cache::purge_mailbox_local_cache;
use crate::login_session_for_account;
use crate::mail_ops::{
    move_thread_to_archive, move_thread_to_mailbox, move_thread_to_trash, pick_trash_folder,
    set_thread_seen,
};
use crate::org_retag::org_retag_account;
use crate::org_scan::{enrich_thread_ref, is_protected_mailbox_for_org_delete};
use crate::{load_accounts, open_sqlite_migrated};

const MAX_APPLY_THREAD_REFS: usize = 500;

/// Action effective après override UI éventuel.
pub fn resolve_apply_action(
    proposal: &OrgProposal,
    action_override: Option<&str>,
) -> OrgSuggestedAction {
    if let Some(o) = action_override {
        return match o.to_ascii_lowercase().as_str() {
            "trash" => OrgSuggestedAction::Trash,
            "archive" => OrgSuggestedAction::Archive,
            "markread" | "mark_read" => OrgSuggestedAction::MarkRead,
            "move" => OrgSuggestedAction::Move,
            "retag" => OrgSuggestedAction::Retag,
            _ => proposal.suggested_action,
        };
    }
    proposal.suggested_action
}

fn resolve_wire_mailbox(logical: &str, list: &[String]) -> Option<String> {
    let trimmed = logical.trim();
    if trimmed.is_empty() {
        return None;
    }
    if list.iter().any(|m| m == trimmed) {
        return Some(trimmed.to_string());
    }
    let key = mailbox_logical_path_key(trimmed);
    list.iter()
        .find(|m| mailbox_logical_path_key(m) == key)
        .cloned()
        .or_else(|| {
            let mk = mailbox_name_match_key(trimmed);
            list.iter().find(|m| mailbox_name_match_key(m) == mk).cloned()
        })
}

fn local_mailbox_has_messages(
    conn: &rusqlite::Connection,
    account_id: &str,
    mailbox: &str,
) -> Result<bool, String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM messages WHERE account_id = ?1 AND mailbox = ?2",
            params![account_id, mailbox],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

fn collect_mailbox_names(
    refs: &[(String, String)],
    thread_ids: Option<&[String]>,
) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (tid, mailbox) in refs {
        if !tid.starts_with("mailbox:") {
            continue;
        }
        if let Some(filter) = thread_ids {
            if !filter.contains(tid) {
                continue;
            }
        }
        let mb = mailbox.trim();
        if mb.is_empty() || !seen.insert(mb.to_string()) {
            continue;
        }
        out.push(mb.to_string());
    }
    out
}

async fn org_delete_mailboxes(
    path: &Path,
    account: &Account,
    mailboxes: Vec<String>,
) -> Result<OrgApplyProgress, String> {
    let account_id = account.id.0.as_str();
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let mut session = login_session_for_account(account).await?;
    let entries = list_selectable_mailbox_entries(&mut session).await?;
    let list: Vec<String> = entries.iter().map(|e| e.decoded_name.clone()).collect();

    let total = mailboxes.len();
    let mut done = 0usize;
    let mut errors = Vec::new();
    let mut threads_affected = Vec::new();

    for logical in mailboxes {
        if is_protected_mailbox_for_org_delete(&logical) {
            errors.push(format!("{logical}: dossier protégé (non supprimable)."));
            continue;
        }
        if local_mailbox_has_messages(&conn, account_id, &logical)? {
            errors.push(format!(
                "{logical}: encore des messages en cache local — synchronisez ou videz le dossier."
            ));
            continue;
        }
        let command_names = if find_mailbox_list_entry(&logical, &entries).is_some() {
            resolve_mailbox_imap_command_names(&logical, &entries)
        } else {
            match resolve_wire_mailbox(&logical, &list) {
                Some(w) => resolve_mailbox_imap_command_names(&w, &entries),
                None => Vec::new(),
            }
        };
        if command_names.is_empty() {
            let _ = purge_mailbox_local_cache(path, account_id, &logical);
            done += 1;
            threads_affected.push(format!("mailbox:{logical}"));
            continue;
        }
        let select_variants = command_names.clone();
        let mbox = match imap_session_select_variants(&mut session, &select_variants, Some(&list)).await
        {
            Ok((m, _)) => m,
            Err(e) => {
                let _ = purge_mailbox_local_cache(path, account_id, &logical);
                errors.push(format!(
                    "{logical}: absent du serveur — cache local retiré ({e})"
                ));
                done += 1;
                threads_affected.push(format!("mailbox:{logical}"));
                continue;
            }
        };
        if mbox.exists > 0 {
            errors.push(format!(
                "{logical}: non vide côté serveur ({} message(s)) — synchronisez ce dossier puis relancez l’analyse.",
                mbox.exists
            ));
            continue;
        }
        match imap_delete_mailbox_with_fallback(&mut session, &command_names).await {
            Ok(_) => {}
            Err(e) => {
                errors.push(format!("{logical}: {e}"));
                continue;
            }
        }
        if let Err(e) = purge_mailbox_local_cache(path, account_id, &logical) {
            errors.push(format!("{logical}: nettoyage local : {e}"));
            continue;
        }
        done += 1;
        threads_affected.push(format!("mailbox:{logical}"));
    }

    let _ = session.logout().await;

    let message = if total == 0 {
        "Aucun dossier à supprimer.".to_string()
    } else {
        format!("{done}/{total} dossier(s) vide(s) supprimé(s).")
    };

    Ok(OrgApplyProgress {
        done,
        total,
        message,
        errors,
        mailboxes_to_sync: Vec::new(),
        threads_affected,
    })
}

/// Valide une proposition issue du scan UI (y compris cartes LLM) et enrichit les refs depuis SQLite.
pub fn prepare_org_proposal_for_apply(
    path: &Path,
    account_id: &str,
    proposal_id: &str,
    mut proposal: OrgProposal,
) -> Result<OrgProposal, String> {
    if proposal.id != proposal_id {
        return Err("Identifiant de proposition incohérent.".to_string());
    }
    if proposal.thread_refs.len() > MAX_APPLY_THREAD_REFS {
        return Err(format!(
            "Trop de fils ({}) ; maximum {MAX_APPLY_THREAD_REFS}.",
            proposal.thread_refs.len()
        ));
    }
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    proposal.thread_refs = proposal
        .thread_refs
        .into_iter()
        .map(|r| enrich_thread_ref(&conn, account_id, r))
        .collect();
    proposal.total_count = proposal.thread_refs.len();
    Ok(proposal)
}

/// Applique une proposition déjà résolue (scan UI ou `prepare_org_proposal_for_apply`).
/// Ne refait pas de scan : les cartes `llm-*` doivent être passées via snapshot côté IPC.
pub async fn org_apply_proposal_with(
    path: &Path,
    account_id: &str,
    proposal: OrgProposal,
    thread_ids: Option<Vec<String>>,
    action_override: Option<&str>,
) -> Result<OrgApplyProgress, String> {
    let accounts = load_accounts(path)?;
    let account = accounts
        .into_iter()
        .find(|a| a.id.0 == account_id)
        .ok_or_else(|| "Compte introuvable.".to_string())?;

    let ids: Vec<(String, String)> = if let Some(filter) = thread_ids {
        proposal
            .thread_refs
            .iter()
            .filter(|r| filter.contains(&r.thread_id))
            .map(|r| (r.thread_id.clone(), r.mailbox.clone()))
            .collect()
    } else {
        proposal
            .thread_refs
            .iter()
            .map(|r| (r.thread_id.clone(), r.mailbox.clone()))
            .collect()
    };

    if !proposal.applicable {
        return Err(
            "Cette proposition est un conseil (aucune action automatique). Utilisez les liens dossier ou Paramètres → Archivage."
                .to_string(),
        );
    }

    let action = resolve_apply_action(&proposal, action_override);

    if matches!(action, OrgSuggestedAction::Move) && proposal.target_mailbox.is_none() {
        return Err("Dossier cible manquant pour ce déplacement.".to_string());
    }

    match action {
        OrgSuggestedAction::Retag => {
            return org_retag_account(path, account_id, false);
        }
        OrgSuggestedAction::RepairThreading => {
            return Err("Réparation de fils : action non implémentée dans ce lot.".to_string());
        }
        OrgSuggestedAction::DeleteMailbox => {
            let mailboxes = collect_mailbox_names(&ids, None);
            return org_delete_mailboxes(path, &account, mailboxes).await;
        }
        _ => {}
    }

    let mut done = 0usize;
    let total = ids.len();
    let mut errors = Vec::new();
    let mut sync_mailboxes: HashSet<String> = HashSet::new();
    let mut threads_affected: Vec<String> = Vec::new();

    let trash_folder = if matches!(action, OrgSuggestedAction::Trash) {
        list_selectable_mailboxes(&account)
            .await
            .ok()
            .and_then(|list| pick_trash_folder(&list).map(|s| s.to_string()))
    } else {
        None
    };

    for (tid, mailbox) in ids {
        if tid.starts_with("mailbox:") {
            continue;
        }
        let result = match action {
            OrgSuggestedAction::Trash => move_thread_to_trash(path, &account, &mailbox, &tid)
                .await
                .map(|out| {
                    sync_mailboxes.insert(out.dest_mailbox.clone());
                    out.message
                }),
            OrgSuggestedAction::Archive => move_thread_to_archive(path, &account, &mailbox, &tid)
                .await
                .map(|out| {
                    sync_mailboxes.insert(out.dest_mailbox);
                    out.message
                }),
            OrgSuggestedAction::Move => {
                let dest = proposal
                    .target_mailbox
                    .as_deref()
                    .ok_or_else(|| "Dossier cible manquant.".to_string())?;
                move_thread_to_mailbox(path, &account, &mailbox, &tid, dest)
                    .await
                    .map(|out| {
                        sync_mailboxes.insert(out.dest_mailbox.clone());
                        out.message
                    })
            }
            OrgSuggestedAction::MarkRead => {
                set_thread_seen(path, &account, &mailbox, &tid, true).await
            }
            _ => Ok(String::new()),
        };
        match result {
            Ok(msg) => {
                done += 1;
                threads_affected.push(tid.clone());
                sync_mailboxes.insert(mailbox.clone());
                match action {
                    OrgSuggestedAction::Trash => {
                        let _ = msg;
                        if let Some(ref t) = trash_folder {
                            sync_mailboxes.insert(t.clone());
                        }
                    }
                    OrgSuggestedAction::Archive => {
                        let _ = msg;
                    }
                    OrgSuggestedAction::Move => {
                        if let Some(ref d) = proposal.target_mailbox {
                            sync_mailboxes.insert(d.clone());
                        }
                    }
                    _ => {}
                }
            }
            Err(e) => errors.push(format!("{tid}: {e}")),
        }
    }

    Ok(OrgApplyProgress {
        done,
        total,
        message: format!("{done}/{total} fil(s) traités."),
        errors,
        mailboxes_to_sync: sync_mailboxes.into_iter().collect(),
        threads_affected,
    })
}

pub fn org_resolve_archive_path(
    path: &Path,
    thread_id: &str,
) -> Result<String, String> {
    let prefs_path = crate::app_prefs::prefs_path_from_db_dir(path.parent().unwrap_or(path));
    let prefs = crate::app_prefs::load_app_prefs(&prefs_path);
    let layout = crate::archive_layout::parse_archive_layout(&prefs.general.archive_layout);
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let received_at: String = conn
        .query_row(
            "SELECT COALESCE(MAX(received_at), datetime('now')) FROM messages WHERE thread_id = ?1",
            [thread_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let flat = "Archive".to_string();
    Ok(crate::archive_layout::resolve_archive_target(
        layout,
        &prefs.general.archive_root,
        &prefs.general.mother_language,
        &received_at,
        &flat,
    ))
}

/// Vérifie que les `threadIds` partiels appartiennent à la proposition et au compte.
pub fn validate_org_apply_thread_ids(
    db_path: &Path,
    account_id: &str,
    proposal: &OrgProposal,
    thread_ids: &[String],
) -> Result<(), String> {
    if thread_ids.is_empty() {
        return Ok(());
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let allowed: HashSet<String> = proposal
        .thread_refs
        .iter()
        .map(|r| r.thread_id.clone())
        .collect();
    let account_id = account_id.trim();
    for id in thread_ids {
        let tid = id.trim();
        if tid.starts_with("mailbox:") {
            if proposal.suggested_action != OrgSuggestedAction::DeleteMailbox {
                return Err(format!(
                    "threadId « {tid} » : référence dossier invalide pour cette action."
                ));
            }
            continue;
        }
        if !allowed.contains(tid) {
            return Err(format!(
                "threadId « {tid} » : absent de la proposition « {} ».",
                proposal.id
            ));
        }
        let owned: Option<i64> = conn
            .query_row(
                "SELECT 1 FROM threads WHERE id = ?1 AND account_id = ?2 LIMIT 1",
                params![tid, account_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if owned.is_none() {
            return Err(format!(
                "threadId « {tid} » : fil introuvable pour ce compte."
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use rustymail_domain::{
        OrgProposal, OrgProposalKind, OrgProposalSource, OrgSuggestedAction, OrgThreadRef,
    };
    use tempfile::tempdir;

    use crate::open_sqlite_migrated;
    use crate::org_scan::is_protected_mailbox_for_org_delete;

    fn sample_proposal(thread_id: &str, applicable: bool) -> OrgProposal {
        OrgProposal {
            id: "test-prop".into(),
            kind: OrgProposalKind::StaleInboxRead,
            section: "range".into(),
            title: "Test".into(),
            rationale: "Test".into(),
            thread_refs: vec![OrgThreadRef {
                thread_id: thread_id.into(),
                mailbox: "INBOX".into(),
                subject: "Hi".into(),
                ..Default::default()
            }],
            thread_ids: vec![thread_id.into()],
            suggested_action: OrgSuggestedAction::Archive,
            target_mailbox: None,
            confidence: 1.0,
            source: OrgProposalSource::Heuristic,
            total_count: 1,
            applicable,
            llm_search_keywords: Vec::new(),
            explain_rule_id: Some("test-prop".into()),
            explain_signals: vec!["test".into()],
            unsubscribe_links: Vec::new(),
        }
    }

    #[test]
    fn validate_rejects_thread_not_in_proposal() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("org.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
             VALUES ('a1', 'Test', 't@example.com', 'h', 993, 'tls', 0, 'h', 465, 'tls', 0)",
            [],
        )
        .expect("account");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags)
             VALUES ('t-other', 'a1', 'INBOX', 'm1', 'Hi', '')",
            [],
        )
        .expect("thread");
        drop(conn);
        let proposal = sample_proposal("t-allowed", true);
        let err = validate_org_apply_thread_ids(&path, "a1", &proposal, &["t-other".into()])
            .expect_err("foreign id");
        assert!(err.contains("absent de la proposition"));
    }

    #[test]
    fn validate_rejects_thread_on_wrong_account() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("org.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        for id in ["a1", "a2"] {
            conn.execute(
                "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
                 VALUES (?1, 'Test', 't@example.com', 'h', 993, 'tls', 0, 'h', 465, 'tls', 0)",
                params![id],
            )
            .expect("account");
        }
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags)
             VALUES ('t-x', 'a2', 'INBOX', 'm1', 'Hi', '')",
            [],
        )
        .expect("thread");
        drop(conn);
        let proposal = sample_proposal("t-x", true);
        let err = validate_org_apply_thread_ids(&path, "a1", &proposal, &["t-x".into()])
            .expect_err("wrong account");
        assert!(err.contains("introuvable pour ce compte"));
    }

    #[test]
    fn protected_mailbox_for_org_delete() {
        assert!(is_protected_mailbox_for_org_delete("INBOX"));
        assert!(is_protected_mailbox_for_org_delete("[Gmail]/All Mail"));
        assert!(!is_protected_mailbox_for_org_delete("Projects/2025"));
    }

    #[tokio::test]
    async fn apply_rejects_non_applicable_proposal() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("org.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
             VALUES ('a1', 'Test', 't@example.com', 'h', 993, 'tls', 0, 'h', 465, 'tls', 0)",
            [],
        )
        .expect("account");
        drop(conn);
        let proposal = sample_proposal("t1", false);
        let err = org_apply_proposal_with(&path, "a1", proposal, None, None)
            .await
            .expect_err("non applicable");
        assert!(err.contains("conseil"));
    }
}
