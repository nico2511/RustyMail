//! Scan heuristique pour le centre d'organisation.

use std::collections::HashSet;
use std::path::Path;

use rusqlite::{params, Connection};
use rustymail_domain::{
    OrgProposal, OrgProposalKind, OrgProposalSource, OrgScanLlmStatus, OrgScanReport, OrgScanStats,
    OrgSuggestedAction, OrgThreadRef,
};

use crate::app_prefs::{load_app_prefs, prefs_path_from_db_dir};
use crate::build_thread_from_row;
use crate::mail_ops::is_trash_like_mailbox;
use crate::newsletter::{list_newsletter_rules_connection, matches_newsletter_email};
use crate::open_sqlite_migrated;
use crate::org_consolidate::scan_duplicate_threads;
use crate::org_mailbox_structure::analyze_mailbox_structure;
use crate::org_retag::{effective_thread_mailbox, sender_is_transactional, thread_tags_stale};
use rustymail_llm::LlmEngine;
use rustymail_modules::ai_org_proposals::org_proposals_with_llm;

const SAMPLE_LIMIT: usize = 500;
const STALE_INBOX_DAYS: i64 = 90;

pub fn is_inbox_like_mailbox(name: &str) -> bool {
    let n = name.trim().to_ascii_lowercase();
    n == "inbox"
        || n.ends_with("/inbox")
        || n.contains("boîte de réception")
        || n == "boite de reception"
}

pub fn is_drafts_like_mailbox(name: &str) -> bool {
    let n = name.trim().to_ascii_lowercase();
    n.contains("draft") || n.contains("brouillon")
}

pub fn is_archive_like_mailbox(name: &str) -> bool {
    let n = name.trim().to_ascii_lowercase();
    n.contains("archive") || n.contains("all mail") || n.contains("tous les messages")
}

/// Dossiers exclus des propositions « à ranger » (corbeille, archives, brouillons, envoyés, spam).
pub fn org_exclude_from_range_proposals(name: &str) -> bool {
    if is_drafts_like_mailbox(name) || is_trash_like_mailbox(name) || is_archive_like_mailbox(name)
    {
        return true;
    }
    let l = name.trim().to_ascii_lowercase();
    l.contains("sent") || l.contains("envoy") || l.contains("spam") || l.contains("junk")
}

/// Dossiers qu’on ne doit jamais supprimer via Organiser (lot « dossiers vides »).
pub fn is_protected_mailbox_for_org_delete(name: &str) -> bool {
    if is_inbox_like_mailbox(name)
        || is_drafts_like_mailbox(name)
        || is_trash_like_mailbox(name)
        || is_archive_like_mailbox(name)
    {
        return true;
    }
    let l = name.trim().to_ascii_lowercase();
    l.contains("sent")
        || l.contains("envoy")
        || l.contains("spam")
        || l.contains("junk")
        || l.starts_with("[gmail]")
}

const LLM_CATALOG_LIMIT: usize = 120;

/// Catalogue texte des fils récents pour le prompt LLM + ensemble d’ids valides.
pub fn build_org_llm_thread_catalog(
    conn: &Connection,
    account_id: &str,
    limit: usize,
) -> Result<(String, HashSet<String>), String> {
    let cap = limit.min(200).max(1);
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.mailbox, t.subject,
                    COALESCE(
                      (SELECT m.sender_email FROM messages m
                       WHERE m.thread_id = t.id AND m.account_id = t.account_id
                       ORDER BY m.received_at DESC, m.position DESC LIMIT 1),
                      ''
                    ) AS sender
             FROM threads t
             WHERE t.account_id = ?1
             ORDER BY (
               SELECT MAX(m2.received_at) FROM messages m2
               WHERE m2.thread_id = t.id AND m2.account_id = t.account_id
             ) DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let mut lines = Vec::new();
    let mut ids = HashSet::new();
    let rows = stmt
        .query_map(params![account_id, cap as i64], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        let (id, mailbox, subject, sender) = row;
        if id.trim().is_empty() {
            continue;
        }
        if org_exclude_from_range_proposals(&mailbox) {
            continue;
        }
        ids.insert(id.clone());
        let subj = subject.replace(';', ",").replace('\n', " ");
        let snd = sender.replace(';', ",").replace('\n', " ");
        let mb = mailbox.replace(';', ",");
        lines.push(format!("{id};{mb};{snd};{subj}"));
    }
    Ok((lines.join("\n"), ids))
}

