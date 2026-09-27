//! Mémoire de motifs Organiser : préférences réutilisables, lues par l’orientation.
//!
//! `org_memory` masque un lot exact (mêmes fils). `org_decisions` généralise
//! l’action validée (même geste, autres fils). Aucun apply IMAP n’en découle.

use std::collections::BTreeMap;

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use rustymail_domain::{OrgProposal, OrgProposalSource, OrgSuggestedAction};

use crate::org_memory::list_ignored_mailboxes;

const MAX_DECISIONS_PER_ACCOUNT: i64 = 200;
const PROMPT_MAX_LINES: usize = 8;
const PROMPT_MAX_CHARS: usize = 600;
const DISMISS_MIN_SUPPORT: i64 = 2;
const TITLE_MAX_CHARS: usize = 80;
const FIELD_MAX_CHARS: usize = 200;
const KEYWORD_MAX_CHARS: usize = 32;
const KEYWORD_MAX: usize = 6;

pub(crate) fn migrate_org_decisions(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS org_decisions (
            id INTEGER PRIMARY KEY,
            account_id TEXT NOT NULL,
            pattern_key TEXT NOT NULL,
            decision TEXT NOT NULL,
            action TEXT NOT NULL,
            target_mailbox TEXT,
            rule_key TEXT,
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            keywords_json TEXT NOT NULL DEFAULT '[]',
            sender_domain TEXT,
            support_count INTEGER NOT NULL DEFAULT 1,
            scope_fingerprint TEXT,
            snooze_until TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (account_id, pattern_key)
        );
        CREATE INDEX IF NOT EXISTS idx_org_decisions_account_updated
            ON org_decisions(account_id, updated_at DESC);
        ",
    )
}

struct DecisionPattern {
    pattern_key: String,
    action: String,
    target_mailbox: Option<String>,
    rule_key: Option<String>,
    sender_domain: Option<String>,
    keywords: Vec<String>,
    source: String,
    title: String,
}

pub(crate) fn proposal_pattern_key(proposal: &OrgProposal) -> String {
    derive_pattern(proposal).pattern_key
}

fn derive_pattern(proposal: &OrgProposal) -> DecisionPattern {
    let action = action_label(proposal.suggested_action).to_string();
    let target_mailbox = proposal
        .target_mailbox
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let rule_key = proposal
        .explain_rule_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let sender_domain = if rule_key.is_some() {
        None
    } else {
        dominant_sender_domain(proposal)
    };
    let keywords = keywords_for_proposal(proposal);
    let pattern_key = format!(
        "{}|{}|{}|{}|{}",
        field_slot(&action),
        field_slot(target_mailbox.as_deref().unwrap_or("")),
        field_slot(rule_key.as_deref().unwrap_or("")),
        field_slot(sender_domain.as_deref().unwrap_or("")),
        keywords_slot(&keywords),
    );
    let source = match proposal.source {
        OrgProposalSource::Heuristic => "heuristic",
        OrgProposalSource::Llm => "llm",
    };
    DecisionPattern {
        pattern_key,
        action,
        target_mailbox,
        rule_key,
        sender_domain,
        keywords,
        source: source.to_string(),
        title: truncate_chars(&one_line(&proposal.title), TITLE_MAX_CHARS),
    }
}

fn action_label(action: OrgSuggestedAction) -> &'static str {
    match action {
        OrgSuggestedAction::Move => "move",
        OrgSuggestedAction::Archive => "archive",
        OrgSuggestedAction::Trash => "trash",
        OrgSuggestedAction::MarkRead => "markRead",
        OrgSuggestedAction::DeleteMailbox => "deleteMailbox",
        OrgSuggestedAction::Retag | OrgSuggestedAction::RepairThreading => "none",
    }
}

fn field_slot(value: &str) -> String {
    let cleaned = one_line(value).replace('|', " ");
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        "-".to_string()
    } else {
        truncate_chars(&collapsed, FIELD_MAX_CHARS)
    }
}

fn keywords_slot(keywords: &[String]) -> String {
    if keywords.is_empty() {
        "-".to_string()
    } else {
        keywords.join(",")
    }
}

fn one_line(text: &str) -> String {
    text.chars()
        .map(|c| if c == '\n' || c == '\r' { ' ' } else { c })
        .collect()
}

