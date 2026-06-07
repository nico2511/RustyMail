//! CRUD vues de recherche enregistrées + comptage surveillance.

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use rustymail_domain::{SavedSearch, SavedSearchListItem, SavedSearchUpsert, SearchQuery};
use std::path::Path;
use uuid::Uuid;

use crate::open_sqlite_migrated;
use crate::semantic_search::count_threads_matching_query;

pub fn migrate_saved_searches(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS saved_searches (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            name TEXT NOT NULL,
            query_json TEXT NOT NULL,
            ui_state_json TEXT NOT NULL DEFAULT '{}',
            pinned INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            last_seen_at TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE INDEX IF NOT EXISTS idx_saved_searches_account
            ON saved_searches(account_id, pinned DESC, sort_order ASC, name COLLATE NOCASE);
        ",
    )
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn row_to_saved_search(
    id: String,
    account_id: String,
    name: String,
    query_json: String,
    ui_state_json: String,
    pinned: i64,
    sort_order: i64,
    last_seen_at: Option<String>,
    created_at: String,
    updated_at: String,
) -> Result<SavedSearch, String> {
    let query: SearchQuery = serde_json::from_str(&query_json).map_err(|e| e.to_string())?;
    let ui_state = if ui_state_json.trim().is_empty() || ui_state_json.trim() == "{}" {
        rustymail_domain::SavedSearchUiState::default()
    } else {
        serde_json::from_str(&ui_state_json).map_err(|e| e.to_string())?
    };
    Ok(SavedSearch {
        id,
        account_id,
        name,
        query,
        ui_state,
        pinned: pinned != 0,
        sort_order: sort_order as i32,
        last_seen_at,
        created_at,
        updated_at,
    })
}

pub fn list_saved_searches(
    db_path: &Path,
    account_id: &str,
    include_counts: bool,
) -> Result<Vec<SavedSearchListItem>, String> {
    let aid = account_id.trim();
    if aid.is_empty() {
        return Err("account_id vide.".into());
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, name, query_json, ui_state_json, pinned, sort_order,
                    last_seen_at, created_at, updated_at
             FROM saved_searches WHERE account_id = ?1
             ORDER BY pinned DESC, sort_order ASC, name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![aid], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let (
            id,
            account_id,
            name,
            query_json,
            ui_state_json,
            pinned,
            sort_order,
            last_seen_at,
            created_at,
            updated_at,
        ) = row.map_err(|e| e.to_string())?;
        let search = row_to_saved_search(
            id,
            account_id,
            name,
            query_json,
            ui_state_json,
            pinned,
            sort_order,
            last_seen_at,
            created_at,
            updated_at,
        )?;
        let new_count = if include_counts {
            count_new_for_saved_search(db_path, &search)?
        } else {
            0
        };
        out.push(SavedSearchListItem { search, new_count });
    }
    Ok(out)
}

pub fn get_saved_search(db_path: &Path, account_id: &str, id: &str) -> Result<SavedSearch, String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let row = conn.query_row(
        "SELECT id, account_id, name, query_json, ui_state_json, pinned, sort_order,
                last_seen_at, created_at, updated_at
         FROM saved_searches WHERE account_id = ?1 AND id = ?2",
        params![account_id.trim(), id.trim()],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
            ))
        },
    );
    let (
        id,
        account_id,
        name,
        query_json,
        ui_state_json,
        pinned,
        sort_order,
        last_seen_at,
        created_at,
        updated_at,
    ) = row.map_err(|_| format!("Vue introuvable : {id}"))?;
    row_to_saved_search(
        id,
        account_id,
        name,
        query_json,
        ui_state_json,
        pinned,
        sort_order,
        last_seen_at,
        created_at,
        updated_at,
    )
}

pub fn upsert_saved_search(db_path: &Path, input: SavedSearchUpsert) -> Result<SavedSearch, String> {
    let aid = input.account_id.trim();
    if aid.is_empty() {
        return Err("account_id vide.".into());
    }
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Nom de vue vide.".into());
    }
    let id = input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let query_json = serde_json::to_string(&input.query).map_err(|e| e.to_string())?;
    let ui_state_json = serde_json::to_string(&input.ui_state).map_err(|e| e.to_string())?;
    let pinned = if input.pinned { 1i64 } else { 0i64 };
    let sort_order = input.sort_order.unwrap_or(0);
    let now = now_iso();
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO saved_searches (
            id, account_id, name, query_json, ui_state_json, pinned, sort_order, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            query_json = excluded.query_json,
            ui_state_json = excluded.ui_state_json,
            pinned = excluded.pinned,
            sort_order = excluded.sort_order,
            updated_at = excluded.updated_at",
        params![
            id,
            aid,
            name,
            query_json,
            ui_state_json,
            pinned,
            sort_order,
            now,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    get_saved_search(db_path, aid, &id)
}

pub fn delete_saved_search(db_path: &Path, account_id: &str, id: &str) -> Result<(), String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let n = conn
        .execute(
            "DELETE FROM saved_searches WHERE account_id = ?1 AND id = ?2",
            params![account_id.trim(), id.trim()],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("Vue introuvable : {id}"));
    }
    Ok(())
}

pub fn mark_saved_search_seen(db_path: &Path, account_id: &str, id: &str) -> Result<SavedSearch, String> {
    let now = now_iso();
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let n = conn
        .execute(
            "UPDATE saved_searches SET last_seen_at = ?3, updated_at = ?3
             WHERE account_id = ?1 AND id = ?2",
            params![account_id.trim(), id.trim(), now],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("Vue introuvable : {id}"));
    }
    get_saved_search(db_path, account_id, id)
}

fn parse_activity_after(iso: &str) -> Option<DateTime<Utc>> {
    let s = iso.trim();
    if s.is_empty() {
        return None;
    }
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%fZ")
                .ok()
                .map(|ndt| ndt.and_utc())
        })
}

pub fn count_new_for_saved_search(db_path: &Path, saved: &SavedSearch) -> Result<usize, String> {
    let since = match saved
        .last_seen_at
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        None => None,
        Some(raw) => Some(
            parse_activity_after(raw).unwrap_or_else(Utc::now),
        ),
    };
    count_threads_matching_query(db_path, &saved.query, since)
}