fn search_threads_by_keywords(
    conn: &Connection,
    account_id: &str,
    keywords: &[String],
    limit: usize,
) -> Vec<OrgThreadRef> {
    if keywords.is_empty() {
        return Vec::new();
    }
    let candidates = preload_keyword_thread_candidates(conn, account_id).unwrap_or_default();
    match_keyword_rule(&candidates, keywords, limit)
}

fn infer_llm_search_keywords(title: &str, rationale: &str, explicit: &[String]) -> Vec<String> {
    let mut out: Vec<String> = explicit
        .iter()
        .map(|k| k.trim().to_ascii_lowercase())
        .filter(|k| k.len() >= 2)
        .collect();
    let blob = format!("{title} {rationale}").to_ascii_lowercase();
    for hint in [
        "facture",
        "factures",
        "invoice",
        "invoices",
        "paiement",
        "payment",
        "billing",
        "facturation",
        "reçu",
        "recu",
        "receipt",
        "échéance",
        "echeance",
        "transaction",
        "transactional",
    ] {
        if blob.contains(hint) && !out.iter().any(|k| k == hint) {
            out.push(hint.to_string());
        }
    }
    out.truncate(8);
    out
}

fn thread_exists(conn: &Connection, account_id: &str, thread_id: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM threads WHERE id = ?1 AND account_id = ?2 LIMIT 1",
        params![thread_id, account_id],
        |_| Ok(()),
    )
    .is_ok()
}

/// Résout les fils des cartes LLM (ids du modèle, mots-clés, enrichissement SQLite).
pub fn hydrate_llm_proposals(
    conn: &Connection,
    account_id: &str,
    valid_thread_ids: &HashSet<String>,
    proposals: Vec<OrgProposal>,
) -> Vec<OrgProposal> {
    let mut out = Vec::new();
    for mut proposal in proposals {
        if proposal.source != OrgProposalSource::Llm {
            out.push(proposal);
            continue;
        }
        let keywords = std::mem::take(&mut proposal.llm_search_keywords);
        let mut refs: Vec<OrgThreadRef> = proposal
            .thread_refs
            .into_iter()
            .filter(|r| valid_thread_ids.contains(r.thread_id.as_str()))
            .filter(|r| thread_exists(conn, account_id, &r.thread_id))
            .collect();
        if refs.is_empty() {
            let search_kws =
                infer_llm_search_keywords(&proposal.title, &proposal.rationale, &keywords);
            refs = search_threads_by_keywords(conn, account_id, &search_kws, SAMPLE_LIMIT);
        }
        refs = refs
            .into_iter()
            .map(|r| enrich_thread_ref(conn, account_id, r))
            .filter(|r| thread_exists(conn, account_id, &r.thread_id))
            .collect();
        if refs.is_empty() {
            continue;
        }
        proposal.thread_refs = refs;
        proposal.total_count = proposal.thread_refs.len();
        proposal.thread_ids = proposal
            .thread_refs
            .iter()
            .map(|r| r.thread_id.clone())
            .collect();
        proposal.llm_search_keywords.clear();
        out.push(proposal);
    }
    out
}

pub fn enrich_org_report_llm_refs(
    path: &Path,
    account_id: &str,
    report: &mut OrgScanReport,
) -> Result<(), String> {
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    for proposal in &mut report.proposals {
        if proposal.source != OrgProposalSource::Llm {
            continue;
        }
        proposal.thread_refs = proposal
            .thread_refs
            .drain(..)
            .filter(|r| thread_exists(&conn, account_id, &r.thread_id))
            .filter(|r| !org_exclude_from_range_proposals(&r.mailbox))
            .map(|r| enrich_thread_ref(&conn, account_id, r))
            .collect();
        proposal.total_count = proposal.thread_refs.len();
        proposal.thread_ids = proposal
            .thread_refs
            .iter()
            .map(|r| r.thread_id.clone())
            .collect();
    }
    report
        .proposals
        .retain(|p| p.source != OrgProposalSource::Llm || !p.thread_refs.is_empty());
    Ok(())
}

/// Propositions LLM rattachées aux fils réels du compte (catalogue + recherche mots-clés).
pub fn org_llm_proposals_for_account(
    db_path: &Path,
    account_id: &str,
    heuristic_proposal_count: usize,
    engine: &mut LlmEngine,
    output_language: &str,
) -> Result<Vec<OrgProposal>, String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let (catalog, valid_ids) = build_org_llm_thread_catalog(&conn, account_id, LLM_CATALOG_LIMIT)?;
    if catalog.is_empty() {
        return Ok(Vec::new());
    }
    let raw = org_proposals_with_llm(
        engine,
        account_id,
        &catalog,
        heuristic_proposal_count,
        &valid_ids,
        output_language,
    )?;
    Ok(hydrate_llm_proposals(&conn, account_id, &valid_ids, raw))
}