fn truncate_chars(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

fn keywords_for_proposal(proposal: &OrgProposal) -> Vec<String> {
    let mut raw: Vec<String> = proposal.llm_search_keywords.clone();
    if raw.is_empty() {
        for signal in &proposal.explain_signals {
            let lower = signal.trim().to_lowercase();
            if let Some(rest) = lower.strip_prefix("keywords:") {
                raw.extend(rest.split([',', ';']).map(str::to_string));
            }
        }
    }
    let mut seen = Vec::new();
    for token in raw {
        for part in token.split_whitespace() {
            let normalized = normalize_keyword(part);
            if normalized.chars().count() < 2 {
                continue;
            }
            if seen.iter().any(|existing: &String| existing == &normalized) {
                continue;
            }
            seen.push(normalized);
            if seen.len() >= KEYWORD_MAX {
                break;
            }
        }
        if seen.len() >= KEYWORD_MAX {
            break;
        }
    }
    seen.sort();
    seen
}

fn normalize_keyword(token: &str) -> String {
    let lower = token.trim().to_lowercase();
    let cleaned: String = lower
        .chars()
        .filter(|c| *c != '|' && *c != ',' && *c != ';')
        .collect();
    truncate_chars(cleaned.trim(), KEYWORD_MAX_CHARS)
}

fn dominant_sender_domain(proposal: &OrgProposal) -> Option<String> {
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for reference in &proposal.thread_refs {
        if reference.thread_id.starts_with("mailbox:") {
            continue;
        }
        let Some(email) = reference.sender_email.as_deref() else {
            continue;
        };
        let Some(domain) = sender_domain(email) else {
            continue;
        };
        *counts.entry(domain).or_insert(0) += 1;
    }
    counts
        .into_iter()
        .max_by(|left, right| left.1.cmp(&right.1).then_with(|| right.0.cmp(&left.0)))
        .map(|(domain, _)| domain)
}

fn sender_domain(raw: &str) -> Option<String> {
    let raw = raw.trim();
    let email = if let (Some(start), Some(end)) = (raw.rfind('<'), raw.rfind('>')) {
        if end > start {
            raw[start + 1..end].trim()
        } else {
            raw
        }
    } else {
        raw
    };
    let email = email.trim().trim_matches(|c| c == '"' || c == '\'');
    let lower = email.to_lowercase();
    let (_, domain) = lower.rsplit_once('@')?;
    let domain = domain.trim().trim_end_matches('.');
    if domain.is_empty()
        || domain.contains(' ')
        || !domain.contains('.')
        || !domain
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
    {
        return None;
    }
    Some(domain.to_string())
}

fn now_iso() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%fZ").to_string()
}

