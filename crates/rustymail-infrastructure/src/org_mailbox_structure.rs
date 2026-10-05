//! Analyse de la structure des dossiers IMAP (cache SQLite + imap_state).

use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{params, Connection};
use rustymail_domain::{
    OrgMailboxEntry, OrgMailboxStructure, OrgProposal, OrgProposalKind, OrgProposalSource,
    OrgSuggestedAction, OrgThreadRef,
};

use crate::mail_ops::is_trash_like_mailbox;
use crate::org_scan::{
    is_archive_like_mailbox, is_drafts_like_mailbox, is_inbox_like_mailbox,
    is_protected_mailbox_for_org_delete,
};

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
    let mut raw_names: BTreeSet<String> = BTreeSet::new();

    let mut stmt = conn
        .prepare("SELECT mailbox FROM imap_state WHERE account_id = ?1")
        .map_err(|e| e.to_string())?;
    for mb in stmt
        .query_map(params![account_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .flatten()
    {
        if !mb.trim().is_empty() {
            raw_names.insert(mb);
        }
    }

    let mut raw_counts: Vec<(String, usize, usize)> = Vec::new();
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
        if !row.0.trim().is_empty() {
            raw_names.insert(row.0.clone());
            raw_counts.push(row);
        }
    }

    // Même résolution de noms que la barre latérale (`sqlite_mailbox_sidebar_counts`) :
    // un alias entre `imap_state` et `messages.mailbox` ne doit pas produire un faux « vide ».
    let mut candidates =
        crate::mailbox_resolution_candidates(conn, account_id).map_err(|e| e.to_string())?;
    {
        let known: BTreeSet<String> = candidates.iter().cloned().collect();
        for n in &raw_names {
            if !known.contains(n) {
                candidates.push(n.clone());
            }
        }
    }
    let mut names: BTreeSet<String> = BTreeSet::new();
    for n in &raw_names {
        names.insert(crate::resolve_scoped_mailbox_with_candidates(
            n,
            &candidates,
        ));
    }
    let mut counts: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    for (mb, tc, mc) in raw_counts {
        let resolved = crate::resolve_scoped_mailbox_with_candidates(&mb, &candidates);
        let slot = counts.entry(resolved).or_insert((0, 0));
        slot.0 += tc;
        slot.1 += mc;
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
                // INBOX et dossiers protégés : 0 message en cache ≠ signal « vide ».
                is_empty: mc == 0 && !is_protected_mailbox_for_org_delete(mb),
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
        summary_lines.push(format!(
            "Profondeur maximale de l’arbre : {max_depth} niveau(x)."
        ));
    }
    if empty_count > 0 {
        summary_lines.push(format!(
            "{empty_count} dossier(s) non synchronisé(s) / sans cache local (pas forcément vides sur le serveur)."
        ));
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

const OVERVIEW_TOP_FOLDERS: usize = 12;
const OVERVIEW_UNCACHED_LIMIT: usize = 8;

/// Bloc de contexte LLM : `threadCount`, dossiers principaux (compteurs résolus comme la barre
/// latérale) et règle dure « jamais de boîte vide si threadCount > 0 ».
pub fn format_org_mailbox_overview(
    conn: &Connection,
    account_id: &str,
    structure: &OrgMailboxStructure,
    thread_count: usize,
) -> String {
    let names: Vec<String> = structure
        .entries
        .iter()
        .map(|e| e.mailbox.clone())
        .collect();
    let sidebar = crate::sidebar_counts_on_connection(conn, account_id, &names).unwrap_or_default();
    // (nom, fils, non lus) ; repli sur les compteurs de structure si la requête échoue.
    let mut folders: Vec<(String, usize, usize)> = if sidebar.is_empty() {
        structure
            .entries
            .iter()
            .map(|e| (e.mailbox.clone(), e.thread_count, 0))
            .collect()
    } else {
        sidebar
            .into_iter()
            .map(|(mb, unread, total)| (mb, total, unread))
            .collect()
    };
    folders.retain(|(_, total, _)| *total > 0);
    folders.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    let mut lines = vec![format!("threadCount={thread_count}")];
    if thread_count > 0 {
        lines.push(
            "HARD RULE: threadCount > 0 — the mailbox is NOT empty. Never state or imply that the mailbox, inbox or account is empty (« boîte vide »)."
                .into(),
        );
    }
    if folders.is_empty() {
        lines.push("top_folders: (aucun dossier avec fils en cache local)".into());
    } else {
        lines.push("top_folders (dossier | fils | non lus):".into());
        for (mb, total, unread) in folders.iter().take(OVERVIEW_TOP_FOLDERS) {
            lines.push(format!("- {mb} | {total} | {unread}"));
        }
    }
    let uncached: Vec<&str> = structure
        .entries
        .iter()
        .filter(|e| e.is_empty)
        .map(|e| e.mailbox.as_str())
        .take(OVERVIEW_UNCACHED_LIMIT)
        .collect();
    if !uncached.is_empty() {
        lines.push(format!(
            "non synchronisé / sans cache local (pas forcément vide sur le serveur) : {}",
            uncached.join(", ")
        ));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::open_sqlite_migrated;
    use tempfile::tempdir;

    fn seed(conn: &Connection) {
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
             VALUES ('a1', 'T', 't@example.com', 'h', 993, 'tls', 0, 'h', 465, 'tls', 0)",
            [],
        )
        .expect("account");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags, is_followed)
             VALUES ('t1', 'a1', 'Projets/Alpha', 'r', 'S', '', 0)",
            [],
        )
        .expect("thread");
        conn.execute(
            "INSERT INTO messages (id, thread_id, account_id, mailbox, imap_uid, sender_name, sender_email, subject, received_at, body, is_read, position)
             VALUES ('m1', 't1', 'a1', 'Projets/Alpha', 1, 'A', 'a@x.com', 'S', '2020-01-01T00:00:00Z', '', 0, 0)",
            [],
        )
        .expect("message");
    }

    fn insert_state(conn: &Connection, mailbox: &str) {
        conn.execute(
            "INSERT INTO imap_state (account_id, mailbox, last_uid) VALUES ('a1', ?1, 0)",
            params![mailbox],
        )
        .expect("imap_state");
    }

    #[test]
    fn inbox_and_protected_without_cache_are_not_empty() {
        let dir = tempdir().expect("tempdir");
        let conn = open_sqlite_migrated(&dir.path().join("s.db")).expect("migrate");
        seed(&conn);
        insert_state(&conn, "INBOX");
        insert_state(&conn, "Sent");
        insert_state(&conn, "Perso/Vide");
        let (structure, _) = analyze_mailbox_structure(&conn, "a1").expect("structure");
        let get = |n: &str| structure.entries.iter().find(|e| e.mailbox == n).expect(n);
        assert!(!get("INBOX").is_empty);
        assert!(!get("Sent").is_empty);
        assert!(get("Perso/Vide").is_empty);
        assert!(!get("Projets/Alpha").is_empty);
        assert!(structure
            .summary_lines
            .iter()
            .any(|l| l.contains("sans cache local")));
    }

    #[test]
    fn name_alias_does_not_create_false_empty() {
        let dir = tempdir().expect("tempdir");
        let conn = open_sqlite_migrated(&dir.path().join("s.db")).expect("migrate");
        seed(&conn);
        // imap_state expose le même dossier avec une casse / séparateur différent.
        insert_state(&conn, "Projets.Alpha");
        let (structure, _) = analyze_mailbox_structure(&conn, "a1").expect("structure");
        let alpha: Vec<_> = structure
            .entries
            .iter()
            .filter(|e| e.mailbox.to_ascii_lowercase().starts_with("projets"))
            .collect();
        assert!(alpha.iter().all(|e| !e.is_empty), "{alpha:?}");
    }

    #[test]
    fn overview_states_thread_count_and_hard_rule() {
        let dir = tempdir().expect("tempdir");
        let conn = open_sqlite_migrated(&dir.path().join("s.db")).expect("migrate");
        seed(&conn);
        insert_state(&conn, "Perso/Vide");
        let (structure, _) = analyze_mailbox_structure(&conn, "a1").expect("structure");
        let text = format_org_mailbox_overview(&conn, "a1", &structure, 1);
        assert!(text.contains("threadCount=1"));
        assert!(text.contains("NOT empty"));
        assert!(text.contains("Projets/Alpha | 1 | 1"));
        assert!(text.contains("non synchronisé / sans cache local"));
        assert!(text.contains("Perso/Vide"));
    }
}
