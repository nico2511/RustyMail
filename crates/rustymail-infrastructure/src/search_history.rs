//! Historique de recherche local (suggestions).

use rusqlite::{params, Connection, OptionalExtension};
use rustymail_domain::SearchHistoryEntry;
use std::path::Path;

use crate::open_sqlite_migrated;

pub fn migrate_search_history(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            query_text TEXT NOT NULL DEFAULT '',
            query_json TEXT NOT NULL,
            used_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE INDEX IF NOT EXISTS idx_search_history_account_used
            ON search_history(account_id, used_at DESC);
        ",
    )
}

pub fn record_search_history(
    db_path: &Path,
    account_id: &str,
    query_text: &str,
    query_json: &str,
) -> Result<(), String> {
    let aid = account_id.trim();
    if aid.is_empty() {
        return Ok(());
    }
    let text = query_text.trim();
    let json = query_json.trim();
    if json.is_empty() || json == "{}" {
        return Ok(());
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM search_history
             WHERE account_id = ?1 AND query_json = ?2
             ORDER BY used_at DESC LIMIT 1",
            params![aid, json],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(id) = existing {
        conn.execute(
            "UPDATE search_history SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             query_text = ?2 WHERE id = ?1",
            params![id, text],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO search_history (account_id, query_text, query_json)
             VALUES (?1, ?2, ?3)",
            params![aid, text, json],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "DELETE FROM search_history WHERE account_id = ?1 AND id NOT IN (
            SELECT id FROM search_history WHERE account_id = ?1
            ORDER BY used_at DESC LIMIT 100
         )",
        params![aid],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_search_history(
    db_path: &Path,
    account_id: &str,
    limit: usize,
) -> Result<Vec<SearchHistoryEntry>, String> {
    let aid = account_id.trim();
    if aid.is_empty() {
        return Ok(Vec::new());
    }
    let lim = limit.clamp(1, 50) as i64;
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, query_text, query_json, used_at
             FROM search_history WHERE account_id = ?1
             ORDER BY used_at DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![aid, lim], |row| {
            Ok(SearchHistoryEntry {
                id: row.get(0)?,
                account_id: row.get(1)?,
                query_text: row.get(2)?,
                query_json: row.get(3)?,
                used_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn clear_search_history(db_path: &Path, account_id: &str) -> Result<(), String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM search_history WHERE account_id = ?1",
        params![account_id.trim()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
