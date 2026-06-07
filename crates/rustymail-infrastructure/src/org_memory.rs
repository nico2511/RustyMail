//! Mémoire persistante des décisions Organiser V2.

use std::collections::HashSet;
use std::path::Path;

use chrono::{Duration, Utc};
use rusqlite::{params, Connection};
use rustymail_domain::{OrgProposal, OrgProposalKind, OrgV2DecisionKind, OrgV2MemorySummary};
use sha2::{Digest, Sha256};

use crate::open_sqlite_migrated;

const SNOOZE_DEFAULT_DAYS: i64 = 7;

pub fn migrate_org_memory(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS org_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            entry_kind TEXT NOT NULL,
            rule_key TEXT NOT NULL,
            scope_fingerprint TEXT NOT NULL,
            decision TEXT NOT NULL,
            snooze_until TEXT,
            thread_ids_json TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_org_memory_unique
            ON org_memory(account_id, entry_kind, rule_key, scope_fingerprint);
        CREATE INDEX IF NOT EXISTS idx_org_memory_account
            ON org_memory(account_id, decision);
        ",
    )
}

pub fn proposal_rule_key(proposal: &OrgProposal) -> String {
    if let Some(id) = proposal.explain_rule_id.as_deref() {
        let t = id.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    match proposal.kind {
        OrgProposalKind::StaleInboxRead => "stale-inbox-read".into(),
        OrgProposalKind::UnsubscribeNewsletter => "unsubscribe-newsletter".into(),
        OrgProposalKind::EmptyMailbox => "empty-mailbox".into(),
        OrgProposalKind::FlatMailboxTree => "flat-mailbox-tree".into(),
        OrgProposalKind::UnreadOutsideInbox => "unread-outside-inbox".into(),
        _ => proposal.id.split('-').take(2).collect::<Vec<_>>().join("-"),
    }
}

pub fn proposal_scope_fingerprint(proposal: &OrgProposal) -> String {
    let rule = proposal_rule_key(proposal);
    let mut ids: Vec<String> = proposal
        .thread_ids
        .iter()
        .chain(proposal.thread_refs.iter().map(|r| &r.thread_id))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && !s.starts_with("mailbox:"))
        .collect();
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return scope_fingerprint(&rule, &[proposal.id.as_str()]);
    }
    scope_fingerprint(&rule, &ids.iter().map(String::as_str).collect::<Vec<_>>())
}

fn scope_fingerprint(rule_key: &str, parts: &[&str]) -> String {
    let mut sorted: Vec<&str> = parts.to_vec();
    sorted.sort();
    let payload = format!("{}\n{}", rule_key, sorted.join("\n"));
    hex::encode(Sha256::digest(payload.as_bytes()))
}

fn now_iso() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%fZ").to_string()
}

