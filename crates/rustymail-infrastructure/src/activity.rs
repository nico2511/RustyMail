//! Activité utilisateur locale : événements, agrégats engagement, suggestions de vues.

use chrono::{Duration, Utc};
use rusqlite::{params, Connection};
use rustymail_domain::{
    ActivityCardCalibrationStats, ActivityCardPolicy, ActivityEventInput, SearchMode, SearchQuery,
    SuggestedSavedView, SuggestionDecision, CARD_KIND_SAVED_VIEW, EVENT_AFFINER_APPLIED,
    EVENT_BULK_ARCHIVE, EVENT_BULK_MARK_READ, EVENT_CONTACT_OPENED, EVENT_MESSAGE_SENT,
    EVENT_SAVED_VIEW_APPLIED, EVENT_SAVED_VIEW_CREATED, EVENT_SAVED_VIEW_SEEN,
    EVENT_SEARCH_COMMITTED, EVENT_SUGGESTION_CLICKED, EVENT_SUGGESTION_SHOWN,
    EVENT_THREAD_CLOSED, EVENT_THREAD_OPENED,
};
use std::collections::HashSet;
use std::path::Path;

use crate::contact_detail::sender_auto_kind_for_account;
use crate::email_util::normalize_email;
use crate::open_sqlite_migrated;
use crate::saved_searches::list_saved_searches;

const RETENTION_DAYS: i64 = 90;
const WINDOW_DAYS: i64 = 30;

const ALLOWED_EVENT_TYPES: &[&str] = &[
    EVENT_THREAD_OPENED,
    EVENT_THREAD_CLOSED,
    EVENT_MESSAGE_SENT,
    EVENT_SEARCH_COMMITTED,
    EVENT_SAVED_VIEW_CREATED,
    EVENT_SAVED_VIEW_APPLIED,
    EVENT_SAVED_VIEW_SEEN,
    EVENT_BULK_MARK_READ,
    EVENT_BULK_ARCHIVE,
    EVENT_AFFINER_APPLIED,
    EVENT_CONTACT_OPENED,
    EVENT_SUGGESTION_SHOWN,
    EVENT_SUGGESTION_CLICKED,
];

pub fn migrate_activity(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS activity_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            thread_id TEXT,
            sender_email TEXT,
            mailbox TEXT,
            duration_ms INTEGER,
            meta_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_activity_events_account_time
            ON activity_events(account_id, occurred_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_events_sender
            ON activity_events(account_id, sender_email, occurred_at DESC);

        CREATE TABLE IF NOT EXISTS activity_suggestion_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            card_kind TEXT NOT NULL DEFAULT 'saved_view',
            suggestion_key TEXT NOT NULL,
            decision TEXT NOT NULL,
            snooze_until TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_suggestion_unique
            ON activity_suggestion_memory(account_id, card_kind, suggestion_key);
        CREATE INDEX IF NOT EXISTS idx_activity_suggestion_account
            ON activity_suggestion_memory(account_id, decision);
        ",
    )?;
    let _ = purge_activity_events_older_than(connection, RETENTION_DAYS);
    Ok(())
}

fn now_iso() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%fZ").to_string()
}

fn cutoff_iso(days: i64) -> String {
    (Utc::now() - Duration::days(days)).format("%Y-%m-%dT%H:%M:%fZ").to_string()
}

pub fn purge_activity_events_older_than(
    connection: &Connection,
    days: i64,
) -> Result<u64, rusqlite::Error> {
    let cutoff = cutoff_iso(days);
    connection.execute(
        "DELETE FROM activity_events WHERE occurred_at < ?1",
        params![cutoff],
    )
    .map(|n| n as u64)
}

fn is_allowed_event_type(t: &str) -> bool {
    ALLOWED_EVENT_TYPES.contains(&t.trim())
}

