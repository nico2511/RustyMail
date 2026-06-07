//! Alignement du cache SQLite local après CREATE / RENAME / DELETE IMAP côté serveur.

use std::collections::HashSet;
use std::path::Path;

use rusqlite::{params, Connection};

use crate::imap::ops::mailbox_logical_path_key;
use crate::open_sqlite_migrated;
use crate::resolve_scoped_mailbox_for_account;

#[derive(Debug, Clone, Default)]
pub struct MailboxCacheRenameStats {
    pub messages_updated: usize,
    pub threads_updated: usize,
    pub imap_state_updated: usize,
}

#[derive(Debug, Clone, Default)]
pub struct MailboxCachePurgeStats {
    pub messages_deleted: usize,
    pub threads_deleted: usize,
    pub imap_state_deleted: usize,
}

fn collect_distinct_mailboxes(conn: &Connection, account_id: &str) -> Result<Vec<String>, String> {
    let aid = account_id.trim();
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let mut push = |m: String| {
        let t = m.trim().to_string();
        if t.is_empty() || !seen.insert(t.clone()) {
            return;
        }
        out.push(t);
    };
    let mut stmt = conn
        .prepare("SELECT DISTINCT mailbox FROM messages WHERE account_id = ?1")
        .map_err(|e| e.to_string())?;
    for row in stmt
        .query_map(params![aid], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
    {
        if let Ok(m) = row {
            push(m);
        }
    }
    let mut stmt2 = conn
        .prepare("SELECT DISTINCT mailbox FROM threads WHERE account_id = ?1")
        .map_err(|e| e.to_string())?;
    for row in stmt2
        .query_map(params![aid], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
    {
        if let Ok(m) = row {
            push(m);
        }
    }
    let mut stmt3 = conn
        .prepare("SELECT mailbox FROM imap_state WHERE account_id = ?1")
        .map_err(|e| e.to_string())?;
    for row in stmt3
        .query_map(params![aid], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
    {
        if let Ok(m) = row {
            push(m);
        }
    }
    Ok(out)
}

/// Toutes les orthographes SQLite qui désignent le même dossier que `requested` (clé logique LIST/UI).
fn mailbox_aliases_for_request(
    conn: &Connection,
    account_id: &str,
    requested: &str,
) -> Result<Vec<String>, String> {
    let resolved = resolve_scoped_mailbox_for_account(conn, account_id, requested.trim())
        .map_err(|e| e.to_string())?;
    let want = mailbox_logical_path_key(&resolved);
    let mut aliases: Vec<String> = Vec::new();
    let mut seen = HashSet::new();
    for m in collect_distinct_mailboxes(conn, account_id)? {
        if mailbox_logical_path_key(&m) == want
            || m.eq_ignore_ascii_case(resolved.trim())
            || m.eq_ignore_ascii_case(requested.trim())
        {
            if seen.insert(m.clone()) {
                aliases.push(m);
            }
        }
    }
    if aliases.is_empty() && !resolved.trim().is_empty() && seen.insert(resolved.clone()) {
        aliases.push(resolved);
    }
    Ok(aliases)
}

/// Après `RENAME` IMAP : recopie messages, fils et `imap_state` vers le nouveau nom.
pub fn rename_mailbox_local_cache(
    db_path: impl AsRef<Path>,
    account_id: &str,
    from_mailbox: &str,
    to_mailbox: &str,
) -> Result<MailboxCacheRenameStats, String> {
    let to = to_mailbox.trim();
    if to.is_empty() {
        return Err("Nouveau nom de dossier vide.".to_string());
    }
    let conn = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let aliases = mailbox_aliases_for_request(&conn, account_id, from_mailbox)?;
    if aliases.is_empty() {
        return Ok(MailboxCacheRenameStats::default());
    }
    let mut stats = MailboxCacheRenameStats::default();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for from in &aliases {
        let n = tx
            .execute(
                "UPDATE messages SET mailbox = ?1 WHERE account_id = ?2 AND mailbox = ?3",
                params![to, account_id.trim(), from],
            )
            .map_err(|e| e.to_string())?;
        stats.messages_updated += n;
        let n = tx
            .execute(
                "UPDATE threads SET mailbox = ?1 WHERE account_id = ?2 AND mailbox = ?3",
                params![to, account_id.trim(), from],
            )
            .map_err(|e| e.to_string())?;
        stats.threads_updated += n;
        let n = tx
            .execute(
                "UPDATE imap_state SET mailbox = ?1 WHERE account_id = ?2 AND mailbox = ?3",
                params![to, account_id.trim(), from],
            )
            .map_err(|e| e.to_string())?;
        stats.imap_state_updated += n;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(stats)
}

fn split_mailbox_segments(name: &str) -> Vec<String> {
    name.split(|c| c == '/' || c == '.')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

fn join_mailbox_segments(segments: &[String], delimiter: char) -> String {
    segments.join(&delimiter.to_string())
}

/// Reconstruit un chemin IMAP en remplaçant le préfixe logique `from` par `to`.
fn mailbox_with_replaced_prefix(from: &str, to: &str, mb: &str) -> Option<String> {
    let from_key = mailbox_logical_path_key(from);
    let _to_key = mailbox_logical_path_key(to);
    let mb_key = mailbox_logical_path_key(mb);
    if mb_key.len() < from_key.len() {
        return None;
    }
    if mb_key[..from_key.len()] != from_key[..] {
        return None;
    }
    if mb_key == from_key {
        return Some(to.trim().to_string());
    }
    let mb_segs = split_mailbox_segments(mb);
    if mb_segs.len() < from_key.len() {
        return None;
    }
    let to_segs = split_mailbox_segments(to);
    let suffix = mb_segs[from_key.len()..].to_vec();
    let mut out = to_segs;
    out.extend(suffix);
    let delim = if mb.contains('/') || to.contains('/') {
        '/'
    } else {
        '.'
    };
    Some(join_mailbox_segments(&out, delim))
}

/// Après `RENAME` IMAP d’un dossier parent : met à jour ce dossier et tous les descendants en cache.
pub fn rename_mailbox_subtree_local_cache(
    db_path: impl AsRef<Path>,
    account_id: &str,
    from_mailbox: &str,
    to_mailbox: &str,
) -> Result<(MailboxCacheRenameStats, Vec<String>), String> {
    let conn = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let all = collect_distinct_mailboxes(&conn, account_id)?;
    let mut renames: Vec<(String, String)> = Vec::new();
    for mb in all {
        if let Some(new_name) = mailbox_with_replaced_prefix(from_mailbox, to_mailbox, &mb) {
            if !new_name.eq_ignore_ascii_case(&mb) {
                renames.push((mb, new_name));
            }
        }
    }
    if renames.is_empty() {
        return Ok((MailboxCacheRenameStats::default(), Vec::new()));
    }
    renames.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    let mut stats = MailboxCacheRenameStats::default();
    let affected_mailboxes: Vec<String> = renames.iter().map(|(_, to)| to.clone()).collect();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (from, to) in &renames {
        let n = tx
            .execute(
                "UPDATE messages SET mailbox = ?1 WHERE account_id = ?2 AND mailbox = ?3",
                params![to, account_id.trim(), from],
            )
            .map_err(|e| e.to_string())?;
        stats.messages_updated += n;
        let n = tx
            .execute(
                "UPDATE threads SET mailbox = ?1 WHERE account_id = ?2 AND mailbox = ?3",
                params![to, account_id.trim(), from],
            )
            .map_err(|e| e.to_string())?;
        stats.threads_updated += n;
        let n = tx
            .execute(
                "UPDATE imap_state SET mailbox = ?1 WHERE account_id = ?2 AND mailbox = ?3",
                params![to, account_id.trim(), from],
            )
            .map_err(|e| e.to_string())?;
        stats.imap_state_updated += n;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok((stats, affected_mailboxes))
}

/// IDs de fils dont au moins un message est dans l’un des dossiers listés.
pub fn thread_ids_for_mailboxes(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailboxes: &[String],
) -> Result<Vec<String>, String> {
    if mailboxes.is_empty() {
        return Ok(Vec::new());
    }
    let conn = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for mb in mailboxes {
        let aliases = mailbox_aliases_for_request(&conn, account_id, mb)?;
        for alias in aliases {
            let mut stmt = conn
                .prepare(
                    "SELECT DISTINCT thread_id FROM messages
                     WHERE account_id = ?1 AND mailbox = ?2",
                )
                .map_err(|e| e.to_string())?;
            for row in stmt
                .query_map(params![account_id.trim(), alias], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .flatten()
            {
                if seen.insert(row.clone()) {
                    out.push(row);
                }
            }
        }
    }
    Ok(out)
}

/// Après `CREATE` IMAP : enregistre le dossier pour sync ultérieure (`last_uid = 0`).
pub fn register_mailbox_local_cache(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
) -> Result<(), String> {
    let mb = mailbox.trim();
    if mb.is_empty() {
        return Err("Nom de dossier vide.".to_string());
    }
    let conn = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO imap_state (account_id, mailbox, last_uid)
         VALUES (?1, ?2, 0)
         ON CONFLICT(account_id, mailbox) DO UPDATE SET
            last_uid = 0,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        params![account_id.trim(), mb],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Après `DELETE` IMAP : retire messages, fils orphelins, embeddings et `imap_state` pour ce dossier.
pub fn purge_mailbox_local_cache(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
) -> Result<MailboxCachePurgeStats, String> {
    let conn = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let aliases = mailbox_aliases_for_request(&conn, account_id, mailbox)?;
    if aliases.is_empty() {
        return Ok(MailboxCachePurgeStats::default());
    }
    let mut stats = MailboxCachePurgeStats::default();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for mb in &aliases {
        tx.execute(
            "DELETE FROM message_embeddings WHERE message_id IN (
                SELECT id FROM messages WHERE account_id = ?1 AND mailbox = ?2
            )",
            params![account_id.trim(), mb],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM message_attachments WHERE message_id IN (
                SELECT id FROM messages WHERE account_id = ?1 AND mailbox = ?2
            )",
            params![account_id.trim(), mb],
        )
        .map_err(|e| e.to_string())?;
        let n = tx
            .execute(
                "DELETE FROM messages WHERE account_id = ?1 AND mailbox = ?2",
                params![account_id.trim(), mb],
            )
            .map_err(|e| e.to_string())?;
        stats.messages_deleted += n;
        let n = tx
            .execute(
                "DELETE FROM threads WHERE account_id = ?1 AND mailbox = ?2
                 AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = threads.id)",
                params![account_id.trim(), mb],
            )
            .map_err(|e| e.to_string())?;
        stats.threads_deleted += n;
        let n = tx
            .execute(
                "DELETE FROM imap_state WHERE account_id = ?1 AND mailbox = ?2",
                params![account_id.trim(), mb],
            )
            .map_err(|e| e.to_string())?;
        stats.imap_state_deleted += n;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(stats)
}
