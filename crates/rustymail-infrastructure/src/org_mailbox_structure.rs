//! Analyse de la structure des dossiers IMAP (cache SQLite + imap_state).

use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{params, Connection};
use rustymail_domain::{
    OrgMailboxEntry, OrgMailboxStructure, OrgProposal, OrgProposalKind, OrgProposalSource,
    OrgSuggestedAction, OrgThreadRef,
};

use crate::mail_ops::is_trash_like_mailbox;
use crate::org_scan::{is_archive_like_mailbox, is_drafts_like_mailbox, is_inbox_like_mailbox};

const FLAT_ROOT_THRESHOLD: usize = 6;

fn mailbox_depth(name: &str) -> u32 {
    name.split('/').filter(|s| !s.is_empty()).count() as u32
}

fn is_system_mailbox(name: &str) -> bool {
    is_inbox_like_mailbox(name)
        || is_drafts_like_mailbox(name)
        || is_trash_like_mailbox(name)
        || is_archive_like_mailbox(name)
        || {
            let l = name.to_ascii_lowercase();
            l.contains("sent") || l.contains("envoy") || l.contains("spam") || l.contains("junk")
        }
}

pub fn analyze_mailbox_structure(
    conn: &Connection,
    account_id: &str,
) -> Result<(OrgMailboxStructure, Vec<OrgProposal>), String> {
    let mut names: BTreeSet<String> = BTreeSet::new();

    let mut stmt = conn
        .prepare("SELECT mailbox FROM imap_state WHERE account_id = ?1")
        .map_err(|e| e.to_string())?;
    for mb in stmt
        .query_map(params![account_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .flatten()
    {
        if !mb.trim().is_empty() {
            names.insert(mb);
        }
    }

    let mut stmt = conn
        .prepare("SELECT DISTINCT mailbox FROM messages WHERE account_id = ?1")
        .map_err(|e| e.to_string())?;
    for mb in stmt
        .query_map(params![account_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .flatten()
    {
        if !mb.trim().is_empty() {
            names.insert(mb);
        }
    }

    let mut counts: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    let mut stmt = conn
        .prepare(
            "SELECT mailbox, COUNT(DISTINCT thread_id), COUNT(*) FROM messages
             WHERE account_id = ?1 GROUP BY mailbox",
        )
        .map_err(|e| e.to_string())?;
    for row in stmt
        .query_map(params![account_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)? as usize,
                r.get::<_, i64>(2)? as usize,
            ))
        })
        .map_err(|e| e.to_string())?
        .flatten()
    {
        counts.insert(row.0.clone(), (row.1, row.2));
        names.insert(row.0);
    }

    let mut entries: Vec<OrgMailboxEntry> = names
        .iter()
        .map(|mb| {
            let (tc, mc) = counts.get(mb).copied().unwrap_or((0, 0));
            OrgMailboxEntry {
                mailbox: mb.clone(),
                thread_count: tc,
                message_count: mc,
                depth: mailbox_depth(mb),
                is_system: is_system_mailbox(mb),
                is_empty: mc == 0,
            }
        })
        .collect();
    entries.sort_by(|a, b| {
        a.depth
            .cmp(&b.depth)
            .then_with(|| a.mailbox.cmp(&b.mailbox))
    });

    let total_folders = entries.len();
    let folders_with_messages = entries.iter().filter(|e| e.message_count > 0).count();
    let root_personal_count = entries
        .iter()
        .filter(|e| e.depth <= 1 && !e.is_system)
        .count();
    let max_depth = entries.iter().map(|e| e.depth).max().unwrap_or(0);
    let empty_count = entries.iter().filter(|e| e.is_empty).count();

    let mut summary_lines = vec![
        format!("{total_folders} dossier(s) repéré(s) sur le compte."),
        format!("{folders_with_messages} avec au moins un message en cache local."),
        format!("{root_personal_count} dossier(s) personnels à la racine (hors Inbox / Envoyés / corbeille…)."),
    ];
    if max_depth > 0 {
        summary_lines.push(format!("Profondeur maximale de l’arbre : {max_depth} niveau(x)."));
    }
    if empty_count > 0 {
        summary_lines.push(format!("{empty_count} dossier(s) sans message en cache (peut être vide ou non synchronisé)."));
    }

    let structure = OrgMailboxStructure {
        total_folders,
        folders_with_messages,
        root_personal_count,
        max_depth,
        summary_lines,
        entries,
    };

    let mut proposals = Vec::new();
    if root_personal_count >= FLAT_ROOT_THRESHOLD {
        let refs: Vec<OrgThreadRef> = structure
            .entries
            .iter()
            .filter(|e| e.depth <= 1 && !e.is_system)
            .take(20)
            .map(|e| OrgThreadRef {
                thread_id: format!("mailbox:{}", e.mailbox),
                mailbox: e.mailbox.clone(),
                subject: "(dossier racine)".to_string(),
                ..Default::default()
            })
            .collect();
        let total = root_personal_count;
        proposals.push(OrgProposal {
            id: "flat-mailbox-tree".to_string(),
            kind: OrgProposalKind::FlatMailboxTree,
            section: "structure".to_string(),
            title: "Arbre de dossiers très plat".to_string(),
            rationale: format!(
                "{total} dossiers personnels à la racine — envisagez des sous-dossiers thématiques (ex. Perso/Projet, Archive/{{année}}/{{mois}})."
            ),
            thread_ids: refs.iter().map(|r| r.thread_id.clone()).collect(),
            thread_refs: refs,
            suggested_action: OrgSuggestedAction::Move,
            target_mailbox: None,
            confidence: 0.75,
            source: OrgProposalSource::Heuristic,
            total_count: total,
            applicable: false,
            llm_search_keywords: Vec::new(),
            explain_rule_id: Some("flat-mailbox-tree".to_string()),
            explain_signals: vec!["flat_tree".into(), "root_personal".into()],
            unsubscribe_links: Vec::new(),
        });
    }

    Ok((structure, proposals))
}
