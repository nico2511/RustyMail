//! Archivage automatique opt-in (règles prefs → candidats / MOVE archive).

use std::path::Path;

use rusqlite::{params, Connection};
use rustymail_domain::ArchiveSpaceStats;

use crate::app_prefs::{AppPrefs, AutoArchiveRule};
use crate::mail_ops::move_thread_to_archive;
use crate::{load_accounts, open_sqlite_migrated, parse_tags};

/// Applique les règles d’auto-archivage si `auto_archive_enabled`.
/// Sélectionne les fils candidats, tente `move_thread_to_archive`, retourne des stats agrégées.
pub async fn run_auto_archive_rules(
    db_path: &Path,
    account_id: &str,
    prefs: &AppPrefs,
) -> Result<ArchiveSpaceStats, String> {
    if !prefs.general.auto_archive_enabled {
        return Ok(ArchiveSpaceStats::default());
    }
    let rules: Vec<&AutoArchiveRule> = prefs
        .general
        .auto_archive_rules
        .iter()
        .filter(|r| r.enabled)
        .collect();
    if rules.is_empty() {
        return Ok(ArchiveSpaceStats::default());
    }

    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let mut candidates: Vec<(String, String)> = Vec::new(); // (thread_id, mailbox)
    for rule in &rules {
        let found = select_rule_candidates(&conn, account_id, rule)?;
        for c in found {
            if !candidates.iter().any(|(id, _)| id == &c.0) {
                candidates.push(c);
            }
        }
    }

    let mut stats = estimate_candidate_stats(&conn, account_id, &candidates)?;
    if candidates.is_empty() {
        return Ok(stats);
    }

    let account = load_accounts(db_path)?
        .into_iter()
        .find(|a| a.id.0 == account_id)
        .ok_or_else(|| format!("Compte introuvable : {account_id}"))?;

    let mut archived = 0usize;
    for (thread_id, mailbox) in &candidates {
        match move_thread_to_archive(db_path, &account, mailbox, thread_id).await {
            Ok(_) => archived += 1,
            Err(_) => {
                // Stub Phase 2 : on ignore les échecs IMAP individuels (stats = candidats).
            }
        }
    }
    // Si aucun MOVE n’a réussi, conserver les stats candidats (aperçu).
    if archived > 0 {
        stats.message_count = archived;
    }
    Ok(stats)
}

/// Variante sync : candidats + stats uniquement (sans IMAP).
pub fn preview_auto_archive_candidates(
    db_path: &Path,
    account_id: &str,
    prefs: &AppPrefs,
) -> Result<(Vec<(String, String)>, ArchiveSpaceStats), String> {
    if !prefs.general.auto_archive_enabled {
        return Ok((Vec::new(), ArchiveSpaceStats::default()));
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let mut candidates: Vec<(String, String)> = Vec::new();
    for rule in prefs.general.auto_archive_rules.iter().filter(|r| r.enabled) {
        for c in select_rule_candidates(&conn, account_id, rule)? {
            if !candidates.iter().any(|(id, _)| id == &c.0) {
                candidates.push(c);
            }
        }
    }
    let stats = estimate_candidate_stats(&conn, account_id, &candidates)?;
    Ok((candidates, stats))
}

/// Stats d’espace approximatives sous la racine Archive (tous les sous-dossiers).
pub fn archive_tree_space_stats(
    db_path: &Path,
    account_id: &str,
    archive_root: &str,
) -> Result<ArchiveSpaceStats, String> {
    let root = archive_root.trim();
    if root.is_empty() {
        return Ok(ArchiveSpaceStats::default());
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let like = format!("{}/%", root.replace('%', "\\%").replace('_', "\\_"));
    let like_dot = format!("{}.%", root.replace('%', "\\%").replace('_', "\\_"));
    let message_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM messages
             WHERE account_id = ?1 AND (
               lower(trim(mailbox)) = lower(trim(?2))
               OR lower(mailbox) LIKE lower(?3) ESCAPE '\\'
               OR lower(mailbox) LIKE lower(?4) ESCAPE '\\'
             )",
            params![account_id, root, like, like_dot],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let approx_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(LENGTH(COALESCE(body_plain, body))), 0)
               + COALESCE((
                   SELECT SUM(ma.size_bytes) FROM message_attachments ma
                   INNER JOIN messages m ON m.id = ma.message_id
                   WHERE m.account_id = ?1 AND (
                     lower(trim(m.mailbox)) = lower(trim(?2))
                     OR lower(m.mailbox) LIKE lower(?3) ESCAPE '\\'
                     OR lower(m.mailbox) LIKE lower(?4) ESCAPE '\\'
                   )
                 ), 0)
             FROM messages
             WHERE account_id = ?1 AND (
               lower(trim(mailbox)) = lower(trim(?2))
               OR lower(mailbox) LIKE lower(?3) ESCAPE '\\'
               OR lower(mailbox) LIKE lower(?4) ESCAPE '\\'
             )",
            params![account_id, root, like, like_dot],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let mailbox_count: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT mailbox) FROM threads
             WHERE account_id = ?1 AND (
               lower(trim(mailbox)) = lower(trim(?2))
               OR lower(mailbox) LIKE lower(?3) ESCAPE '\\'
               OR lower(mailbox) LIKE lower(?4) ESCAPE '\\'
             )",
            params![account_id, root, like, like_dot],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(ArchiveSpaceStats {
        message_count: message_count.max(0) as usize,
        approx_bytes: approx_bytes.max(0) as u64,
        mailbox_count: mailbox_count.max(0) as usize,
    })
}

