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
        let ts = row
            .5
            .as_deref()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let ts_key = ts.parse::<i64>().unwrap_or(0);
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
                subject: format!(
                    "{} → doublon de {}",
                    m.2,
                    canonical.2
                ),
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
    let sample: Vec<_> = duplicate_refs
        .into_iter()
        .take(20)
        .map(|r| enrich_thread_ref(conn, account_id, r))
        .collect();
    Ok(vec![OrgProposal {
        id: "duplicate-cross-mailbox".to_string(),
        kind: OrgProposalKind::DuplicateThreadCrossMailbox,
        section: "consolidate".to_string(),
        title: "Fils dupliqués entre dossiers".to_string(),
        rationale: "Même conversation présente dans plusieurs dossiers — archiver les copies redondantes.".to_string(),
        thread_ids: sample.iter().map(|r| r.thread_id.clone()).collect(),
        thread_refs: sample,
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

fn pick_canonical(members: &[(String, String, String, i64, i64)]) -> &(String, String, String, i64, i64) {
    members
        .iter()
        .max_by(|a, b| {
            let score_a = canonical_score(a);
            let score_b = canonical_score(b);
            score_a
                .cmp(&score_b)
                .then_with(|| a.4.cmp(&b.4))
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