/// Incrémente `support_count` si le motif existe déjà. Au-delà de 200 lignes,
/// évince les plus anciennes à `support_count = 1`. Si toutes sont plus fortes,
/// le nouveau motif n’est pas inséré.
pub(crate) fn upsert_proposal_decision(
    conn: &Connection,
    account_id: &str,
    proposal: &OrgProposal,
    decision: &str,
    snooze_until: Option<&str>,
    scope_fingerprint: &str,
) -> Result<(), String> {
    let pattern = derive_pattern(proposal);
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM org_decisions WHERE account_id = ?1 AND pattern_key = ?2",
            params![account_id, pattern.pattern_key],
            |_| Ok(1_i64),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();
    if !exists && !make_room_for_new_pattern(conn, account_id)? {
        log::debug!("org_decisions: plafond atteint, motif faible non retenu");
        return Ok(());
    }
    let keywords_json = serde_json::to_string(&pattern.keywords).unwrap_or_else(|_| "[]".into());
    let now = now_iso();
    conn.execute(
        "INSERT INTO org_decisions (
            account_id, pattern_key, decision, action, target_mailbox, rule_key, source,
            title, keywords_json, sender_domain, support_count, scope_fingerprint,
            snooze_until, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?12, ?13, ?13)
         ON CONFLICT(account_id, pattern_key) DO UPDATE SET
            decision = excluded.decision,
            action = excluded.action,
            target_mailbox = excluded.target_mailbox,
            rule_key = excluded.rule_key,
            source = excluded.source,
            title = excluded.title,
            keywords_json = excluded.keywords_json,
            sender_domain = excluded.sender_domain,
            support_count = org_decisions.support_count + 1,
            scope_fingerprint = excluded.scope_fingerprint,
            snooze_until = excluded.snooze_until,
            updated_at = excluded.updated_at",
        params![
            account_id,
            pattern.pattern_key,
            decision,
            pattern.action,
            pattern.target_mailbox,
            pattern.rule_key,
            pattern.source,
            pattern.title,
            keywords_json,
            pattern.sender_domain,
            scope_fingerprint,
            snooze_until,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn decision_count(conn: &Connection, account_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM org_decisions WHERE account_id = ?1",
        params![account_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

/// `true` s’il reste une place (éventuellement après éviction des motifs à support 1).
fn make_room_for_new_pattern(conn: &Connection, account_id: &str) -> Result<bool, String> {
    loop {
        if decision_count(conn, account_id)? < MAX_DECISIONS_PER_ACCOUNT {
            return Ok(true);
        }
        if !evict_oldest_weak(conn, account_id)? {
            return Ok(false);
        }
    }
}

fn evict_oldest_weak(conn: &Connection, account_id: &str) -> Result<bool, String> {
    let id: Option<i64> = conn
        .query_row(
            "SELECT id FROM org_decisions
             WHERE account_id = ?1 AND support_count = 1
             ORDER BY updated_at ASC, id ASC
             LIMIT 1",
            params![account_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(id) = id else {
        return Ok(false);
    };
    conn.execute("DELETE FROM org_decisions WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Motif `dismissed` répété : retire une action LLM identique. Un motif `applied` ne masque rien.
pub(crate) fn llm_pattern_suppressed(
    conn: &Connection,
    account_id: &str,
    proposal: &OrgProposal,
) -> Result<bool, String> {
    if proposal.source != OrgProposalSource::Llm {
        return Ok(false);
    }
    let pattern_key = proposal_pattern_key(proposal);
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT decision, support_count FROM org_decisions
             WHERE account_id = ?1 AND pattern_key = ?2",
            params![account_id, pattern_key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(matches!(
        row,
        Some((decision, support))
            if decision == "dismissed" && support >= DISMISS_MIN_SUPPORT
    ))
}

struct PromptRow {
    decision: String,
    support_count: i64,
    action: String,
    target_mailbox: Option<String>,
    rule_key: Option<String>,
    keywords: Vec<String>,
    sender_domain: Option<String>,
}

/// Bloc court pour le prompt d’orientation. 8 lignes, ~600 caractères.
/// Les dossiers ignorés (`org_memory`) y sont cités, sans copie dans cette table.
pub(crate) fn format_prior_decisions_block(
    conn: &Connection,
    account_id: &str,
) -> Result<String, String> {
    let rows = {
        let mut stmt = conn
            .prepare(
                "SELECT decision, support_count, action, target_mailbox, rule_key,
                        keywords_json, sender_domain
                 FROM org_decisions
                 WHERE account_id = ?1
                 ORDER BY support_count DESC, updated_at DESC, id DESC",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![account_id], |row| {
                let keywords_json: String = row.get(5)?;
                Ok(PromptRow {
                    decision: row.get(0)?,
                    support_count: row.get(1)?,
                    action: row.get(2)?,
                    target_mailbox: row.get(3)?,
                    rule_key: row.get(4)?,
                    keywords: serde_json::from_str(&keywords_json).unwrap_or_default(),
                    sender_domain: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        mapped
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    let mut lines = Vec::new();
    for row in rows {
        if lines.len() >= PROMPT_MAX_LINES {
            break;
        }
        lines.push(format_decision_line(&row));
    }
    if lines.len() < PROMPT_MAX_LINES {
        for mailbox in list_ignored_mailboxes(conn, account_id)? {
            if lines.len() >= PROMPT_MAX_LINES {
                break;
            }
            let name = field_slot(&mailbox);
            if name == "-" {
                continue;
            }
            lines.push(format!("ignored mailbox | {name}"));
        }
    }
    Ok(bound_prompt_lines(lines))
}

fn format_decision_line(row: &PromptRow) -> String {
    let mut line = format!(
        "{} ×{} | {}",
        row.decision.trim(),
        row.support_count,
        action_phrase(&row.action, row.target_mailbox.as_deref())
    );
    if let Some(rule) = row
        .rule_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        line.push_str(" | règle ");
        line.push_str(rule);
    }
    if !row.keywords.is_empty() {
        line.push_str(" | mots ");
        line.push_str(&row.keywords.join(","));
    }
    if let Some(domain) = row
        .sender_domain
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        line.push_str(" | domaine ");
        line.push_str(domain);
    }
    one_line(&line)
}

fn action_phrase(action: &str, target: Option<&str>) -> String {
    if action == "move" {
        if let Some(target) = target.map(str::trim).filter(|value| !value.is_empty()) {
            return format!("move → {target}");
        }
    }
    action.to_string()
}

fn bound_prompt_lines(lines: Vec<String>) -> String {
    let mut kept = Vec::new();
    let mut chars = 0usize;
    for line in lines.into_iter().take(PROMPT_MAX_LINES) {
        let line = truncate_chars(&line, PROMPT_MAX_CHARS);
        let extra = line.chars().count() + usize::from(!kept.is_empty());
        if !kept.is_empty() && chars + extra > PROMPT_MAX_CHARS {
            break;
        }
        chars += extra;
        kept.push(line);
    }
    kept.join("\n")
}

pub(crate) fn purge_account_org_state(conn: &Connection, account_id: &str) -> Result<(), String> {
    for sql in [
        "DELETE FROM org_decisions WHERE account_id = ?1",
        "DELETE FROM org_memory WHERE account_id = ?1",
        "DELETE FROM org_apply_history WHERE account_id = ?1",
    ] {
        conn.execute(sql, params![account_id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    use rustymail_domain::{OrgProposalKind, OrgSuggestedAction, OrgThreadRef, OrgV2DecisionKind};
    use rustymail_llm::LlmEngine;
    use tempfile::tempdir;

    use crate::open_sqlite_migrated;
    use crate::org_memory::{filter_proposals_with_memory, record_proposal_decision};

    fn proposal(build: impl FnOnce(&mut OrgProposal)) -> OrgProposal {
        let mut proposal = OrgProposal {
            id: "llm-0".into(),
            kind: OrgProposalKind::LlmCluster,
            section: "range".into(),
            title: "Déplacer les factures vers Finance".into(),
            rationale: "Lot de factures.".into(),
            thread_refs: vec![],
            thread_ids: vec![],
            suggested_action: OrgSuggestedAction::Move,
            target_mailbox: Some("Finance".into()),
            confidence: 0.7,
            source: OrgProposalSource::Llm,
            total_count: 0,
            applicable: true,
            llm_search_keywords: vec!["receipt".into(), "invoice".into()],
            explain_rule_id: None,
            explain_signals: vec![],
            unsubscribe_links: vec![],
        };
        build(&mut proposal);
        proposal.total_count = proposal.thread_ids.len();
        proposal
    }

    fn threads(ids: &[&str], domain: &str) -> (Vec<String>, Vec<OrgThreadRef>) {
        let thread_ids: Vec<String> = ids.iter().map(|id| (*id).to_string()).collect();
        let refs = thread_ids
            .iter()
            .map(|id| OrgThreadRef {
                thread_id: id.clone(),
                mailbox: "INBOX".into(),
                subject: "Facture".into(),
                sender_email: Some(format!("billing@{domain}")),
                ..Default::default()
            })
            .collect();
        (thread_ids, refs)
    }

    fn finance_move(ids: &[&str]) -> OrgProposal {
        let (thread_ids, thread_refs) = threads(ids, "amazon.fr");
        proposal(|p| {
            p.thread_ids = thread_ids;
            p.thread_refs = thread_refs;
        })
    }

    fn stale_archive(ids: &[&str]) -> OrgProposal {
        let (thread_ids, thread_refs) = threads(ids, "news.example");
        proposal(|p| {
            p.id = "stale-inbox-read".into();
            p.kind = OrgProposalKind::StaleInboxRead;
            p.title = "Inbox lue".into();
            p.suggested_action = OrgSuggestedAction::Archive;
            p.target_mailbox = None;
            p.source = OrgProposalSource::Heuristic;
            p.llm_search_keywords.clear();
            p.explain_rule_id = Some("stale-inbox-read".into());
            p.thread_ids = thread_ids;
            p.thread_refs = thread_refs;
        })
    }

    fn test_db() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("org-decisions.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
             VALUES ('acc', 'Test', 't@example.com', 'h', 993, 'tls', 0, 'h', 465, 'tls', 0)",
            [],
        )
        .expect("account");
        drop(conn);
        (dir, path)
    }

    fn count_patterns(path: &Path, account_id: &str) -> i64 {
        let conn = open_sqlite_migrated(path).expect("open");
        conn.query_row(
            "SELECT COUNT(*) FROM org_decisions WHERE account_id = ?1",
            params![account_id],
            |row| row.get(0),
        )
        .expect("count")
    }

    fn support_of(path: &Path, account_id: &str, pattern_key: &str) -> Option<(String, i64)> {
        let conn = open_sqlite_migrated(path).expect("open");
        conn.query_row(
            "SELECT decision, support_count FROM org_decisions
             WHERE account_id = ?1 AND pattern_key = ?2",
            params![account_id, pattern_key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .expect("query")
    }

    #[test]
    fn pattern_key_matches_audit_examples() {
        let stale = stale_archive(&["t1"]);
        assert_eq!(
            proposal_pattern_key(&stale),
            "archive|-|stale-inbox-read|-|-"
        );
        let invoices = finance_move(&["a", "b"]);
        assert_eq!(
            proposal_pattern_key(&invoices),
            "move|Finance|-|amazon.fr|invoice,receipt"
        );
        assert!(!proposal_pattern_key(&invoices).contains("billing@"));
        assert!(!proposal_pattern_key(&invoices).contains("secret"));
    }

    #[test]
    fn same_pattern_increments_support_other_pattern_does_not() {
        let (_dir, path) = test_db();
        let first = finance_move(&["t1", "t2"]);
        let same = finance_move(&["t3"]);
        let other = finance_move(&["t9"]);
        let mut other = other;
        other.target_mailbox = Some("Perso".into());
        record_proposal_decision(&path, "acc", &first, OrgV2DecisionKind::Applied, None)
            .expect("first");
        record_proposal_decision(&path, "acc", &same, OrgV2DecisionKind::Applied, None)
            .expect("same");
        record_proposal_decision(&path, "acc", &other, OrgV2DecisionKind::Dismissed, None)
            .expect("other");
        let finance_key = proposal_pattern_key(&first);
        let perso_key = proposal_pattern_key(&other);
        assert_ne!(finance_key, perso_key);
        assert_eq!(
            support_of(&path, "acc", &finance_key).expect("finance"),
            ("applied".into(), 2)
        );
        assert_eq!(
            support_of(&path, "acc", &perso_key).expect("perso"),
            ("dismissed".into(), 1)
        );
        assert_eq!(count_patterns(&path, "acc"), 2);
    }

    #[test]
    fn dismissed_snoozed_and_applied_write_expected_rows() {
        let (_dir, path) = test_db();
        let card = finance_move(&["t1"]);
        record_proposal_decision(&path, "acc", &card, OrgV2DecisionKind::Dismissed, None)
            .expect("dismiss");
        let snooze = {
            let mut card = finance_move(&["t2"]);
            card.target_mailbox = Some("Attente".into());
            card
        };
        record_proposal_decision(&path, "acc", &snooze, OrgV2DecisionKind::Snoozed, Some(7))
            .expect("snooze");
        let conn = open_sqlite_migrated(&path).expect("open");
        let snooze_until: Option<String> = conn
            .query_row(
                "SELECT snooze_until FROM org_decisions WHERE pattern_key = ?1",
                params![proposal_pattern_key(&snooze)],
                |row| row.get(0),
            )
            .expect("snooze row");
        assert!(snooze_until.is_some());
        let applied_until: Option<String> = conn
            .query_row(
                "SELECT snooze_until FROM org_decisions WHERE pattern_key = ?1",
                params![proposal_pattern_key(&card)],
                |row| row.get(0),
            )
            .expect("dismiss row");
        assert!(applied_until.is_none());
        let stored_title: String = conn
            .query_row(
                "SELECT title FROM org_decisions WHERE account_id = 'acc' LIMIT 1",
                [],
                |row| row.get(0),
            )
            .expect("title");
        assert!(stored_title.chars().count() <= TITLE_MAX_CHARS);
        let blob: String = conn
            .query_row(
                "SELECT pattern_key || keywords_json || COALESCE(sender_domain,'') || title
                 FROM org_decisions WHERE pattern_key = ?1",
                params![proposal_pattern_key(&card)],
                |row| row.get(0),
            )
            .expect("blob");
        assert!(!blob.contains("t1"));
        assert!(!blob.contains("Lot de factures"));
    }

    #[test]
    fn repeated_dismiss_hides_new_threads_applied_does_not() {
        let (_dir, path) = test_db();
        record_proposal_decision(
            &path,
            "acc",
            &finance_move(&["a", "b"]),
            OrgV2DecisionKind::Dismissed,
            None,
        )
        .expect("d1");
        record_proposal_decision(
            &path,
            "acc",
            &finance_move(&["c"]),
            OrgV2DecisionKind::Dismissed,
            None,
        )
        .expect("d2");
        let fresh = finance_move(&["e", "f"]);
        let heuristic = stale_archive(&["h1"]);
        let conn = open_sqlite_migrated(&path).expect("open");
        let (kept, memory) =
            filter_proposals_with_memory(&conn, "acc", vec![fresh.clone(), heuristic.clone()])
                .expect("filter");
        assert_eq!(memory.suppressed_count, 1);
        assert!(kept
            .iter()
            .all(|p| p.id != fresh.id || p.thread_ids != fresh.thread_ids));
        assert!(kept
            .iter()
            .any(|p| p.explain_rule_id.as_deref() == Some("stale-inbox-read")));
        assert!(!kept.iter().any(|p| p.thread_ids == fresh.thread_ids));

        let applied_new = finance_move(&["n1", "n2"]);
        record_proposal_decision(
            &path,
            "acc",
            &finance_move(&["old"]),
            OrgV2DecisionKind::Applied,
            None,
        )
        .expect("apply overwrites decision");
        let conn = open_sqlite_migrated(&path).expect("reopen");
        let (kept_applied, _) =
            filter_proposals_with_memory(&conn, "acc", vec![applied_new.clone()]).expect("filter");
        assert_eq!(kept_applied.len(), 1);
        assert_eq!(kept_applied[0].thread_ids, applied_new.thread_ids);
    }

    #[test]
    fn single_dismiss_does_not_hide_and_exact_lot_stays_hidden() {
        let (_dir, path) = test_db();
        let lot = finance_move(&["a", "b"]);
        record_proposal_decision(&path, "acc", &lot, OrgV2DecisionKind::Dismissed, None)
            .expect("once");
        let other_threads = finance_move(&["c", "d"]);
        let conn = open_sqlite_migrated(&path).expect("open");
        let (kept, memory) =
            filter_proposals_with_memory(&conn, "acc", vec![lot.clone(), other_threads.clone()])
                .expect("filter");
        assert!(kept
            .iter()
            .any(|p| p.thread_ids == other_threads.thread_ids));
        assert!(!kept.iter().any(|p| p.thread_ids == lot.thread_ids));
        assert!(memory.suppressed_count >= 1);
    }

    #[test]
    fn prompt_mentions_previous_applied_move_without_old_thread_ids() {
        let (_dir, path) = test_db();
        let old = finance_move(&["thread-already-handled"]);
        record_proposal_decision(&path, "acc", &old, OrgV2DecisionKind::Applied, None)
            .expect("applied");
        let conn = open_sqlite_migrated(&path).expect("open");
        conn.execute(
            "INSERT INTO org_memory (account_id, entry_kind, rule_key, scope_fingerprint, decision, created_at, updated_at)
             VALUES ('acc', 'mailbox_ignore', 'Newsletters/Promo', 'fp-ignore', 'ignore', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .expect("ignore");
        let block = format_prior_decisions_block(&conn, "acc").expect("block");
        assert!(block.contains("applied ×1 | move → Finance"));
        assert!(block.contains("mots invoice,receipt"));
        assert!(block.contains("domaine amazon.fr"));
        assert!(block.contains("ignored mailbox | Newsletters/Promo"));
        assert!(!block.contains("thread-already-handled"));
        assert!(!block.contains("billing@amazon.fr"));

        let local = LlmEngine::open_ai_compatible(
            "http://127.0.0.1:8080/v1".into(),
            "local".into(),
            String::new(),
        )
        .expect("loopback engine");
        let prompt = rustymail_modules::ai_org_proposals::render_org_orientation_user_prompt(
            &local,
            "acc",
            "stale-inbox-read | Inbox | count=1 | action=archive | ids=h1",
            "thread-new;INBOX;shop@amazon.fr;Facture mars",
            &block,
        );
        assert!(prompt.contains("applied ×1 | move → Finance"));
        assert!(prompt.contains("thread-new"));
        assert!(prompt.contains("DÉBUT CONTENU NON FIABLE: prior-decisions"));
        assert!(!prompt.contains("thread-already-handled"));

        let remote = LlmEngine::open_router(
            "test-key".into(),
            "https://openrouter.ai/api/v1".into(),
            "model".into(),
        )
        .expect("openrouter");
        let leaky = finance_move(&["x"]);
        let mut leaky = leaky;
        leaky.llm_search_keywords = vec!["billing@example.com".into()];
        leaky.target_mailbox = Some("Secrets".into());
        record_proposal_decision(&path, "acc", &leaky, OrgV2DecisionKind::Applied, None)
            .expect("leaky");
        let conn = open_sqlite_migrated(&path).expect("reopen");
        let leaky_block = format_prior_decisions_block(&conn, "acc").expect("leaky block");
        assert!(leaky_block.contains("billing@example.com"));
        let redacted = rustymail_modules::ai_org_proposals::render_org_orientation_user_prompt(
            &remote,
            "acc",
            "",
            "thread-new;INBOX;shop@amazon.fr;Facture",
            &leaky_block,
        );
        assert!(redacted.contains("[REDACTED_EMAIL]"));
        assert!(!redacted.contains("billing@example.com"));
        assert!(redacted.contains("DÉBUT CONTENU NON FIABLE: prior-decisions"));
        let local_keeps = rustymail_modules::ai_org_proposals::render_org_orientation_user_prompt(
            &local,
            "acc",
            "",
            "thread-new;INBOX;shop@amazon.fr;Facture",
            &leaky_block,
        );
        assert!(local_keeps.contains("billing@example.com"));
    }

    #[test]
    fn cap_evicts_oldest_support_one_and_keeps_stronger_rows() {
        let (_dir, path) = test_db();
        let conn = open_sqlite_migrated(&path).expect("open");
        let strong = proposal(|p| {
            p.target_mailbox = Some("Keep".into());
            p.thread_ids = vec!["s".into()];
        });
        upsert_proposal_decision(&conn, "acc", &strong, "applied", None, "fp-strong")
            .expect("strong");
        upsert_proposal_decision(&conn, "acc", &strong, "applied", None, "fp-strong")
            .expect("strong+");
        for index in 0..199 {
            let card = proposal(|p| {
                p.target_mailbox = Some(format!("Box{index}"));
                p.llm_search_keywords = vec!["invoice".into()];
                p.thread_ids = vec![format!("t{index}")];
            });
            upsert_proposal_decision(&conn, "acc", &card, "dismissed", None, "fp").expect("weak");
        }
        assert_eq!(decision_count(&conn, "acc").expect("count"), 200);
        let extra = proposal(|p| {
            p.target_mailbox = Some("Box-extra".into());
            p.thread_ids = vec!["extra".into()];
        });
        upsert_proposal_decision(&conn, "acc", &extra, "dismissed", None, "fp-extra")
            .expect("extra");
        assert_eq!(decision_count(&conn, "acc").expect("count"), 200);
        assert!(support_of_conn(&conn, "move|Keep|-|-|invoice,receipt").is_some());
        assert!(support_of_conn(&conn, "move|Box0|-|-|invoice").is_none());
        assert!(support_of_conn(&conn, "move|Box-extra|-|-|invoice,receipt").is_some());

        conn.execute("UPDATE org_decisions SET support_count = 2", [])
            .expect("bump");
        let blocked = proposal(|p| {
            p.target_mailbox = Some("Blocked".into());
            p.thread_ids = vec!["blocked".into()];
        });
        upsert_proposal_decision(&conn, "acc", &blocked, "applied", None, "fp-blocked")
            .expect("blocked");
        assert_eq!(decision_count(&conn, "acc").expect("count"), 200);
        assert!(support_of_conn(&conn, "move|Blocked|-|-|invoice,receipt").is_none());

        fn support_of_conn(conn: &Connection, key: &str) -> Option<i64> {
            conn.query_row(
                "SELECT support_count FROM org_decisions WHERE pattern_key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .expect("q")
        }
    }

    #[test]
    fn prompt_block_is_bounded_and_sorted_by_support() {
        let (_dir, path) = test_db();
        let conn = open_sqlite_migrated(&path).expect("open");
        for index in 0..12 {
            let card = proposal(|p| {
                p.target_mailbox = Some(format!("Dossier{index:02}{}", "x".repeat(40)));
                p.llm_search_keywords = vec!["invoice".into()];
                p.thread_ids = vec![format!("id{index}")];
            });
            upsert_proposal_decision(&conn, "acc", &card, "applied", None, "fp").expect("row");
            if index == 3 {
                upsert_proposal_decision(&conn, "acc", &card, "applied", None, "fp")
                    .expect("boost");
            }
        }
        let block = format_prior_decisions_block(&conn, "acc").expect("block");
        assert!(block.lines().count() <= PROMPT_MAX_LINES);
        assert!(block.chars().count() <= PROMPT_MAX_CHARS);
        let first = block.lines().next().expect("line");
        assert!(first.contains("×2"));
        assert!(first.contains("Dossier03"));
        assert!(!block.contains("id0"));
    }

    #[test]
    fn delete_account_purges_org_tables_for_that_account_only() {
        let (_dir, path) = test_db();
        let conn = open_sqlite_migrated(&path).expect("open");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
             VALUES ('other', 'Other', 'o@example.com', 'h', 993, 'tls', 0, 'h', 465, 'tls', 0)",
            [],
        )
        .expect("other account");
        drop(conn);
        record_proposal_decision(
            &path,
            "acc",
            &finance_move(&["t1"]),
            OrgV2DecisionKind::Applied,
            None,
        )
        .expect("acc decision");
        record_proposal_decision(
            &path,
            "other",
            &finance_move(&["t9"]),
            OrgV2DecisionKind::Applied,
            None,
        )
        .expect("other decision");
        let conn = open_sqlite_migrated(&path).expect("open");
        conn.execute(
            "INSERT INTO org_memory (account_id, entry_kind, rule_key, scope_fingerprint, decision, created_at, updated_at)
             VALUES ('acc', 'mailbox_ignore', 'Promo', 'fp', 'ignore', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .expect("memory");
        conn.execute(
            "INSERT INTO org_apply_history (account_id, batch_id, thread_id, action, from_mailbox, to_mailbox)
             VALUES ('acc', 'batch', 't1', 'move', 'INBOX', 'Finance')",
            [],
        )
        .expect("history");
        drop(conn);

        crate::delete_account(&path, "acc").expect("delete");
        let conn = open_sqlite_migrated(&path).expect("reopen");
        for table in ["org_decisions", "org_memory", "org_apply_history"] {
            let left: i64 = conn
                .query_row(
                    &format!("SELECT COUNT(*) FROM {table} WHERE account_id = 'acc'"),
                    [],
                    |row| row.get(0),
                )
                .expect(table);
            assert_eq!(left, 0, "{table}");
        }
        let other: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM org_decisions WHERE account_id = 'other'",
                [],
                |row| row.get(0),
            )
            .expect("other");
        assert_eq!(other, 1);
    }

    #[test]
    fn partial_apply_does_not_record_and_mail_core_ignores_the_table() {
        let apply_ui = include_str!("../../../src/app/mail/orgV2ApplyOutcomeRun.ts");
        let start = apply_ui
            .find("if (cleanSuccess)")
            .expect("cleanSuccess branch");
        let rest = apply_ui
            .find("} else if (cancelled)")
            .expect("cancelled branch");
        assert!(apply_ui[start..rest].contains("\"applied\""));
        assert!(!apply_ui[rest..].contains("orgV2RecordDecision"));

        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        for relative in [
            "src/imap/mod.rs",
            "src/imap/ops.rs",
            "src/imap/sync.rs",
            "src/imap/session.rs",
            "src/imap/idle_push.rs",
            "src/imap/sent_append.rs",
            "src/smtp_send.rs",
            "src/mail_ops.rs",
            "src/sqlite_sent.rs",
            "src/org_apply.rs",
        ] {
            let text = std::fs::read_to_string(manifest.join(relative)).expect(relative);
            assert!(
                !text.contains("org_decisions"),
                "{relative} ne doit pas lire la mémoire de motifs"
            );
        }
        let workspace = manifest.parent().and_then(Path::parent).expect("workspace");
        for relative in [
            "crates/rustymail-application/src/lib.rs",
            "crates/rustymail-domain/src/message.rs",
            "crates/rustymail-domain/src/mailbox.rs",
        ] {
            let text = std::fs::read_to_string(workspace.join(relative)).expect(relative);
            assert!(!text.contains("org_decisions"), "{relative}");
        }
    }
}