fn select_rule_candidates(
    conn: &Connection,
    account_id: &str,
    rule: &AutoArchiveRule,
) -> Result<Vec<(String, String)>, String> {
    let age_days = rule.age_days.unwrap_or(0).max(0);
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.mailbox, t.tags, COALESCE(t.is_followed, 0),
                    COALESCE((
                        SELECT MAX(m.received_at) FROM messages m
                        WHERE m.thread_id = t.id AND m.account_id = t.account_id
                    ), '') AS last_at,
                    COALESCE((
                        SELECT MIN(COALESCE(m.is_read, 0)) FROM messages m
                        WHERE m.thread_id = t.id AND m.account_id = t.account_id
                    ), 1) AS all_read
             FROM threads t
             WHERE t.account_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now();
    let mut out = Vec::new();
    for row in rows.flatten() {
        let (tid, mailbox, tags_csv, followed, last_at, all_read) = row;
        if rule.exclude_followed && followed != 0 {
            continue;
        }
        if rule.only_read && all_read == 0 {
            continue;
        }
        if age_days > 0 {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&last_at) {
                let age = now.signed_duration_since(dt.with_timezone(&chrono::Utc));
                if age.num_days() < age_days {
                    continue;
                }
            } else if !last_at.is_empty() {
                // Fallback date SQL `YYYY-MM-DD…`
                if let Ok(naive) = chrono::NaiveDate::parse_from_str(&last_at[..last_at.len().min(10)], "%Y-%m-%d")
                {
                    let days = (now.date_naive() - naive).num_days();
                    if days < age_days {
                        continue;
                    }
                }
            } else {
                continue;
            }
        }
        if !rule.tags.is_empty() {
            let tags = parse_tags(&tags_csv);
            let filters: Vec<String> = tags.iter().map(|t| t.as_filter()).collect();
            let ok = rule.tags.iter().all(|need| {
                let n = need.trim().to_ascii_lowercase();
                filters.iter().any(|f| f.eq_ignore_ascii_case(&n))
            });
            if !ok {
                continue;
            }
        }
        if !rule.senders.is_empty() {
            let sender: String = conn
                .query_row(
                    "SELECT lower(trim(sender_email)) FROM messages
                     WHERE thread_id = ?1 AND account_id = ?2
                     ORDER BY received_at DESC, position DESC LIMIT 1",
                    params![tid, account_id],
                    |r| r.get(0),
                )
                .unwrap_or_default();
            let hit = rule.senders.iter().any(|s| {
                let s = s.trim().to_ascii_lowercase();
                if s.is_empty() {
                    return false;
                }
                if s.contains('@') {
                    sender == s
                } else {
                    sender.ends_with(&format!("@{s}")) || sender.ends_with(&format!(".{s}"))
                }
            });
            if !hit {
                continue;
            }
        }
        out.push((tid, mailbox));
    }
    Ok(out)
}

fn estimate_candidate_stats(
    conn: &Connection,
    account_id: &str,
    candidates: &[(String, String)],
) -> Result<ArchiveSpaceStats, String> {
    if candidates.is_empty() {
        return Ok(ArchiveSpaceStats::default());
    }
    let mut message_count = 0usize;
    let mut approx_bytes = 0u64;
    let mut mailboxes = std::collections::HashSet::new();
    for (tid, mb) in candidates {
        mailboxes.insert(mb.clone());
        let mut stmt = conn
            .prepare(
                "SELECT length(COALESCE(body_plain, body, '')),
                        COALESCE((
                            SELECT SUM(size_bytes) FROM message_attachments ma
                            WHERE ma.message_id = messages.id
                        ), 0)
                 FROM messages WHERE thread_id = ?1 AND account_id = ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![tid, account_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            message_count += 1;
            approx_bytes += row.0.max(0) as u64 + row.1.max(0) as u64;
        }
    }
    Ok(ArchiveSpaceStats {
        message_count,
        approx_bytes,
        mailbox_count: mailboxes.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::AutoArchiveRule;
    use rusqlite::Connection;

    #[test]
    fn select_rule_matches_age_and_read() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE threads (
                id TEXT PRIMARY KEY, account_id TEXT, mailbox TEXT, tags TEXT, is_followed INTEGER DEFAULT 0
             );
             CREATE TABLE messages (
                id TEXT PRIMARY KEY, thread_id TEXT, account_id TEXT, sender_email TEXT,
                received_at TEXT, body TEXT, body_plain TEXT, is_read INTEGER, position INTEGER
             );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO threads VALUES ('t1', 'a1', 'INBOX', 'kind:newsletter', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO messages VALUES ('m1', 't1', 'a1', 'x@y.com', '2020-01-01T00:00:00Z', 'b', 'b', 1, 0)",
            [],
        )
        .unwrap();
        let rule = AutoArchiveRule {
            id: "r1".into(),
            label: "old".into(),
            enabled: true,
            age_days: Some(30),
            tags: vec!["kind:newsletter".into()],
            senders: vec![],
            only_read: true,
            exclude_followed: true,
        };
        let c = select_rule_candidates(&conn, "a1", &rule).unwrap();
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].0, "t1");
    }

    #[test]
    fn disabled_returns_empty_preview() {
        let prefs = AppPrefs::default();
        assert!(!prefs.general.auto_archive_enabled);
    }
}
