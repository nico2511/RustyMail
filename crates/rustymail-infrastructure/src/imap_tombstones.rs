//! Tombstones UID IMAP : empêchent une sync concurrente de réinsérer un message
//! juste après un MOVE / suppression locale.

use chrono::{Duration, Utc};
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::Path;

use crate::open_sqlite_migrated;
use crate::resolve_scoped_mailbox_for_account;

/// Durée pendant laquelle un UID déplacé/supprimé ne doit pas être réécrit par la sync.
pub const TOMBSTONE_TTL_MINUTES: i64 = 15;

pub fn migrate_imap_tombstones(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS imap_uid_tombstones (
            account_id TEXT NOT NULL,
            mailbox TEXT NOT NULL,
            imap_uid INTEGER NOT NULL,
            thread_id TEXT,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            PRIMARY KEY (account_id, mailbox, imap_uid)
        );
        CREATE INDEX IF NOT EXISTS idx_imap_uid_tombstones_expires
          ON imap_uid_tombstones(expires_at);
        CREATE INDEX IF NOT EXISTS idx_imap_uid_tombstones_thread
          ON imap_uid_tombstones(account_id, thread_id);
        ",
    )?;
    Ok(())
}

fn expires_at_iso() -> String {
    (Utc::now() + Duration::minutes(TOMBSTONE_TTL_MINUTES))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Enregistre des UIDs comme « récemment retirés » de `mailbox` (chemin logique ou nom IMAP).
pub fn record_imap_uid_tombstones(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
    uids: &[u32],
    thread_id: Option<&str>,
) -> Result<usize, String> {
    if uids.is_empty() {
        return Ok(0);
    }
    let mut conn = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let resolved = resolve_scoped_mailbox_for_account(&conn, account_id, mailbox)
        .map_err(|e| e.to_string())?;
    let expires = expires_at_iso();
    let tid = thread_id.map(|t| t.trim()).filter(|t| !t.is_empty());
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut n = 0usize;
    for uid in uids {
        if *uid == 0 {
            continue;
        }
        tx.execute(
            "
            INSERT INTO imap_uid_tombstones (account_id, mailbox, imap_uid, thread_id, expires_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(account_id, mailbox, imap_uid) DO UPDATE SET
                thread_id = COALESCE(excluded.thread_id, imap_uid_tombstones.thread_id),
                expires_at = excluded.expires_at,
                created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            ",
            params![
                account_id.trim(),
                resolved.as_str(),
                *uid as i64,
                tid,
                expires.as_str()
            ],
        )
        .map_err(|e| e.to_string())?;
        n += 1;
    }
    // Nettoyage opportuniste des tombstones expirés (même compte).
    let _ = tx.execute(
        "DELETE FROM imap_uid_tombstones WHERE account_id = ?1 AND expires_at <= ?2",
        params![
            account_id.trim(),
            Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
        ],
    );
    tx.commit().map_err(|e| e.to_string())?;
    Ok(n)
}

/// UIDs encore protégés (non expirés) pour un dossier.
pub fn active_tombstone_uids(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
) -> Result<HashSet<u32>, String> {
    let conn = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    active_tombstone_uids_conn(&conn, account_id, mailbox)
}

pub fn active_tombstone_uids_conn(
    conn: &Connection,
    account_id: &str,
    mailbox: &str,
) -> Result<HashSet<u32>, String> {
    let resolved = resolve_scoped_mailbox_for_account(conn, account_id, mailbox)
        .map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let mut stmt = conn
        .prepare(
            "
            SELECT imap_uid FROM imap_uid_tombstones
            WHERE account_id = ?1 AND mailbox = ?2 AND expires_at > ?3
            ",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id.trim(), resolved.as_str(), now], |r| {
            let uid: i64 = r.get(0)?;
            Ok(uid.max(0) as u32)
        })
        .map_err(|e| e.to_string())?;
    let mut out = HashSet::new();
    for row in rows {
        let uid = row.map_err(|e| e.to_string())?;
        if uid > 0 {
            out.insert(uid);
        }
    }
    Ok(out)
}

/// Filtre une liste d’UIDs en retirant ceux encore tombstonés.
pub fn filter_tombstoned_uids(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
    uids: &mut Vec<u32>,
) -> Result<usize, String> {
    if uids.is_empty() {
        return Ok(0);
    }
    let blocked = active_tombstone_uids(db_path, account_id, mailbox)?;
    if blocked.is_empty() {
        return Ok(0);
    }
    let before = uids.len();
    uids.retain(|u| !blocked.contains(u));
    Ok(before.saturating_sub(uids.len()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn seed_mailbox(conn: &Connection) {
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, subject) VALUES ('t1', 'acc', 'INBOX', 's')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn tombstone_blocks_uid_until_expiry_window() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("mail.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        seed_mailbox(&conn);
        drop(conn);

        let n = record_imap_uid_tombstones(&path, "acc", "INBOX", &[42, 43, 0], Some("t1"))
            .expect("record");
        assert_eq!(n, 2);

        let active = active_tombstone_uids(&path, "acc", "INBOX").unwrap();
        assert!(active.contains(&42));
        assert!(active.contains(&43));
        assert!(!active.contains(&0));

        let mut uids = vec![40u32, 42, 43, 99];
        let skipped = filter_tombstoned_uids(&path, "acc", "INBOX", &mut uids).unwrap();
        assert_eq!(skipped, 2);
        assert_eq!(uids, vec![40, 99]);
    }

    #[test]
    fn tombstone_upsert_extends_expiry() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("mail.db");
        let _ = open_sqlite_migrated(&path).expect("migrate");

        record_imap_uid_tombstones(&path, "acc", "INBOX", &[7], Some("t-a")).unwrap();
        record_imap_uid_tombstones(&path, "acc", "INBOX", &[7], Some("t-b")).unwrap();

        let conn = open_sqlite_migrated(&path).unwrap();
        let (tid, count): (Option<String>, i64) = conn
            .query_row(
                "SELECT thread_id, COUNT(*) FROM imap_uid_tombstones WHERE account_id='acc' AND imap_uid=7",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(tid.as_deref(), Some("t-b"));
    }
}