pub fn org_scan_account(
    path: &Path,
    account_id: &str,
    _include_llm: bool,
) -> Result<OrgScanReport, String> {
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let prefs_path = prefs_path_from_db_dir(path.parent().unwrap_or(path));
    let prefs = load_app_prefs(&prefs_path);
    let rules = list_newsletter_rules_connection(&conn).map_err(|e| e.to_string())?;

    let (mailbox_structure, structure_proposals) = analyze_mailbox_structure(&conn, account_id)?;

    let mut proposals = Vec::new();
    proposals.extend(structure_proposals);
    proposals.extend(scan_unread_outside_inbox(&conn, account_id)?);
    proposals.extend(scan_stale_inbox_read(&conn, account_id)?);
    proposals.extend(scan_unsubscribe(&conn, account_id)?);
    proposals.extend(scan_newsletter_unfiled(&conn, account_id, &rules)?);
    proposals.extend(scan_transactional_notifications(&conn, account_id)?);
    proposals.extend(scan_trash_candidates(&conn, account_id, &rules)?);
    proposals.extend(scan_keyword_clusters(&conn, account_id, &prefs)?);
    proposals.extend(scan_stale_tags(&conn, account_id)?);
    proposals.extend(scan_empty_mailboxes(&conn, account_id)?);
    proposals.extend(scan_duplicate_threads(&conn, account_id)?);

    let thread_count: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM threads WHERE account_id = ?1",
            params![account_id],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as usize;
    Ok(OrgScanReport {
        proposals,
        stats: OrgScanStats {
            thread_count,
            mailbox_count: mailbox_structure.total_folders,
        },
        mailbox_structure,
        llm_status: OrgScanLlmStatus::default(),
    })
}

pub fn enrich_thread_ref(conn: &Connection, account_id: &str, mut r: OrgThreadRef) -> OrgThreadRef {
    if r.thread_id.starts_with("mailbox:") {
        return r;
    }
    let row = conn.query_row(
        "SELECT subject, tags, COALESCE(is_followed, 0), mailbox FROM threads
         WHERE id = ?1 AND account_id = ?2 LIMIT 1",
        params![r.thread_id, account_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)? != 0,
                row.get::<_, String>(3)?,
            ))
        },
    );
    if let Ok((subject, tags, followed, mbox)) = row {
        if let Ok(thread) =
            build_thread_from_row(conn, r.thread_id.clone(), subject, tags, followed)
        {
            let mb = if r.mailbox.trim().is_empty() {
                mbox
            } else {
                r.mailbox.clone()
            };
            let item = thread.list_item(mb);
            r.subject = item.subject;
            r.mailbox = item.mailbox;
            r.from_label = item.participants.first().cloned();
            r.preview = Some(item.preview);
            r.last_activity = Some(item.last_activity);
            r.unread = Some(item.unread);
        }
    }
    if r.sender_email.as_ref().is_none_or(|s| s.trim().is_empty()) {
        r.sender_email = conn
            .query_row(
                "SELECT sender_email FROM messages WHERE thread_id = ?1 AND account_id = ?2
                 ORDER BY received_at DESC, position DESC LIMIT 1",
                params![r.thread_id, account_id],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .filter(|s| !s.trim().is_empty());
    }

    if r.unsubscribe_links.is_empty() {
        let unsub_json: Option<String> = conn
            .query_row(
                "SELECT unsubscribe_urls FROM messages
                 WHERE thread_id = ?1 AND account_id = ?2 AND COALESCE(unsubscribe_urls, '') != ''
                 ORDER BY received_at DESC, position DESC LIMIT 1",
                params![r.thread_id, account_id],
                |row| row.get(0),
            )
            .ok();
        let urls =
            crate::unsubscribe_detect::parse_and_sort_unsubscribe_urls_json(unsub_json.as_deref());
        r.unsubscribe_links = urls.into_iter().take(6).collect();
    }
    r
}

