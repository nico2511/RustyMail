use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use rustymail_domain::{
    compose_body_is_html, compose_body_plain, compose_html_fragment, Draft, EmailAddress,
};

use crate::open_sqlite_migrated;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftRevisionListItem {
    pub id: String,
    pub created_at: String,
    /// `edit` | `rewrite` | `shorten` | `tone` | `grammar` | `attachments` | …
    #[serde(default = "default_event_kind")]
    pub event_kind: String,
    /// Variation de longueur du corps vs la révision précédente (caractères visibles).
    #[serde(default)]
    pub chars_delta: i64,
}

fn default_event_kind() -> String {
    "edit".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftRevisionSaveResult {
    pub revision_id: Option<String>,
    pub draft: Draft,
}

fn sanitize_event_kind(raw: &str) -> String {
    let t = raw.trim().to_ascii_lowercase();
    match t.as_str() {
        "rewrite" | "shorten" | "tone" | "grammar" | "attachments" | "restore" | "edit" => t,
        _ if !t.is_empty()
            && t.len() <= 32
            && t.chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') =>
        {
            t
        }
        _ => "edit".to_string(),
    }
}

fn visible_body_chars(body: &str) -> i64 {
    compose_body_plain(body).chars().count() as i64
}

fn draft_attachments_dir(data_dir: &Path, account_id: &str, session_id: &str) -> PathBuf {
    data_dir
        .join("draft_attachments")
        .join(account_id.trim())
        .join(session_id.trim())
}

fn safe_file_stem(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "file".into()
    } else {
        cleaned.chars().take(120).collect()
    }
}

/// Copie les PJ hors du coffre local vers `data_dir/draft_attachments/…` pour qu’elles
/// survivent à la réouverture du brouillon (chemins utilisateur volatils).
pub fn stage_draft_attachments(
    data_dir: impl AsRef<Path>,
    account_id: &str,
    session_id: &str,
    draft: &Draft,
) -> Result<Draft, String> {
    let mut out = draft.clone();
    if out.attachment_paths.is_empty() {
        return Ok(out);
    }
    let dest_root = draft_attachments_dir(data_dir.as_ref(), account_id, session_id);
    fs::create_dir_all(&dest_root).map_err(|e| format!("dossier PJ brouillon: {e}"))?;
    let dest_canon = dest_root
        .canonicalize()
        .unwrap_or_else(|_| dest_root.clone());

    let mut staged = Vec::with_capacity(out.attachment_paths.len());
    for (i, raw) in out.attachment_paths.iter().enumerate() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let src = PathBuf::from(trimmed);
        if !src.is_file() {
            // Fichier disparu : on ne bloque pas l’enregistrement du corps.
            continue;
        }
        let src_canon = src.canonicalize().map_err(|e| format!("PJ: {e}"))?;
        if src_canon.starts_with(&dest_canon) {
            staged.push(src_canon.to_string_lossy().to_string());
            continue;
        }
        let fname = safe_file_stem(
            src.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("attachment"),
        );
        let dest = dest_root.join(format!("{i:02}_{fname}"));
        fs::copy(&src_canon, &dest).map_err(|e| format!("copie PJ « {fname} »: {e}"))?;
        let dest_s = dest
            .canonicalize()
            .unwrap_or(dest)
            .to_string_lossy()
            .to_string();
        staged.push(dest_s);
    }
    out.attachment_paths = staged;
    Ok(out)
}

fn now_rfc3339_secs() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn normalized_recipient_line(addr: &EmailAddress) -> String {
    let email = addr.email.trim().to_lowercase();
    let name = addr.name.as_deref().unwrap_or("").trim();
    if name.is_empty() {
        email
    } else {
        format!("{name}<{email}>")
    }
}

fn hash_recipient_list(h: &mut sha2::Sha256, list: &[EmailAddress]) {
    use sha2::Digest;
    let mut lines: Vec<String> = list.iter().map(normalized_recipient_line).collect();
    lines.sort();
    for line in lines {
        h.update(line.as_bytes());
        h.update(b"\n");
    }
}

fn body_has_visible_content(body: &str) -> bool {
    if !compose_body_plain(body).trim().is_empty() {
        return true;
    }
    let fragment = if compose_body_is_html(body) {
        compose_html_fragment(body)
    } else {
        body
    };
    fragment.to_ascii_lowercase().contains("<img")
}

/// Sujet, texte visible, image, destinataire ou pièce jointe. Les zones HTML vides ne comptent pas.
fn draft_has_revision_content(draft: &Draft) -> bool {
    if !draft.subject.trim().is_empty() {
        return true;
    }
    if !draft.to.is_empty() || !draft.cc.is_empty() || !draft.bcc.is_empty() {
        return true;
    }
    if draft.attachment_paths.iter().any(|p| !p.trim().is_empty()) {
        return true;
    }
    body_has_visible_content(&draft.markdown_body)
}

