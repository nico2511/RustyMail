use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

use rustymail_domain::{Draft, EmailAddress};

use crate::open_sqlite_migrated;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftRevisionListItem {
    pub id: String,
    pub created_at: String,
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

fn content_hash_for_draft(draft: &Draft) -> String {
    // Stable hash used only for de-duplication.
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(draft.subject.trim().as_bytes());
    h.update(b"\n");
    h.update(draft.markdown_body.as_bytes());
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
/// Retourne `Ok(Some(revision_id))` si une nouvelle révision est créée, `Ok(None)` si ignorée.
pub fn sqlite_draft_revision_save(
    db_path: impl AsRef<Path>,
    account_id: &str,
    session_id: &str,
    draft: &Draft,
    keep_last: usize,
) -> Result<Option<String>, String> {
    let account_norm = account_id.trim();
    if account_norm.is_empty() {
        return Err("account_id vide".to_string());
    }
    let session_norm = session_id.trim();
    if session_norm.is_empty() {
        return Err("session_id vide".to_string());
    }

    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;

    let content_hash = content_hash_for_draft(draft);
    let last_hash: Option<String> = connection
        .query_row(
            "
            SELECT content_hash
            FROM draft_revisions
            WHERE account_id = ?1 AND session_id = ?2
            ORDER BY created_at DESC
            LIMIT 1
            ",
            params![account_norm, session_norm],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if last_hash.as_deref() == Some(content_hash.as_str()) {
        return Ok(None);
    }

    let rev_id = format!("drv-{}", uuid::Uuid::new_v4().simple());
    let created_at = now_rfc3339_secs();
    let payload_json = serde_json::to_string(draft).map_err(|e| e.to_string())?;

    connection
        .execute(
            "
            INSERT INTO draft_revisions (id, account_id, session_id, created_at, content_hash, payload_json)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![
                rev_id,
                account_norm,
                session_norm,
                created_at,
                content_hash,
                payload_json
            ],
        )
        .map_err(|e| e.to_string())?;

    purge_old_revisions(&connection, account_norm, session_norm, keep_last)?;
    Ok(Some(rev_id))
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
            SELECT id, created_at
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

#[cfg(test)]
mod tests {
    use super::content_hash_for_draft;
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