fn make_proposal(
    conn: &Connection,
    account_id: &str,
    id: &str,
    kind: OrgProposalKind,
    section: &str,
    title: &str,
    rationale: &str,
    refs: Vec<OrgThreadRef>,
    action: OrgSuggestedAction,
    target: Option<String>,
    explain_signals: Vec<String>,
) -> OrgProposal {
    let total = refs.len();
    let sample: Vec<_> = refs
        .into_iter()
        .take(20)
        .map(|r| enrich_thread_ref(conn, account_id, r))
        .collect();
    OrgProposal {
        id: id.to_string(),
        kind,
        section: section.to_string(),
        title: title.to_string(),
        rationale: rationale.to_string(),
        thread_ids: sample.iter().map(|r| r.thread_id.clone()).collect(),
        thread_refs: sample,
        suggested_action: action,
        target_mailbox: target,
        confidence: 0.85,
        source: OrgProposalSource::Heuristic,
        total_count: total,
        applicable: true,
        llm_search_keywords: Vec::new(),
        explain_rule_id: Some(id.to_string()),
        explain_signals,
        unsubscribe_links: Vec::new(),
    }
}

/// Une ligne fil + texte de recherche (sujet + expéditeur), dédupliquée par fil.
struct KeywordThreadCandidate {
    thread_id: String,
    mailbox: String,
    subject: String,
    search_blob: String,
}

fn preload_keyword_thread_candidates(
    conn: &Connection,
    account_id: &str,
) -> Result<Vec<KeywordThreadCandidate>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.mailbox, t.subject, m.sender_email FROM threads t
             JOIN messages m ON m.thread_id = t.id AND m.account_id = t.account_id
             WHERE t.account_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for row in rows.flatten() {
        if !seen.insert(row.0.clone()) {
            continue;
        }
        if org_exclude_from_range_proposals(&row.1) {
            continue;
        }
        let search_blob = format!("{} {}", row.2, row.3).to_ascii_lowercase();
        out.push(KeywordThreadCandidate {
            thread_id: row.0,
            mailbox: row.1,
            subject: row.2,
            search_blob,
        });
    }
    Ok(out)
}

fn normalized_keywords(keywords: &[String]) -> Vec<String> {
    keywords
        .iter()
        .map(|k| k.trim().to_ascii_lowercase())
        .filter(|k| !k.is_empty())
        .collect()
}

fn match_keyword_rule(
    candidates: &[KeywordThreadCandidate],
    keywords: &[String],
    limit: usize,
) -> Vec<OrgThreadRef> {
    let kws = normalized_keywords(keywords);
    if kws.is_empty() {
        return Vec::new();
    }
    let mut refs = Vec::new();
    for c in candidates {
        if !kws.iter().any(|k| c.search_blob.contains(k.as_str())) {
            continue;
        }
        refs.push(OrgThreadRef {
            thread_id: c.thread_id.clone(),
            mailbox: c.mailbox.clone(),
            subject: c.subject.clone(),
            ..Default::default()
        });
        if refs.len() >= limit {
            break;
        }
    }
    refs
}

fn scan_unread_outside_inbox(
    conn: &Connection,
    account_id: &str,
) -> Result<Vec<OrgProposal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.mailbox, t.subject FROM threads t
             INNER JOIN messages m ON m.thread_id = t.id AND m.account_id = t.account_id AND m.is_read = 0
             WHERE t.account_id = ?1
             GROUP BY t.id",
        )
        .map_err(|e| e.to_string())?;
    let mut refs = Vec::new();
    let rows = stmt
        .query_map(params![account_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        let mb = &row.1;
        if is_inbox_like_mailbox(mb) || is_drafts_like_mailbox(mb) || is_trash_like_mailbox(mb) {
            continue;
        }
        refs.push(OrgThreadRef {
            thread_id: row.0,
            mailbox: row.1,
            subject: row.2,
            ..Default::default()
        });
        if refs.len() >= SAMPLE_LIMIT {
            break;
        }
    }
    if refs.is_empty() {
        return Ok(Vec::new());
    }
    Ok(vec![make_proposal(
        conn,
        account_id,
        "unread-outside-inbox",
        OrgProposalKind::UnreadOutsideInbox,
        "range",
        "Non lus hors boîte de réception",
        "Messages non lus dans archives ou dossiers personnels — à relire ou archiver.",
        refs,
        OrgSuggestedAction::MarkRead,
        None,
        vec!["unread".into(), "outside_inbox".into()],
    )])
}

