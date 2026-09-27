//! Consolidation : fils dupliqués cross-dossiers.

use rusqlite::{params, Connection};
use rustymail_domain::{
    OrgProposal, OrgProposalKind, OrgProposalSource, OrgSuggestedAction, OrgThreadRef,
};

use crate::org_scan::{enrich_thread_ref, is_archive_like_mailbox, is_inbox_like_mailbox};

#[derive(Debug, Clone, Default)]
struct DupGroup {
    members: Vec<(String, String, String, i64, i64)>, // thread_id, mailbox, subject, followed, recent_ts
}

pub fn scan_duplicate_threads(
    conn: &Connection,
    account_id: &str,
) -> Result<Vec<OrgProposal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.mailbox, t.subject, COALESCE(t.is_followed, 0),
                    t.thread_root_message_id,
                    (SELECT MAX(m.received_at) FROM messages m WHERE m.thread_id = t.id)
             FROM threads t
             WHERE t.account_id = ?1 AND t.thread_root_message_id IS NOT NULL
             AND trim(t.thread_root_message_id) != ''",
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
                r.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut by_root: std::collections::HashMap<String, DupGroup> = std::collections::HashMap::new();
    for row in rows.flatten() {
        let root = row.4.clone();
        let ts = row.5.as_deref().map(|s| s.to_string()).unwrap_or_default();
        let ts_key = received_at_epoch(&ts);
        by_root
            .entry(root)
            .or_default()
            .members
            .push((row.0, row.1, row.2, row.3, ts_key));
    }

    let mut duplicate_refs = Vec::new();
    for group in by_root.values() {
        let mailboxes: std::collections::HashSet<_> =
            group.members.iter().map(|m| m.1.clone()).collect();
        if mailboxes.len() < 2 {
            continue;
        }
        let canonical = pick_canonical(&group.members);
        for m in &group.members {
            if m.0 == canonical.0 {
                continue;
            }
            duplicate_refs.push(OrgThreadRef {
                thread_id: m.0.clone(),
                mailbox: m.1.clone(),
                subject: format!("{} → doublon de {}", m.2, canonical.2),
                ..Default::default()
            });
            if duplicate_refs.len() >= 500 {
                break;
            }
        }
        if duplicate_refs.len() >= 500 {
            break;
        }
    }

    if duplicate_refs.is_empty() {
        return Ok(Vec::new());
    }
    let total = duplicate_refs.len();
    let mut iter = duplicate_refs.into_iter();
    let mut kept = Vec::with_capacity(total);
    for r in iter.by_ref().take(20) {
        kept.push(enrich_thread_ref(conn, account_id, r));
    }
    kept.extend(iter);
    Ok(vec![OrgProposal {
        id: "duplicate-cross-mailbox".to_string(),
        kind: OrgProposalKind::DuplicateThreadCrossMailbox,
        section: "consolidate".to_string(),
        title: "Fils dupliqués entre dossiers".to_string(),
        rationale:
            "Même conversation présente dans plusieurs dossiers — archiver les copies redondantes."
                .to_string(),
        thread_ids: kept.iter().map(|r| r.thread_id.clone()).collect(),
        thread_refs: kept,
        suggested_action: OrgSuggestedAction::Archive,
        target_mailbox: None,
        confidence: 0.9,
        source: OrgProposalSource::Heuristic,
        total_count: total,
        applicable: true,
        llm_search_keywords: Vec::new(),
        explain_rule_id: Some("duplicate-cross-mailbox".to_string()),
        explain_signals: vec!["duplicate_thread".into(), "cross_mailbox".into()],
        unsubscribe_links: Vec::new(),
    }])
}

/// `received_at` est du RFC3339, pas un entier. `0` si la date est illisible.
fn received_at_epoch(ts: &str) -> i64 {
    let t = ts.trim();
    if t.is_empty() {
        return 0;
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(t) {
        return dt.timestamp();
    }
    if let Ok(dt) = t.parse::<chrono::DateTime<chrono::Utc>>() {
        return dt.timestamp();
    }
    0
}

fn pick_canonical(
    members: &[(String, String, String, i64, i64)],
) -> &(String, String, String, i64, i64) {
    members
        .iter()
        .max_by(|a, b| {
            let score_a = canonical_score(a);
            let score_b = canonical_score(b);
            score_a.cmp(&score_b).then_with(|| a.4.cmp(&b.4))
        })
        .unwrap()
}

fn canonical_score(m: &(String, String, String, i64, i64)) -> i32 {
    let mut s = 0i32;
    if is_inbox_like_mailbox(&m.1) {
        s += 100;
    }
    if m.3 != 0 {
        s += 50;
    }
    if is_archive_like_mailbox(&m.1) {
        s -= 10;
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn member(
        id: &str,
        mailbox: &str,
        followed: i64,
        ts: &str,
    ) -> (String, String, String, i64, i64) {
        (
            id.into(),
            mailbox.into(),
            "sujet".into(),
            followed,
            received_at_epoch(ts),
        )
    }

    #[test]
    fn rfc3339_dates_are_ordered() {
        assert!(
            received_at_epoch("2026-06-01T00:00:00Z") > received_at_epoch("2024-01-01T00:00:00Z")
        );
        assert_eq!(received_at_epoch("pas-une-date"), 0);
        assert_eq!(received_at_epoch(""), 0);
    }

    #[test]
    fn newer_copy_wins_when_scores_tie() {
        let older = member("old", "INBOX", 0, "2024-01-01T00:00:00Z");
        let newer = member("new", "INBOX", 0, "2026-06-01T00:00:00Z");
        assert_eq!(pick_canonical(&[older, newer]).0, "new");
    }
}