fn body_for_content_hash(body: &str) -> &str {
    if body_has_visible_content(body) {
        body.trim()
    } else {
        ""
    }
}

fn content_hash_for_draft(draft: &Draft) -> String {
    // Stable hash used only for de-duplication.
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(draft.subject.trim().as_bytes());
    h.update(b"\n");
    h.update(body_for_content_hash(&draft.markdown_body).as_bytes());
    h.update(b"\n");
    h.update(if draft.send_html { b"html1" } else { b"html0" });
    h.update(b"\n");
    h.update(format!("{:?}", draft.kind).as_bytes());
    h.update(b"\n");
    hash_recipient_list(&mut h, &draft.to);
    h.update(b"|");
    hash_recipient_list(&mut h, &draft.cc);
    h.update(b"|");
    hash_recipient_list(&mut h, &draft.bcc);
    h.update(b"\n");
    for path in draft.attachment_paths.iter() {
        h.update(path.trim().as_bytes());
        h.update(b"\n");
    }
    hex::encode(h.finalize())
}

fn purge_old_revisions(
    connection: &Connection,
    account_id: &str,
    session_id: &str,
    keep_last: usize,
) -> Result<(), String> {
    let keep = keep_last.max(1) as i64;
    connection
        .execute(
            "
            DELETE FROM draft_revisions
            WHERE id IN (
              SELECT id FROM draft_revisions
              WHERE account_id = ?1 AND session_id = ?2
              ORDER BY created_at DESC
              LIMIT -1 OFFSET ?3
            )
            ",
            params![account_id.trim(), session_id.trim(), keep],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Enregistre une révision si le contenu a changé depuis la dernière (dédup par `content_hash`).
/// Les PJ sont copiées sous `data_dir/draft_attachments/…` avant persistance.
pub fn sqlite_draft_revision_save(
    db_path: impl AsRef<Path>,
    data_dir: impl AsRef<Path>,
    account_id: &str,
    session_id: &str,
    draft: &Draft,
    event_kind: &str,
    keep_last: usize,
) -> Result<DraftRevisionSaveResult, String> {
    let account_norm = account_id.trim();
    if account_norm.is_empty() {
        return Err("account_id vide".to_string());
    }
    let session_norm = session_id.trim();
    if session_norm.is_empty() {
        return Err("session_id vide".to_string());
    }

    let staged = stage_draft_attachments(data_dir.as_ref(), account_norm, session_norm, draft)?;
    if !draft_has_revision_content(&staged) {
        return Ok(DraftRevisionSaveResult {
            revision_id: None,
            draft: staged,
        });
    }

    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;

    let content_hash = content_hash_for_draft(&staged);
    let last: Option<(String, String)> = connection
        .query_row(
            "
            SELECT content_hash, payload_json
            FROM draft_revisions
            WHERE account_id = ?1 AND session_id = ?2
            ORDER BY created_at DESC
            LIMIT 1
            ",
            params![account_norm, session_norm],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if last.as_ref().map(|(h, _)| h.as_str()) == Some(content_hash.as_str()) {
        return Ok(DraftRevisionSaveResult {
            revision_id: None,
            draft: staged,
        });
    }

    let prev_chars = last
        .as_ref()
        .and_then(|(_, json)| serde_json::from_str::<Draft>(json).ok())
        .map(|d| visible_body_chars(&d.markdown_body))
        .unwrap_or(0);
    let chars_delta = visible_body_chars(&staged.markdown_body) - prev_chars;
    let kind = sanitize_event_kind(event_kind);

    let rev_id = format!("drv-{}", uuid::Uuid::new_v4().simple());
    let created_at = now_rfc3339_secs();
    let payload_json = serde_json::to_string(&staged).map_err(|e| e.to_string())?;

    connection
        .execute(
            "
            INSERT INTO draft_revisions (
              id, account_id, session_id, created_at, content_hash, payload_json, event_kind, chars_delta
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ",
            params![
                rev_id,
                account_norm,
                session_norm,
                created_at,
                content_hash,
                payload_json,
                kind,
                chars_delta
            ],
        )
        .map_err(|e| e.to_string())?;

    purge_old_revisions(&connection, account_norm, session_norm, keep_last)?;
    Ok(DraftRevisionSaveResult {
        revision_id: Some(rev_id),
        draft: staged,
    })
}

pub fn sqlite_draft_revision_list(
    db_path: impl AsRef<Path>,
    account_id: &str,
    session_id: &str,
    limit: usize,
) -> Result<Vec<DraftRevisionListItem>, String> {
    let account_norm = account_id.trim();
    let session_norm = session_id.trim();
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;

    let mut stmt = connection
        .prepare(
            "
            SELECT id, created_at, event_kind, chars_delta
            FROM draft_revisions
            WHERE account_id = ?1 AND session_id = ?2
            ORDER BY created_at DESC
            LIMIT ?3
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(
            params![account_norm, session_norm, limit.max(1) as i64],
            |row| {
                Ok(DraftRevisionListItem {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    event_kind: row
                        .get::<_, Option<String>>(2)?
                        .unwrap_or_else(default_event_kind),
                    chars_delta: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                })
            },
        )
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn sqlite_draft_revision_get(
    db_path: impl AsRef<Path>,
    account_id: &str,
    revision_id: &str,
) -> Result<Option<Draft>, String> {
    let account_norm = account_id.trim();
    let rid = revision_id.trim();
    if rid.is_empty() {
        return Ok(None);
    }
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;

    let payload: Option<String> = connection
        .query_row(
            "
            SELECT payload_json
            FROM draft_revisions
            WHERE account_id = ?1 AND id = ?2
            LIMIT 1
            ",
            params![account_norm, rid],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some(json) = payload else {
        return Ok(None);
    };
    let draft: Draft = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(Some(draft))
}

/// Supprime toutes les révisions d’une session (abandon / fermer sans garder).
pub fn sqlite_draft_revision_purge_session(
    db_path: impl AsRef<Path>,
    account_id: &str,
    session_id: &str,
) -> Result<u64, String> {
    let account_norm = account_id.trim();
    let session_norm = session_id.trim();
    if account_norm.is_empty() || session_norm.is_empty() {
        return Err("account_id ou session_id vide".to_string());
    }
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let n = connection
        .execute(
            "DELETE FROM draft_revisions WHERE account_id = ?1 AND session_id = ?2",
            params![account_norm, session_norm],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as u64)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanDraftSessionItem {
    pub session_id: String,
    pub updated_at: String,
    pub revision_count: i64,
    pub title: String,
    pub preview: String,
}

fn draft_title_preview_from_payload(json: &str) -> (String, String) {
    let Ok(draft) = serde_json::from_str::<Draft>(json) else {
        return ("Sans objet".into(), String::new());
    };
    let title = {
        let t = draft.subject.trim();
        if t.is_empty() {
            "Sans objet".to_string()
        } else {
            t.to_string()
        }
    };
    let preview = draft
        .markdown_body
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .chars()
        .take(120)
        .collect::<String>();
    (title, preview)
}

/// Sessions avec révisions locales absentes de `saved_drafts` (crash / fermeture sans upsert).
pub fn sqlite_draft_orphan_sessions_list(
    db_path: impl AsRef<Path>,
    account_id: &str,
    limit: usize,
) -> Result<Vec<OrphanDraftSessionItem>, String> {
    let aid = account_id.trim();
    if aid.is_empty() {
        return Err("account_id vide".to_string());
    }
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let lim = limit.max(1).min(50) as i64;

    let mut stmt = connection
        .prepare(
            "
            SELECT
              dr.session_id,
              MAX(dr.created_at) AS updated_at,
              COUNT(1) AS revision_count,
              (
                SELECT payload_json
                FROM draft_revisions dr2
                WHERE dr2.account_id = dr.account_id AND dr2.session_id = dr.session_id
                ORDER BY datetime(dr2.created_at) DESC
                LIMIT 1
              ) AS payload_json
            FROM draft_revisions dr
            WHERE dr.account_id = ?1
              AND NOT EXISTS (
                SELECT 1 FROM saved_drafts sd
                WHERE sd.account_id = dr.account_id AND sd.session_id = dr.session_id
              )
            GROUP BY dr.session_id
            ORDER BY datetime(updated_at) DESC
            LIMIT ?2
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![aid, lim], |row| {
            let session_id: String = row.get(0)?;
            let updated_at: String = row.get(1)?;
            let revision_count: i64 = row.get(2)?;
            let payload: Option<String> = row.get(3)?;
            Ok((session_id, updated_at, revision_count, payload))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        let (session_id, updated_at, revision_count, payload) = row.map_err(|e| e.to_string())?;
        let (title, preview) = match payload.as_deref() {
            Some(json) => draft_title_preview_from_payload(json),
            None => ("Sans objet".into(), String::new()),
        };
        // Ignore empty shells (no subject/body/recipients worth recovering).
        let meaningful = title != "Sans objet" || !preview.is_empty();
        if !meaningful {
            continue;
        }
        out.push(OrphanDraftSessionItem {
            session_id,
            updated_at,
            revision_count,
            title,
            preview,
        });
    }
    Ok(out)
}

/// Ouvre la dernière révision d’une session orpheline.
pub fn sqlite_draft_orphan_session_open(
    db_path: impl AsRef<Path>,
    account_id: &str,
    session_id: &str,
) -> Result<Draft, String> {
    let aid = account_id.trim();
    let sid = session_id.trim();
    if aid.is_empty() || sid.is_empty() {
        return Err("identifiants invalides".to_string());
    }
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
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
        return Err("Aucune révision pour cette session.".to_string());
    };
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

/// Purge les sessions orphelines trop anciennes (révisions hors `saved_drafts`).
pub fn sqlite_draft_orphan_sessions_purge_stale(
    db_path: impl AsRef<Path>,
    account_id: &str,
    older_than_days: i64,
) -> Result<u64, String> {
    let aid = account_id.trim();
    if aid.is_empty() {
        return Err("account_id vide".to_string());
    }
    let days = older_than_days.max(1);
    let modifier = format!("-{days} days");
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let n = connection
        .execute(
            "
            DELETE FROM draft_revisions
            WHERE account_id = ?1
              AND NOT EXISTS (
                SELECT 1 FROM saved_drafts sd
                WHERE sd.account_id = draft_revisions.account_id
                  AND sd.session_id = draft_revisions.session_id
              )
              AND datetime(created_at) < datetime('now', ?2)
            ",
            params![aid, modifier],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as u64)
}

#[cfg(test)]
mod tests {
    use super::{content_hash_for_draft, draft_has_revision_content};
    use rustymail_domain::{Draft, DraftId, DraftKind, EmailAddress};

    fn sample_draft(to: Vec<EmailAddress>) -> Draft {
        Draft {
            id: DraftId("draft-test".into()),
            kind: DraftKind::New,
            to,
            cc: Vec::new(),
            bcc: Vec::new(),
            subject: "Sujet".into(),
            markdown_body: "Corps".into(),
            send_html: false,
            in_reply_to: None,
            references: Vec::new(),
            attachment_paths: Vec::new(),
            thread_id: None,
        }
    }

    #[test]
    fn content_hash_differs_when_recipient_email_changes() {
        let a = sample_draft(vec![EmailAddress {
            name: None,
            email: "alice@example.com".into(),
        }]);
        let b = sample_draft(vec![EmailAddress {
            name: None,
            email: "bob@example.com".into(),
        }]);
        assert_ne!(content_hash_for_draft(&a), content_hash_for_draft(&b));
    }

    #[test]
    fn content_hash_differs_when_send_html_toggles() {
        let mut a = sample_draft(vec![]);
        let mut b = sample_draft(vec![]);
        a.send_html = false;
        b.send_html = true;
        assert_ne!(content_hash_for_draft(&a), content_hash_for_draft(&b));
    }

    #[test]
    fn empty_html_shell_is_not_revision_content() {
        let mut draft = sample_draft(vec![]);
        draft.subject.clear();
        draft.markdown_body = "<!--rustymail-html--><p></p>".into();
        assert!(!draft_has_revision_content(&draft));
        draft.markdown_body = "<!--rustymail-html--><p><br></p>".into();
        assert!(!draft_has_revision_content(&draft));
        draft.markdown_body =
            "<!--rustymail-html--><p><br class=\"ProseMirror-trailingBreak\"></p>".into();
        assert!(!draft_has_revision_content(&draft));
    }

    #[test]
    fn empty_body_variants_share_content_hash() {
        let mut empty = sample_draft(vec![]);
        let mut html = sample_draft(vec![]);
        empty.markdown_body.clear();
        html.markdown_body = "<!--rustymail-html--><p><br></p>".into();
        assert_eq!(
            content_hash_for_draft(&empty),
            content_hash_for_draft(&html)
        );
    }

    #[test]
    fn image_only_html_is_revision_content() {
        let mut draft = sample_draft(vec![]);
        draft.subject.clear();
        draft.markdown_body =
            "<!--rustymail-html--><p><img src=\"data:image/png;base64,AAAA\" alt=\"capture\" /></p>".into();
        assert!(draft_has_revision_content(&draft));
    }

    #[test]
    fn content_hash_stable_for_same_recipients_different_order() {
        let a = sample_draft(vec![
            EmailAddress {
                name: Some("Alice".into()),
                email: "alice@example.com".into(),
            },
            EmailAddress {
                name: None,
                email: "bob@example.com".into(),
            },
        ]);
        let b = sample_draft(vec![
            EmailAddress {
                name: None,
                email: "bob@example.com".into(),
            },
            EmailAddress {
                name: Some("Alice".into()),
                email: "alice@example.com".into(),
            },
        ]);
        assert_eq!(content_hash_for_draft(&a), content_hash_for_draft(&b));
    }
}