fn scan_stale_inbox_read(conn: &Connection, account_id: &str) -> Result<Vec<OrgProposal>, String> {
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(STALE_INBOX_DAYS))
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.mailbox, t.subject FROM threads t
             WHERE t.account_id = ?1 AND COALESCE(t.is_followed, 0) = 0
             AND EXISTS (
               SELECT 1 FROM messages m
               WHERE m.thread_id = t.id AND m.account_id = t.account_id
                 AND m.is_read = 1 AND m.received_at < ?2
             )
             AND NOT EXISTS (
               SELECT 1 FROM messages m2
               WHERE m2.thread_id = t.id AND m2.account_id = t.account_id AND m2.is_read = 0
             )",
        )
        .map_err(|e| e.to_string())?;
    let mut refs = Vec::new();
    let rows = stmt
        .query_map(params![account_id, cutoff], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        if !is_inbox_like_mailbox(&row.1) {
            continue;
        }
        refs.push(OrgThreadRef {
            thread_id: row.0,
            mailbox: row.1,
            subject: row.2,
            ..Default::default()
        });
        if refs.len() >= SAMPLE_LIMIT {
            break;
        }
    }
    if refs.is_empty() {
        return Ok(Vec::new());
    }
    Ok(vec![make_proposal(
        conn,
        account_id,
        "stale-inbox-read",
        OrgProposalKind::StaleInboxRead,
        "range",
        "Inbox : lus et anciens",
        &format!("Fils lus dans l'Inbox depuis plus de {STALE_INBOX_DAYS} jours, non suivis — candidats à l'archivage."),
        refs,
        OrgSuggestedAction::Archive,
        None,
        vec![
            "inbox".into(),
            "read".into(),
            format!("older_than_{STALE_INBOX_DAYS}d"),
            "not_followed".into(),
        ],
    )])
}

fn scan_unsubscribe(conn: &Connection, account_id: &str) -> Result<Vec<OrgProposal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.mailbox, t.subject, m.sender_email, m.unsubscribe_urls
             FROM threads t
             JOIN messages m ON m.thread_id = t.id AND m.account_id = t.account_id
             WHERE t.account_id = ?1 AND t.tags LIKE '%state:unsubscribe%'
             ORDER BY m.received_at DESC, m.position DESC",
        )
        .map_err(|e| e.to_string())?;
    let mut marketing = Vec::new();
    let mut unsub_links: Vec<String> = Vec::new();
    let mut seen = HashSet::new();
    let rows = stmt
        .query_map(params![account_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        if org_exclude_from_range_proposals(&row.1) {
            continue;
        }
        let subject = row.2.clone();
        let sender = row.3.clone();
        if sender_is_transactional(&sender, &subject) {
            continue;
        }
        let thread_urls =
            crate::unsubscribe_detect::parse_and_sort_unsubscribe_urls_json(row.4.as_deref());
        if thread_urls.is_empty() {
            continue;
        }
        for link in thread_urls {
            if unsub_links.len() >= 24 {
                break;
            }
            if !unsub_links.iter().any(|e| e == &link) {
                unsub_links.push(link);
            }
        }
        if !seen.insert(row.0.clone()) {
            continue;
        }
        let r = OrgThreadRef {
            thread_id: row.0,
            mailbox: row.1,
            subject: subject.clone(),
            sender_email: Some(sender.clone()),
            ..Default::default()
        };
        if marketing.len() < SAMPLE_LIMIT {
            marketing.push(r);
        }
    }
    let mut out = Vec::new();
    if !marketing.is_empty() {
        let mut p = make_proposal(
            conn,
            account_id,
            "unsubscribe-marketing",
            OrgProposalKind::UnsubscribeNewsletter,
            "range",
            "Newsletters / marketing désinscriptibles",
            "Liens de désinscription indexés à la sync (List-Unsubscribe ou lien HTML) — hors factures et alertes automatiques.",
            marketing,
            OrgSuggestedAction::Trash,
            None,
            vec![
                "tag:unsubscribe".into(),
                "marketing".into(),
                "indexed_urls".into(),
            ],
        );
        crate::unsubscribe_detect::sort_unsubscribe_urls(&mut unsub_links);
        p.unsubscribe_links = unsub_links;
        out.push(p);
    }
    Ok(out)
}

