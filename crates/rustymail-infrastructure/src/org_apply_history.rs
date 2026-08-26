//! Historique des actions Organize (undo).

use rusqlite::{params, Connection, OptionalExtension};
use rustymail_domain::OrgApplyHistoryEntry;
use std::path::Path;
use uuid::Uuid;

use crate::open_sqlite_migrated;

pub fn migrate_org_apply_history(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS org_apply_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            batch_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            action TEXT NOT NULL,
            from_mailbox TEXT NOT NULL,
            to_mailbox TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            undone INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_org_apply_history_account
            ON org_apply_history(account_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_org_apply_history_batch
            ON org_apply_history(account_id, batch_id);
        ",
    )
}

pub fn new_batch_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn record_apply_entries(
    db_path: &Path,
    account_id: &str,
    batch_id: &str,
    entries: &[(String, String, String, Option<String>)],
) -> Result<(), String> {
    // (thread_id, action, from_mailbox, to_mailbox)
    if entries.is_empty() {
        return Ok(());
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (thread_id, action, from_mb, to_mb) in entries {
        tx.execute(
            "INSERT INTO org_apply_history
             (account_id, batch_id, thread_id, action, from_mailbox, to_mailbox)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                account_id.trim(),
                batch_id,
                thread_id,
                action,
                from_mb,
                to_mb
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_recent_history(
    db_path: &Path,
    account_id: &str,
    limit: usize,
) -> Result<Vec<OrgApplyHistoryEntry>, String> {
    let lim = limit.clamp(1, 200) as i64;
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, batch_id, thread_id, action, from_mailbox, to_mailbox,
                    created_at, undone
             FROM org_apply_history WHERE account_id = ?1
             ORDER BY created_at DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id.trim(), lim], |row| {
            Ok(OrgApplyHistoryEntry {
                id: row.get(0)?,
                account_id: row.get(1)?,
                batch_id: row.get(2)?,
                thread_id: row.get(3)?,
                action: row.get(4)?,
                from_mailbox: row.get(5)?,
                to_mailbox: row.get(6)?,
                created_at: row.get(7)?,
                undone: row.get::<_, i64>(8)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn latest_undoable_batch_id(
    db_path: &Path,
    account_id: &str,
) -> Result<Option<String>, String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let id: Option<String> = conn
        .query_row(
            "SELECT batch_id FROM org_apply_history
             WHERE account_id = ?1 AND undone = 0
             ORDER BY created_at DESC LIMIT 1",
            params![account_id.trim()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn list_batch_entries(
    db_path: &Path,
    account_id: &str,
    batch_id: &str,
) -> Result<Vec<OrgApplyHistoryEntry>, String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, batch_id, thread_id, action, from_mailbox, to_mailbox,
                    created_at, undone
             FROM org_apply_history
             WHERE account_id = ?1 AND batch_id = ?2 AND undone = 0
             ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id.trim(), batch_id.trim()], |row| {
            Ok(OrgApplyHistoryEntry {
                id: row.get(0)?,
                account_id: row.get(1)?,
                batch_id: row.get(2)?,
                thread_id: row.get(3)?,
                action: row.get(4)?,
                from_mailbox: row.get(5)?,
                to_mailbox: row.get(6)?,
                created_at: row.get(7)?,
                undone: row.get::<_, i64>(8)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn mark_batch_undone(db_path: &Path, account_id: &str, batch_id: &str) -> Result<(), String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE org_apply_history SET undone = 1
         WHERE account_id = ?1 AND batch_id = ?2",
        params![account_id.trim(), batch_id.trim()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
