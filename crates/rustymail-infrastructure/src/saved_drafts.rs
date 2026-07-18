use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

use rustymail_domain::Draft;

use crate::open_sqlite_migrated;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedDraftListItem {
    pub id: String,
    pub session_id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    /// Nombre de lignes dans `draft_revisions` pour cette session.
    pub revision_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedDraftOpenResult {
    pub draft: Draft,
    pub session_id: String,
    pub saved_draft_id: String,
}

fn now_rfc3339_secs() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn sqlite_saved_drafts_count(
    db_path: impl AsRef<Path>,
    account_id: &str,
) -> Result<i64, String> {
    let aid = account_id.trim();
    if aid.is_empty() {
        return Err("account_id vide".to_string());
    }
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let n: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM saved_drafts WHERE account_id = ?1",
            params![aid],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n.max(0))
}

pub fn sqlite_saved_draft_list(
    db_path: impl AsRef<Path>,
    account_id: &str,
    limit: usize,
) -> Result<Vec<SavedDraftListItem>, String> {
    let aid = account_id.trim();
    if aid.is_empty() {
        return Err("account_id vide".to_string());
    }
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let lim = limit.max(1).min(500) as i64;

    let mut stmt = connection
        .prepare(
            "
            SELECT
              sd.id,
              sd.session_id,
              sd.title,
              sd.created_at,
              sd.updated_at,
              COALESCE((
                SELECT COUNT(1)
                FROM draft_revisions dr
                WHERE dr.account_id = sd.account_id AND dr.session_id = sd.session_id
              ), 0) AS revision_count
            FROM saved_drafts sd
            WHERE sd.account_id = ?1
            ORDER BY datetime(sd.updated_at) DESC
            LIMIT ?2
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![aid, lim], |row| {
            Ok(SavedDraftListItem {
                id: row.get(0)?,
                session_id: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                revision_count: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Crée ou met à jour l’entrée « brouillon sauvegardé » pour cette session (`UNIQUE(account_id, session_id)`).
pub fn sqlite_saved_draft_upsert_by_session(
    db_path: impl AsRef<Path>,
    account_id: &str,
    session_id: &str,
    title: &str,
) -> Result<String, String> {
    let aid = account_id.trim();
    let sid = session_id.trim();
    if aid.is_empty() || sid.is_empty() {
        return Err("account_id ou session_id vide".to_string());
    }
    let title_norm = title.trim();
    let title_use = if title_norm.is_empty() {
        "Sans objet"
    } else {
        title_norm
    };

    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let now = now_rfc3339_secs();

    let existing: Option<String> = connection
        .query_row(
            "SELECT id FROM saved_drafts WHERE account_id = ?1 AND session_id = ?2 LIMIT 1",
            params![aid, sid],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some(id) = existing {
        connection
            .execute(
                "
                UPDATE saved_drafts SET title = ?1, updated_at = ?2
                WHERE id = ?3 AND account_id = ?4
                ",
                params![title_use, now, id, aid],
            )
            .map_err(|e| e.to_string())?;
        return Ok(id);
    }

    let new_id = format!("sd-{}", uuid::Uuid::new_v4().simple());
    connection
        .execute(
            "
            INSERT INTO saved_drafts (id, account_id, session_id, title, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![new_id, aid, sid, title_use, now, now],
        )
        .map_err(|e| e.to_string())?;
    Ok(new_id)
}

pub fn sqlite_saved_draft_delete(
    db_path: impl AsRef<Path>,
    account_id: &str,
    saved_draft_id: &str,
) -> Result<(), String> {
    let aid = account_id.trim();
    let sdid = saved_draft_id.trim();
    if aid.is_empty() || sdid.is_empty() {
        return Err("identifiants invalides".to_string());
    }

    let mut connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let tx = connection.transaction().map_err(|e| e.to_string())?;

    let session_id: Option<String> = tx
        .query_row(
            "
            SELECT session_id FROM saved_drafts
            WHERE id = ?1 AND account_id = ?2 LIMIT 1
            ",
            params![sdid, aid],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some(sess) = session_id else {
        return Err("brouillon enregistré introuvable".to_string());
    };

    tx.execute(
        "
        DELETE FROM draft_revisions
        WHERE account_id = ?1 AND session_id = ?2
        ",
        params![aid, sess],
    )
    .map_err(|e| e.to_string())?;

    let n = tx
        .execute(
            "DELETE FROM saved_drafts WHERE id = ?1 AND account_id = ?2",
            params![sdid, aid],
        )
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    if n == 0 {
        return Err("aucune ligne supprimée".to_string());
    }
    Ok(())
}

pub fn sqlite_saved_draft_open(
    db_path: impl AsRef<Path>,
    account_id: &str,
    saved_draft_id: &str,
) -> Result<SavedDraftOpenResult, String> {
    let aid = account_id.trim();
    let sdid = saved_draft_id.trim();
    if aid.is_empty() || sdid.is_empty() {
        return Err("identifiants invalides".to_string());
    }

    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;

    let session_id: String = connection
        .query_row(
            "SELECT session_id FROM saved_drafts WHERE id = ?1 AND account_id = ?2 LIMIT 1",
            params![sdid, aid],
            |row| row.get(0),
        )
        .map_err(|_| "brouillon enregistré introuvable".to_string())?;

    let sid = session_id.trim();
    if sid.is_empty() {
        return Err("session_id vide".to_string());
    }

    let payload_json: Option<String> = connection
        .query_row(
            "
            SELECT payload_json
            FROM draft_revisions
            WHERE account_id = ?1 AND session_id = ?2
            ORDER BY datetime(created_at) DESC
            LIMIT 1
            ",
            params![aid, sid],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some(json) = payload_json else {
        return Err(
            "Aucune version locale trouvée pour ce brouillon (historique vide). Éditez et enregistrez à nouveau."
                .to_string(),
        );
    };

    let draft: Draft = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    Ok(SavedDraftOpenResult {
        draft,
        session_id: sid.to_string(),
        saved_draft_id: sdid.to_string(),
    })
}