fn scan_newsletter_unfiled(
    conn: &Connection,
    account_id: &str,
    rules: &[crate::newsletter::NewsletterRule],
) -> Result<Vec<OrgProposal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.mailbox, t.subject, m.sender_email, t.tags FROM threads t
             JOIN messages m ON m.thread_id = t.id AND m.account_id = t.account_id
             WHERE t.account_id = ?1 AND t.tags LIKE '%kind:newsletter%'
             ORDER BY m.received_at DESC, m.position DESC",
        )
        .map_err(|e| e.to_string())?;
    let mut refs = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let rows = stmt
        .query_map(params![account_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        if !seen.insert(row.0.clone()) {
            continue;
        }
        if org_exclude_from_range_proposals(&row.1) {
            continue;
        }
        if sender_is_transactional(&row.3, &row.2) {
            continue;
        }
        // Réduit les faux positifs « newsletter » (factures / relevés) : exige un signal ESP ou un vrai tag unsub.
        let tags_lc = row.4.to_ascii_lowercase();
        if !tags_lc.contains("state:unsubscribe") && !matches_newsletter_email(&row.3, rules) {
            continue;
        }
        let mb = row.1.to_ascii_lowercase();
        if mb.contains("newsletter") {
            continue;
        }
        refs.push(OrgThreadRef {
            thread_id: row.0,
            mailbox: row.1,
            subject: row.2,
            ..Default::default()
        });
        if refs.len() >= SAMPLE_LIMIT {
            break;
        }
    }
    if refs.is_empty() {
        return Ok(Vec::new());
    }
    Ok(vec![make_proposal(
        conn,
        account_id,
        "newsletter-unfiled",
        OrgProposalKind::NewsletterRuleUnfiled,
        "range",
        "Newsletters / marketing hors dossier dédié",
        "Fils tagués newsletter (règles ESP ou bouton A), encore dans l’Inbox ou un dossier perso — pas les archives ni la corbeille.",
        refs,
        OrgSuggestedAction::Move,
        Some("Newsletters".to_string()),
        vec!["kind:newsletter".into(), "not_in_newsletter_folder".into()],
    )])
}

fn scan_transactional_notifications(
    conn: &Connection,
    account_id: &str,
) -> Result<Vec<OrgProposal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.mailbox, t.subject, m.sender_email FROM threads t
             JOIN messages m ON m.thread_id = t.id AND m.account_id = t.account_id
             WHERE t.account_id = ?1
             ORDER BY m.received_at DESC, m.position DESC",
        )
        .map_err(|e| e.to_string())?;
    let mut refs = Vec::new();
    let mut seen = HashSet::new();
    let rows = stmt
        .query_map(params![account_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        if !seen.insert(row.0.clone()) {
            continue;
        }
        if !sender_is_transactional(&row.3, &row.2) {
            continue;
        }
        if is_trash_like_mailbox(&row.1) || is_archive_like_mailbox(&row.1) {
            continue;
        }
        if !is_inbox_like_mailbox(&row.1) {
            continue;
        }
        refs.push(OrgThreadRef {
            thread_id: row.0,
            mailbox: row.1,
            subject: row.2,
            sender_email: Some(row.3),
            ..Default::default()
        });
        if refs.len() >= SAMPLE_LIMIT {
            break;
        }
    }
    if refs.is_empty() {
        return Ok(Vec::new());
    }
    Ok(vec![make_proposal(
        conn,
        account_id,
        "transactional-inbox",
        OrgProposalKind::TransactionalNotification,
        "range",
        "Notifications transactionnelles (Inbox)",
        "Factures, commandes, reçus ou alertes automatiques dans l’Inbox — à archiver (pas de désinscription requise).",
        refs,
        OrgSuggestedAction::Archive,
        None,
        vec!["transactional".into(), "inbox".into()],
    )])
}

fn scan_trash_candidates(
    conn: &Connection,
    account_id: &str,
    rules: &[crate::newsletter::NewsletterRule],
) -> Result<Vec<OrgProposal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.mailbox, t.subject, m.sender_email FROM threads t
             JOIN messages m ON m.thread_id = t.id AND m.account_id = t.account_id
             WHERE t.account_id = ?1
             GROUP BY t.id HAVING COUNT(m.id) = 1",
        )
        .map_err(|e| e.to_string())?;
    let mut refs = Vec::new();
    let rows = stmt
        .query_map(params![account_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        if org_exclude_from_range_proposals(&row.1) {
            continue;
        }
        if sender_is_transactional(&row.3, &row.2) {
            continue;
        }
        if matches_newsletter_email(&row.3, rules) {
            let sub = row.2.trim();
            if sub.is_empty() || sub == "(no subject)" {
                refs.push(OrgThreadRef {
                    thread_id: row.0,
                    mailbox: row.1,
                    subject: row.2,
                    ..Default::default()
                });
            }
        }
        if refs.len() >= SAMPLE_LIMIT {
            break;
        }
    }
    if refs.is_empty() {
        return Ok(Vec::new());
    }
    Ok(vec![make_proposal(
        conn,
        account_id,
        "bulk-trash-candidates",
        OrgProposalKind::BulkTrashCandidate,
        "range",
        "Candidats corbeille (newsletters vides)",
        "Messages uniques newsletter sans sujet — corbeille avec double confirmation.",
        refs,
        OrgSuggestedAction::Trash,
        None,
        vec![
            "single_message".into(),
            "newsletter".into(),
            "empty_subject".into(),
        ],
    )])
}