pub fn list_ignored_mailboxes(conn: &Connection, account_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rule_key FROM org_memory
             WHERE account_id = ?1 AND entry_kind = 'mailbox_ignore' AND decision = 'ignore'
             ORDER BY rule_key COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn ignore_mailbox(path: &Path, account_id: &str, mailbox: &str) -> Result<(), String> {
    let mb = mailbox.trim();
    if mb.is_empty() {
        return Err("Dossier vide.".into());
    }
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let fp = scope_fingerprint("mailbox", &[mb]);
    upsert_memory(
        &conn,
        account_id,
        "mailbox_ignore",
        mb,
        &fp,
        "ignore",
        None,
        None,
    )
}

pub fn list_auto_archive_mailboxes(conn: &Connection, account_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rule_key FROM org_memory
             WHERE account_id = ?1 AND entry_kind = 'mailbox_auto_archive' AND decision = 'enabled'
             ORDER BY rule_key COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn is_mailbox_auto_archive(conn: &Connection, account_id: &str, mailbox: &str) -> Result<bool, String> {
    let mb = mailbox.trim();
    if mb.is_empty() {
        return Ok(false);
    }
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM org_memory
             WHERE account_id = ?1 AND entry_kind = 'mailbox_auto_archive'
               AND rule_key = ?2 AND decision = 'enabled'",
            params![account_id, mb],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

pub fn set_mailbox_auto_archive(path: &Path, account_id: &str, mailbox: &str) -> Result<(), String> {
    let mb = mailbox.trim();
    if mb.is_empty() {
        return Err("Dossier vide.".into());
    }
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let fp = scope_fingerprint("mailbox_auto_archive", &[mb]);
    upsert_memory(
        &conn,
        account_id,
        "mailbox_auto_archive",
        mb,
        &fp,
        "enabled",
        None,
        None,
    )
}

pub fn clear_mailbox_auto_archive(path: &Path, account_id: &str, mailbox: &str) -> Result<(), String> {
    let mb = mailbox.trim();
    if mb.is_empty() {
        return Err("Dossier vide.".into());
    }
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM org_memory
         WHERE account_id = ?1 AND entry_kind = 'mailbox_auto_archive' AND rule_key = ?2",
        params![account_id, mb],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn unignore_mailbox(path: &Path, account_id: &str, mailbox: &str) -> Result<(), String> {
    let mb = mailbox.trim();
    if mb.is_empty() {
        return Err("Dossier vide.".into());
    }
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM org_memory
         WHERE account_id = ?1 AND entry_kind = 'mailbox_ignore' AND rule_key = ?2",
        params![account_id, mb],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn record_proposal_decision(
    path: &Path,
    account_id: &str,
    proposal: &OrgProposal,
    decision: OrgV2DecisionKind,
    snooze_days: Option<u32>,
) -> Result<String, String> {
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let rule_key = proposal_rule_key(proposal);
    let fingerprint = proposal_scope_fingerprint(proposal);
    let (decision_str, snooze_until) = match decision {
        OrgV2DecisionKind::Applied => ("applied", None),
        OrgV2DecisionKind::Dismissed => ("dismissed", None),
        OrgV2DecisionKind::Snoozed => {
            let days = snooze_days.unwrap_or(SNOOZE_DEFAULT_DAYS as u32) as i64;
            let until = Utc::now() + Duration::days(days.max(1));
            (
                "snoozed",
                Some(until.format("%Y-%m-%dT%H:%M:%fZ").to_string()),
            )
        }
    };
    let thread_json = serde_json::to_string(&proposal.thread_ids).ok();
    upsert_memory(
        &conn,
        account_id,
        "proposal",
        &rule_key,
        &fingerprint,
        decision_str,
        snooze_until.as_deref(),
        thread_json.as_deref(),
    )?;
    Ok(fingerprint)
}

fn upsert_memory(
    conn: &Connection,
    account_id: &str,
    entry_kind: &str,
    rule_key: &str,
    fingerprint: &str,
    decision: &str,
    snooze_until: Option<&str>,
    thread_ids_json: Option<&str>,
) -> Result<(), String> {
    let now = now_iso();
    conn.execute(
        "INSERT INTO org_memory (
            account_id, entry_kind, rule_key, scope_fingerprint, decision,
            snooze_until, thread_ids_json, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(account_id, entry_kind, rule_key, scope_fingerprint) DO UPDATE SET
            decision = excluded.decision,
            snooze_until = excluded.snooze_until,
            thread_ids_json = excluded.thread_ids_json,
            updated_at = excluded.updated_at",
        params![
            account_id,
            entry_kind,
            rule_key,
            fingerprint,
            decision,
            snooze_until,
            thread_ids_json,
            now,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn memory_suppresses_proposal(
    conn: &Connection,
    account_id: &str,
    proposal: &OrgProposal,
) -> Result<bool, String> {
    let rule_key = proposal_rule_key(proposal);
    let fingerprint = proposal_scope_fingerprint(proposal);
    let row: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT decision, snooze_until FROM org_memory
             WHERE account_id = ?1 AND entry_kind = 'proposal'
               AND rule_key = ?2 AND scope_fingerprint = ?3
             LIMIT 1",
            params![account_id, rule_key, fingerprint],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .ok();
    let Some((decision, snooze_until)) = row else {
        return Ok(false);
    };
    if decision == "snoozed" {
        if let Some(until) = snooze_until {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&until.replace('Z', "+00:00")) {
                if dt > Utc::now() {
                    return Ok(true);
                }
            }
            return Ok(false);
        }
    }
    Ok(decision == "applied" || decision == "dismissed")
}

fn strip_ignored_mailbox_threads(
    proposal: &mut OrgProposal,
    ignored: &HashSet<String>,
) {
    if ignored.is_empty() {
        return;
    }
    proposal.thread_refs.retain(|r| {
        let mb = r.mailbox.trim();
        mb.is_empty() || !ignored.contains(mb)
    });
    proposal.thread_ids = proposal
        .thread_refs
        .iter()
        .filter(|r| !r.thread_id.starts_with("mailbox:"))
        .map(|r| r.thread_id.clone())
        .collect();
    let has_mailbox_refs = proposal
        .thread_refs
        .iter()
        .any(|r| r.thread_id.starts_with("mailbox:"));
    proposal.total_count = if has_mailbox_refs {
        proposal.thread_refs.len()
    } else {
        proposal
            .thread_refs
            .iter()
            .filter(|r| !r.thread_id.starts_with("mailbox:"))
            .count()
            .max(proposal.thread_ids.len())
    };
}

pub fn filter_proposals_with_memory(
    conn: &Connection,
    account_id: &str,
    mut proposals: Vec<OrgProposal>,
) -> Result<(Vec<OrgProposal>, OrgV2MemorySummary), String> {
    let ignored_list = list_ignored_mailboxes(conn, account_id)?;
    let ignored: HashSet<String> = ignored_list.iter().cloned().collect();
    let mut suppressed = 0usize;

    let mut kept = Vec::new();
    for mut p in proposals.drain(..) {
        if memory_suppresses_proposal(conn, account_id, &p)? {
            suppressed += 1;
            continue;
        }
        strip_ignored_mailbox_threads(&mut p, &ignored);
        if p.applicable && p.total_count == 0 && p.thread_refs.is_empty() {
            suppressed += 1;
            continue;
        }
        if p.applicable && p.thread_refs.is_empty() && p.thread_ids.is_empty() {
            suppressed += 1;
            continue;
        }
        kept.push(p);
    }

    Ok((
        kept,
        OrgV2MemorySummary {
            suppressed_count: suppressed,
            ignored_mailboxes: ignored_list,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::{OrgProposalKind, OrgProposalSource, OrgSuggestedAction};

    fn sample_proposal(id: &str, thread_ids: &[&str]) -> OrgProposal {
        OrgProposal {
            id: id.into(),
            kind: OrgProposalKind::StaleInboxRead,
            section: "range".into(),
            title: "test".into(),
            rationale: "".into(),
            thread_refs: vec![],
            thread_ids: thread_ids.iter().map(|s| (*s).to_string()).collect(),
            suggested_action: OrgSuggestedAction::Archive,
            target_mailbox: None,
            confidence: 1.0,
            source: OrgProposalSource::Heuristic,
            total_count: thread_ids.len(),
            applicable: true,
            llm_search_keywords: vec![],
            explain_rule_id: Some("stale-inbox-read".into()),
            explain_signals: vec![],
            unsubscribe_links: vec![],
        }
    }

    #[test]
    fn fingerprint_stable_for_same_threads() {
        let a = sample_proposal("p1", &["t2", "t1"]);
        let b = sample_proposal("p2", &["t1", "t2"]);
        assert_eq!(
            proposal_scope_fingerprint(&a),
            proposal_scope_fingerprint(&b)
        );
    }
}