pub fn record_activity_events(
    db_path: &Path,
    account_id: &str,
    events: &[ActivityEventInput],
) -> Result<usize, String> {
    let aid = account_id.trim();
    if aid.is_empty() {
        return Err("account_id vide.".into());
    }
    if events.is_empty() {
        return Ok(0);
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let stamp = now_iso();
    let mut n = 0usize;
    for ev in events {
        let et = ev.event_type.trim();
        if !is_allowed_event_type(et) {
            return Err(format!("event_type invalide : {et}"));
        }
        let sender = ev
            .sender_email
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .and_then(normalize_email);
        let thread_id = ev
            .thread_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let mailbox = ev
            .mailbox
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let meta = ev
            .meta_json
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("{}");
        tx.execute(
            "INSERT INTO activity_events
                (account_id, event_type, occurred_at, thread_id, sender_email, mailbox, duration_ms, meta_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                aid,
                et,
                stamp,
                thread_id,
                sender,
                mailbox,
                ev.duration_ms,
                meta,
            ],
        )
        .map_err(|e| e.to_string())?;
        n += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(n)
}

struct SenderEngagement {
    email: String,
    opens: i32,
    replies: i32,
    dwell_ms: i64,
    searches: i32,
}

fn load_sender_engagements(
    conn: &Connection,
    account_id: &str,
    since: &str,
) -> Result<Vec<SenderEngagement>, String> {
    let mut stmt = conn
        .prepare(
            "
            SELECT lower(trim(sender_email)),
                   SUM(CASE WHEN event_type = ?2 THEN 1 ELSE 0 END),
                   SUM(CASE WHEN event_type = ?3 THEN 1 ELSE 0 END),
                   SUM(CASE WHEN event_type = ?4 THEN COALESCE(duration_ms, 0) ELSE 0 END),
                   SUM(CASE WHEN event_type = ?5 THEN 1 ELSE 0 END)
            FROM activity_events
            WHERE account_id = ?1
              AND occurred_at >= ?6
              AND sender_email IS NOT NULL
              AND trim(sender_email) != ''
            GROUP BY lower(trim(sender_email))
            ",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(
            params![
                account_id,
                EVENT_THREAD_OPENED,
                EVENT_MESSAGE_SENT,
                EVENT_THREAD_CLOSED,
                EVENT_SEARCH_COMMITTED,
                since,
            ],
            |row| {
                Ok(SenderEngagement {
                    email: row.get(0)?,
                    opens: row.get(1)?,
                    replies: row.get(2)?,
                    dwell_ms: row.get(3)?,
                    searches: row.get(4)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn load_covered_sender_emails(db_path: &Path, account_id: &str) -> Result<HashSet<String>, String> {
    let items = list_saved_searches(db_path, account_id, false)?;
    let mut covered = HashSet::new();
    for item in items {
        for s in &item.search.query.senders {
            if let Some(em) = normalize_email(s) {
                covered.insert(em);
            }
        }
        if let Some(ref s) = item.search.query.sender {
            if let Some(em) = normalize_email(s) {
                covered.insert(em);
            }
        }
    }
    Ok(covered)
}

fn is_suggestion_blocked(
    conn: &Connection,
    account_id: &str,
    sender_email: &str,
    _policy: &ActivityCardPolicy,
) -> bool {
    let now = now_iso();
    let row: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT decision, snooze_until FROM activity_suggestion_memory
             WHERE account_id = ?1 AND card_kind = ?2 AND suggestion_key = ?3",
            params![account_id, CARD_KIND_SAVED_VIEW, sender_email],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    let Some((decision, snooze_until)) = row else {
        return false;
    };
    match decision.as_str() {
        "accepted" | "dismiss" => true,
        "snooze" => snooze_until
            .as_deref()
            .map(|s| s > now.as_str())
            .unwrap_or(false),
        _ => false,
    }
}

fn contact_display_name(conn: &Connection, account_id: &str, email: &str) -> String {
    conn.query_row(
        "SELECT COALESCE(display_name, '') FROM address_contacts
         WHERE account_id = ?1 AND lower(trim(email)) = lower(trim(?2)) LIMIT 1",
        params![account_id, email],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_default()
    .trim()
    .to_string()
}

fn contact_is_favorite(conn: &Connection, account_id: &str, email: &str) -> bool {
    conn.query_row(
        "SELECT is_favorite FROM address_contacts
         WHERE account_id = ?1 AND lower(trim(email)) = lower(trim(?2)) LIMIT 1",
        params![account_id, email],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n != 0)
    .unwrap_or(false)
}

fn compute_score(
    eng: &SenderEngagement,
    favorite: bool,
    policy: &ActivityCardPolicy,
) -> i32 {
    let dwell_min = (eng.dwell_ms / 60_000).max(0) as i32;
    let search_bonus = (eng.searches / 2).min(3);
    eng.opens * policy.weight_opens
        + eng.replies * policy.weight_replies
        + dwell_min * policy.weight_dwell_minutes
        + if favorite { policy.weight_favorite } else { 0 }
        + search_bonus
}

fn format_rationale(eng: &SenderEngagement) -> String {
    let dwell_min = (eng.dwell_ms / 60_000).max(0);
    let mut parts = vec![format!("{} ouverture{}", eng.opens, if eng.opens == 1 { "" } else { "s" })];
    if eng.replies > 0 {
        parts.push(format!(
            "{} réponse{}",
            eng.replies,
            if eng.replies == 1 { "" } else { "s" }
        ));
    }
    if dwell_min > 0 {
        parts.push(format!("~{} min lues", dwell_min));
    }
    parts.push("30 j".to_string());
    parts.join(" · ")
}

fn suggested_name_for(email: &str, display_name: &str) -> String {
    if !display_name.trim().is_empty() {
        return display_name.trim().to_string();
    }
    email.split('@').next().unwrap_or(email).to_string()
}

pub fn list_suggested_saved_views(
    db_path: &Path,
    account_id: &str,
    policy: Option<ActivityCardPolicy>,
) -> Result<Vec<SuggestedSavedView>, String> {
    let aid = account_id.trim();
    if aid.is_empty() {
        return Err("account_id vide.".into());
    }
    let policy = policy.unwrap_or_default();
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let since = cutoff_iso(WINDOW_DAYS);
    let engagements = load_sender_engagements(&conn, aid, &since)?;
    let covered = load_covered_sender_emails(db_path, aid)?;

    let mut scored: Vec<(SenderEngagement, i32, String, bool)> = Vec::new();
    for mut eng in engagements {
        let email = normalize_email(&eng.email).unwrap_or_else(|| eng.email.clone());
        eng.email = email.clone();
        if covered.contains(&email) {
            continue;
        }
        if is_suggestion_blocked(&conn, aid, &email, &policy) {
            continue;
        }
        let kind = sender_auto_kind_for_account(&conn, aid, &email);
        if kind == "auto" {
            continue;
        }
        let opens_ok = eng.opens >= policy.min_opens_30d;
        let replies_ok = eng.replies >= 1;
        if !opens_ok && !replies_ok {
            continue;
        }
        let favorite = contact_is_favorite(&conn, aid, &email);
        let score = compute_score(&eng, favorite, &policy);
        if score < policy.min_score {
            continue;
        }
        let display = contact_display_name(&conn, aid, &email);
        scored.push((eng, score, display, favorite));
    }

    scored.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.2.cmp(&b.2)));
    scored.truncate(policy.max_suggestions);

    Ok(scored
        .into_iter()
        .map(|(eng, score, display, _favorite)| {
            let name = suggested_name_for(&eng.email, &display);
            SuggestedSavedView {
                sender_email: eng.email.clone(),
                display_name: if display.is_empty() {
                    eng.email.clone()
                } else {
                    display
                },
                score,
                rationale_fr: format_rationale(&eng),
                suggested_name: name.clone(),
                query: SearchQuery {
                    text: None,
                    tags: vec![],
                    sender: Some(eng.email.clone()),
                    senders: vec![eng.email],
                    account_id: Some(aid.to_string()),
                    mailbox: None,
                    mode: SearchMode::Lexical,
                    language: None,
                },
            }
        })
        .collect())
}

pub fn record_suggestion_decision(
    db_path: &Path,
    account_id: &str,
    sender_email: &str,
    decision: SuggestionDecision,
    policy: Option<ActivityCardPolicy>,
) -> Result<(), String> {
    let aid = account_id.trim();
    let email = normalize_email(sender_email).ok_or_else(|| "email invalide.".to_string())?;
    let policy = policy.unwrap_or_default();
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let now = now_iso();
    let (decision_s, snooze_until): (&str, Option<String>) = match decision {
        SuggestionDecision::Dismiss => ("dismiss", None),
        SuggestionDecision::Accepted => ("accepted", None),
        SuggestionDecision::Snooze => (
            "snooze",
            Some(
                (Utc::now() + Duration::days(policy.snooze_days))
                    .format("%Y-%m-%dT%H:%M:%fZ")
                    .to_string(),
            ),
        ),
    };
    conn.execute(
        "INSERT INTO activity_suggestion_memory (account_id, card_kind, suggestion_key, decision, snooze_until, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(account_id, card_kind, suggestion_key) DO UPDATE SET
            decision = excluded.decision,
            snooze_until = excluded.snooze_until,
            updated_at = excluded.updated_at",
        params![
            aid,
            CARD_KIND_SAVED_VIEW,
            email,
            decision_s,
            snooze_until,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn activity_card_calibration_stats(
    db_path: &Path,
    account_id: &str,
) -> Result<ActivityCardCalibrationStats, String> {
    let aid = account_id.trim();
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let since = cutoff_iso(WINDOW_DAYS);
    let mut stats = ActivityCardCalibrationStats::default();

    let shown: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM activity_events
             WHERE account_id = ?1 AND event_type = ?2 AND occurred_at >= ?3",
            params![aid, EVENT_SUGGESTION_SHOWN, since],
            |r| r.get(0),
        )
        .unwrap_or(0);
    stats.suggestions_shown = shown.max(0) as u32;

    let clicked: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM activity_events
             WHERE account_id = ?1 AND event_type = ?2 AND occurred_at >= ?3",
            params![aid, EVENT_SUGGESTION_CLICKED, since],
            |r| r.get(0),
        )
        .unwrap_or(0);
    stats.suggestions_clicked = clicked.max(0) as u32;

    stats.suggestions_accepted = conn
        .query_row(
            "SELECT COUNT(*) FROM activity_suggestion_memory
             WHERE account_id = ?1 AND card_kind = ?2 AND decision = 'accepted'",
            params![aid, CARD_KIND_SAVED_VIEW],
            |r| r.get(0),
        )
        .unwrap_or(0)
        .max(0) as u32;

    stats.suggestions_dismissed = conn
        .query_row(
            "SELECT COUNT(*) FROM activity_suggestion_memory
             WHERE account_id = ?1 AND card_kind = ?2 AND decision = 'dismiss'",
            params![aid, CARD_KIND_SAVED_VIEW],
            |r| r.get(0),
        )
        .unwrap_or(0)
        .max(0) as u32;

    stats.suggestions_snoozed = conn
        .query_row(
            "SELECT COUNT(*) FROM activity_suggestion_memory
             WHERE account_id = ?1 AND card_kind = ?2 AND decision = 'snooze'",
            params![aid, CARD_KIND_SAVED_VIEW],
            |r| r.get(0),
        )
        .unwrap_or(0)
        .max(0) as u32;

    Ok(stats)
}

/// Enregistre un envoi comme interaction avec le correspondant principal du fil.
pub fn record_message_sent_activity(
    db_path: &Path,
    account_id: &str,
    thread_id: &str,
    mailbox: &str,
) -> Result<(), String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let sender = thread_primary_external_sender(&conn, account_id, thread_id)?;
    let Some(email) = sender else {
        return Ok(());
    };
    record_activity_events(
        db_path,
        account_id,
        &[ActivityEventInput {
            event_type: EVENT_MESSAGE_SENT.to_string(),
            thread_id: Some(thread_id.to_string()),
            sender_email: Some(email),
            mailbox: Some(mailbox.to_string()),
            duration_ms: None,
            meta_json: None,
        }],
    )?;
    Ok(())
}

fn thread_primary_external_sender(
    conn: &Connection,
    account_id: &str,
    thread_id: &str,
) -> Result<Option<String>, String> {
    let account_email: Option<String> = conn
        .query_row(
            "SELECT email FROM accounts WHERE id = ?1 LIMIT 1",
            params![account_id.trim()],
            |r| r.get(0),
        )
        .ok();
    let mut stmt = conn
        .prepare(
            "
            SELECT lower(trim(sender_email)), COUNT(*) AS n
            FROM messages
            WHERE account_id = ?1 AND thread_id = ?2
              AND sender_email IS NOT NULL AND trim(sender_email) != ''
            GROUP BY lower(trim(sender_email))
            ORDER BY n DESC
            LIMIT 8
            ",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id.trim(), thread_id.trim()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let acct_lo = account_email
        .as_deref()
        .map(|e| e.trim().to_lowercase())
        .unwrap_or_default();
    for r in rows {
        let (email, _) = r.map_err(|e| e.to_string())?;
        if acct_lo.is_empty() || email != acct_lo {
            return Ok(normalize_email(&email));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::open_sqlite_migrated;

    fn test_db() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("test.sqlite3");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls, auth_kind)
             VALUES ('acc1', 'Me', 'me@test.com', 'h', 993, 'tls', 0, 'h', 587, 'tls', 0, 'password')",
            [],
        )
        .expect("account");
        (dir, path)
    }

    #[test]
    fn record_and_purge_events() {
        let (_dir, path) = test_db();
        let n = record_activity_events(
            &path,
            "acc1",
            &[ActivityEventInput {
                event_type: EVENT_THREAD_OPENED.to_string(),
                thread_id: Some("t1".into()),
                sender_email: Some("mom@test.com".into()),
                mailbox: Some("INBOX".into()),
                duration_ms: None,
                meta_json: None,
            }],
        )
        .expect("record");
        assert_eq!(n, 1);
        let conn = open_sqlite_migrated(&path).expect("open");
        let purged = purge_activity_events_older_than(&conn, 0).expect("purge");
        assert_eq!(purged, 1);
    }

    #[test]
    fn suggests_engaged_sender() {
        let (_dir, path) = test_db();
        let conn = open_sqlite_migrated(&path).expect("open");
        conn.execute(
            "INSERT INTO address_contacts (account_id, email, display_name, last_seen_at, message_count, last_source, is_favorite, notes, source, updated_at)
             VALUES ('acc1', 'mom@test.com', 'Maman', '', 5, 'mail', 1, '', 'mail', '')",
            [],
        )
        .expect("contact");
        for _ in 0..4 {
            record_activity_events(
                &path,
                "acc1",
                &[ActivityEventInput {
                    event_type: EVENT_THREAD_OPENED.to_string(),
                    thread_id: Some("t1".into()),
                    sender_email: Some("mom@test.com".into()),
                    mailbox: None,
                    duration_ms: None,
                    meta_json: None,
                }],
            )
            .expect("rec");
        }
        record_activity_events(
            &path,
            "acc1",
            &[ActivityEventInput {
                event_type: EVENT_MESSAGE_SENT.to_string(),
                thread_id: Some("t1".into()),
                sender_email: Some("mom@test.com".into()),
                mailbox: None,
                duration_ms: None,
                meta_json: None,
            }],
        )
        .expect("reply");
        let suggestions = list_suggested_saved_views(&path, "acc1", None).expect("list");
        assert!(!suggestions.is_empty());
        assert_eq!(suggestions[0].sender_email, "mom@test.com");
    }

    #[test]
    fn dismiss_blocks_suggestion() {
        let (_dir, path) = test_db();
        for _ in 0..4 {
            record_activity_events(
                &path,
                "acc1",
                &[ActivityEventInput {
                    event_type: EVENT_THREAD_OPENED.to_string(),
                    thread_id: None,
                    sender_email: Some("mom@test.com".into()),
                    mailbox: None,
                    duration_ms: None,
                    meta_json: None,
                }],
            )
            .ok();
        }
        record_suggestion_decision(
            &path,
            "acc1",
            "mom@test.com",
            SuggestionDecision::Dismiss,
            None,
        )
        .expect("dismiss");
        let suggestions = list_suggested_saved_views(&path, "acc1", None).expect("list");
        assert!(suggestions.is_empty());
    }
}