fn scan_keyword_clusters(
    conn: &Connection,
    account_id: &str,
    prefs: &crate::app_prefs::AppPrefs,
) -> Result<Vec<OrgProposal>, String> {
    let rules = &prefs.general.org_keyword_rules;
    if rules.is_empty() {
        return Ok(Vec::new());
    }
    let candidates = preload_keyword_thread_candidates(conn, account_id)?;
    if candidates.is_empty() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for (idx, rule) in rules.iter().enumerate() {
        let refs = match_keyword_rule(&candidates, &rule.keywords, SAMPLE_LIMIT);
        if refs.is_empty() {
            continue;
        }
        let kws = normalized_keywords(&rule.keywords);
        let signal_kw = kws.iter().take(4).cloned().collect::<Vec<_>>().join(", ");
        let signals = if signal_kw.is_empty() {
            vec!["custom_keywords".into()]
        } else {
            vec![format!("keywords: {signal_kw}")]
        };
        out.push(make_proposal(
            conn,
            account_id,
            &format!("keyword-{idx}"),
            OrgProposalKind::CustomKeywordCluster,
            "range",
            &format!("Cluster : {}", rule.label),
            "Fils correspondant à vos mots-clés personnalisés.",
            refs,
            if rule.target_mailbox.is_some() {
                OrgSuggestedAction::Move
            } else {
                OrgSuggestedAction::Archive
            },
            rule.target_mailbox.clone(),
            signals,
        ));
    }
    Ok(out)
}

fn scan_stale_tags(conn: &Connection, account_id: &str) -> Result<Vec<OrgProposal>, String> {
    let mut stmt = conn
        .prepare("SELECT id, mailbox, subject, tags FROM threads WHERE account_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut refs = Vec::new();
    let rows = stmt
        .query_map(params![account_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        let effective_mb = effective_thread_mailbox(conn, account_id, &row.0, &row.1);
        if is_trash_like_mailbox(&effective_mb) {
            continue;
        }
        if thread_tags_stale(&effective_mb, &row.3) {
            refs.push(OrgThreadRef {
                thread_id: row.0,
                mailbox: effective_mb,
                subject: row.2,
                ..Default::default()
            });
        }
        if refs.len() >= SAMPLE_LIMIT {
            break;
        }
    }
    if refs.is_empty() {
        return Ok(Vec::new());
    }
    Ok(vec![make_proposal(
        conn,
        account_id,
        "stale-tags",
        OrgProposalKind::StaleTags,
        "consolidate",
        "Tags à normaliser",
        "Tags kind: incohérents avec le dossier actuel — recalcul recommandé.",
        refs,
        OrgSuggestedAction::Retag,
        None,
        vec!["stale_kind_tag".into()],
    )])
}

fn scan_empty_mailboxes(conn: &Connection, account_id: &str) -> Result<Vec<OrgProposal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.mailbox FROM imap_state s WHERE s.account_id = ?1
             AND NOT EXISTS (
               SELECT 1 FROM messages m WHERE m.account_id = ?1 AND m.mailbox = s.mailbox
             )
             AND NOT EXISTS (
               SELECT 1 FROM threads t WHERE t.account_id = ?1 AND t.mailbox = s.mailbox
             )",
        )
        .map_err(|e| e.to_string())?;
    let mut refs = Vec::new();
    let rows = stmt
        .query_map(params![account_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    for mb in rows.flatten() {
        if is_protected_mailbox_for_org_delete(&mb) {
            continue;
        }
        refs.push(OrgThreadRef {
            thread_id: format!("mailbox:{mb}"),
            mailbox: mb,
            subject: "(dossier vide)".to_string(),
            ..Default::default()
        });
    }
    if refs.is_empty() {
        return Ok(Vec::new());
    }
    Ok(vec![make_proposal(
        conn,
        account_id,
        "empty-mailboxes",
        OrgProposalKind::EmptyMailbox,
        "structure",
        "Dossiers vides",
        "Boîtes IMAP sans message en cache local.",
        refs,
        OrgSuggestedAction::DeleteMailbox,
        None,
        vec!["empty_mailbox".into(), "imap_state".into()],
    )])
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};
    use rusqlite::params;
    use rustymail_domain::OrgKeywordRule;
    use tempfile::tempdir;

    use crate::app_prefs::AppPrefs;
    use crate::open_sqlite_migrated;

    fn insert_account(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
             VALUES (?1, 'Test', 't@example.com', 'h', 993, 'tls', 0, 'h', 465, 'tls', 0)",
            params![id],
        )
        .expect("account");
    }

    fn insert_stale_inbox_thread(
        conn: &Connection,
        account_id: &str,
        thread_id: &str,
        received_at: &str,
    ) {
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags, is_followed)
             VALUES (?1, ?2, 'INBOX', 'm1', 'Old read', '', 0)",
            params![thread_id, account_id],
        )
        .expect("thread");
        conn.execute(
            "INSERT INTO messages (id, thread_id, account_id, mailbox, imap_uid, sender_name, sender_email, subject, received_at, body, is_read, position)
             VALUES (?1, ?2, ?3, 'INBOX', 1, 'A', 'a@x.com', 'Hi', ?4, '', 1, 0)",
            params![format!("msg-{thread_id}"), thread_id, account_id, received_at],
        )
        .expect("message");
    }

    #[test]
    fn stale_inbox_read_isolated_per_account() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("org.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        insert_account(&conn, "acc-a");
        insert_account(&conn, "acc-b");
        let old =
            (Utc::now() - Duration::days(120)).to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        insert_stale_inbox_thread(&conn, "acc-a", "t-only-a", &old);
        drop(conn);

        let report_b = org_scan_account(&path, "acc-b", false).expect("scan b");
        if let Some(p) = report_b
            .proposals
            .iter()
            .find(|p| p.id == "stale-inbox-read")
        {
            assert!(
                !p.thread_refs.iter().any(|r| r.thread_id == "t-only-a"),
                "acc-b must not see acc-a thread"
            );
        }

        let report_a = org_scan_account(&path, "acc-a", false).expect("scan a");
        let stale = report_a
            .proposals
            .iter()
            .find(|p| p.id == "stale-inbox-read")
            .expect("stale card for acc-a");
        assert!(
            stale.thread_refs.iter().any(|r| r.thread_id == "t-only-a"),
            "acc-a should list stale inbox thread"
        );
        assert_eq!(stale.explain_rule_id.as_deref(), Some("stale-inbox-read"));
        assert!(stale.explain_signals.iter().any(|s| s.contains("inbox")));
    }

    #[test]
    fn keyword_clusters_match_all_rules_one_db_pass() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("org.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        insert_account(&conn, "acc-a");
        for (i, (tid, subj)) in [("t-fact", "Facture janvier"), ("t-promo", "Promo été")]
            .into_iter()
            .enumerate()
        {
            conn.execute(
                "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags)
                 VALUES (?1, 'acc-a', 'INBOX', 'm1', ?2, '')",
                params![tid, subj],
            )
            .expect("thread");
            conn.execute(
                "INSERT INTO messages (id, thread_id, account_id, mailbox, imap_uid, sender_name, sender_email, subject, received_at, body, is_read, position)
                 VALUES (?1, ?1, 'acc-a', 'INBOX', ?3, 'A', 'a@x.com', ?2, '2026-01-01', '', 1, 0)",
                params![tid, subj, (i as i64) + 1],
            )
            .expect("message");
        }
        let prefs = AppPrefs {
            general: crate::app_prefs::GeneralPrefs {
                org_keyword_rules: vec![
                    OrgKeywordRule {
                        label: "Factures".into(),
                        keywords: vec!["facture".into()],
                        target_mailbox: None,
                    },
                    OrgKeywordRule {
                        label: "Promos".into(),
                        keywords: vec!["promo".into()],
                        target_mailbox: None,
                    },
                ],
                ..Default::default()
            },
            ..Default::default()
        };
        let proposals = scan_keyword_clusters(&conn, "acc-a", &prefs).expect("scan kw");
        assert_eq!(proposals.len(), 2);
        let ids: HashSet<_> = proposals
            .iter()
            .flat_map(|p| p.thread_refs.iter().map(|r| r.thread_id.as_str()))
            .collect();
        assert!(ids.contains("t-fact"));
        assert!(ids.contains("t-promo"));
        assert!(proposals
            .iter()
            .all(|p| p.explain_signals.iter().any(|s| s.starts_with("keywords:"))));
    }
}
