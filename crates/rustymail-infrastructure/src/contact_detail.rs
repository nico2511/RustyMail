//! Fiche contact : agrégats mails, expéditeur auto, entités extraites.

use std::collections::HashMap;
use std::path::Path;

use rusqlite::{params, Connection};
use rustymail_domain::EntityKind;
use serde::Serialize;

use crate::address_contacts::{map_contact_row, row_by_email, AddressContactRow};
use crate::email_util::normalize_email;
use crate::newsletter::{
    host_of_email, list_newsletter_rules_connection, matches_newsletter_email, NewsletterRule,
};
use crate::open_sqlite_migrated;
use rustymail_modules::ai_extraction::extract_entities;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactThreadSnippet {
    pub thread_id: String,
    pub subject: String,
    pub last_activity: String,
    pub message_count: u32,
    pub unread: bool,
    pub is_newsletter_thread: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactEntitySnippet {
    pub kind: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactDetailDto {
    pub account_id: String,
    pub email: String,
    pub display_name: String,
    pub message_count: u32,
    pub last_seen_at: String,
    pub last_source: String,
    pub is_favorite: bool,
    pub notes: String,
    pub source: String,
    pub updated_at: String,
    pub domain: String,
    pub auto_sender_kind: String,
    pub auto_thread_ratio: f32,
    pub matched_rule_labels: Vec<String>,
    pub recent_threads: Vec<ContactThreadSnippet>,
    pub extracted_entities: Vec<ContactEntitySnippet>,
    pub phones: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressContactListRow {
    pub row: AddressContactRow,
    pub auto_sender_kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAddressContactsScopedResult {
    pub items: Vec<AddressContactListRow>,
    pub total: u32,
}

fn rule_labels_for_email(email: &str, rules: &[NewsletterRule]) -> Vec<String> {
    let email = email.trim().to_ascii_lowercase();
    let Some(host) = host_of_email(&email) else {
        return Vec::new();
    };
    let local = email.split('@').next().unwrap_or("");
    let mut out = Vec::new();
    for r in rules {
        if crate::newsletter::host_matches_suffix(&host, &r.domain) {
            let lp = r.local_part.trim();
            if lp == "*" || lp.eq_ignore_ascii_case(local) {
                out.push(if lp == "*" {
                    format!("*.{}", r.domain.trim())
                } else {
                    format!("{}@{}", lp, r.domain.trim())
                });
            }
        }
    }
    out.sort();
    out.dedup();
    out
}

fn auto_kind_from_ratio(rule_match: bool, newsletter_threads: u32, total_threads: u32) -> String {
    if rule_match && total_threads == 0 {
        return "auto".to_string();
    }
    if total_threads == 0 {
        return "human".to_string();
    }
    let ratio = newsletter_threads as f32 / total_threads as f32;
    if ratio >= 0.85 {
        "auto".to_string()
    } else if ratio <= 0.15 {
        "human".to_string()
    } else {
        "mixed".to_string()
    }
}

fn thread_newsletter_from_messages(
    conn: &Connection,
    thread_id: &str,
    account_emails: &[String],
    rules: &[NewsletterRule],
) -> bool {
    let mut stmt = match conn.prepare(
        "
        SELECT sender_email FROM messages
        WHERE thread_id = ?1
        ORDER BY received_at DESC
        LIMIT 40
        ",
    ) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let emails: Vec<String> = stmt
        .query_map(params![thread_id], |r| r.get::<_, String>(0))
        .ok()
        .map(|rows| rows.filter_map(|x| x.ok()).collect())
        .unwrap_or_default();
    for se in emails {
        let s = se.trim().to_ascii_lowercase();
        if account_emails.iter().any(|a| a == &s) {
            continue;
        }
        return matches_newsletter_email(&s, rules);
    }
    false
}

fn account_emails_for_scope(conn: &Connection, account_id: &str, global: bool) -> Vec<String> {
    if global {
        conn.prepare("SELECT lower(trim(email)) FROM accounts WHERE email != ''")
            .ok()
            .map(|mut s| {
                s.query_map([], |r| r.get(0))
                    .ok()
                    .map(|rows| rows.filter_map(|r| r.ok()).collect())
                    .unwrap_or_default()
            })
            .unwrap_or_default()
    } else {
        conn.query_row(
            "SELECT lower(trim(email)) FROM accounts WHERE id = ?1",
            params![account_id],
            |r| r.get(0),
        )
        .ok()
        .map(|e: String| vec![e])
        .unwrap_or_default()
    }
}

fn merge_contact_row_global(conn: &Connection, email: &str) -> Option<AddressContactRow> {
    let mut stmt = conn
        .prepare(
            "
            SELECT account_id, email, display_name, message_count, last_seen_at, last_source,
                   is_favorite, notes, source, updated_at
            FROM address_contacts
            WHERE email = ?1
            ORDER BY is_favorite DESC, message_count DESC, last_seen_at DESC
            LIMIT 1
            ",
        )
        .ok()?;
    let base = stmt.query_row(params![email], map_contact_row).ok()?;
    let agg: (i64, i64, String) = conn
        .query_row(
            "
            SELECT COALESCE(SUM(message_count), 0), MAX(is_favorite),
                   MAX(last_seen_at)
            FROM address_contacts WHERE email = ?1
            ",
            params![email],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap_or((0, 0, String::new()));
    Some(AddressContactRow {
        account_id: base.account_id,
        email: base.email,
        display_name: base.display_name,
        message_count: agg.0 as u32,
        last_seen_at: if agg.2.is_empty() {
            base.last_seen_at
        } else {
            agg.2
        },
        last_source: base.last_source,
        is_favorite: agg.1 != 0,
        notes: base.notes,
        source: base.source,
        updated_at: base.updated_at,
    })
}

fn compute_auto_stats(
    conn: &Connection,
    email: &str,
    account_id: &str,
    global: bool,
    rules: &[NewsletterRule],
    account_emails: &[String],
) -> (String, f32, Vec<String>) {
    let rule_match = matches_newsletter_email(email, rules);
    let labels = rule_labels_for_email(email, rules);
    let account_clause = if global {
        String::new()
    } else {
        " AND m.account_id = ?2 ".to_string()
    };
    let sql = format!(
        "
        SELECT DISTINCT m.thread_id
        FROM messages m
        WHERE lower(trim(m.sender_email)) = ?1
        {account_clause}
        ORDER BY m.received_at DESC
        LIMIT 24
        "
    );
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => {
            return (auto_kind_from_ratio(rule_match, 0, 0), 0.0, labels);
        }
    };
    let thread_ids: Vec<String> = if global {
        stmt.query_map(params![email], |r| r.get(0))
            .ok()
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default()
    } else {
        stmt.query_map(params![email, account_id], |r| r.get(0))
            .ok()
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default()
    };
    let total = thread_ids.len() as u32;
    let mut newsletter_n = 0u32;
    for tid in &thread_ids {
        if thread_newsletter_from_messages(conn, tid, account_emails, rules) {
            newsletter_n += 1;
        }
    }
    let ratio = if total == 0 {
        if rule_match {
            1.0
        } else {
            0.0
        }
    } else {
        newsletter_n as f32 / total as f32
    };
    (
        auto_kind_from_ratio(rule_match, newsletter_n, total),
        ratio,
        labels,
    )
}

fn digit_count(s: &str) -> usize {
    s.chars().filter(|c| c.is_ascii_digit()).count()
}

fn has_phone_separator(s: &str) -> bool {
    s.contains('+')
        || s.contains(' ')
        || s.contains('-')
        || s.contains('.')
        || s.contains('(')
        || s.contains('/')
}

/// Rejette les dates type `20/05/2020` ou `20/05/2020 17` (souvent captées à tort).
fn looks_like_dateish_token(raw: &str) -> bool {
    let t = raw.trim().trim_end_matches('.');
    let parts: Vec<&str> = t.split('/').collect();
    if parts.len() < 3 {
        return false;
    }
    let day = parts[0].trim();
    let month = parts[1].trim();
    let rest = parts[2].trim();
    if day.len() != 2 || month.len() != 2 {
        return false;
    }
    if !day.chars().all(|c| c.is_ascii_digit()) || !month.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    let year: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    year.len() == 4
}

fn looks_like_french_phone(digits: &str, raw: &str) -> bool {
    if digits.starts_with("33") && digits.len() >= 11 && digits.len() <= 12 {
        return true;
    }
    if digits.starts_with('0') && digits.len() == 10 {
        return has_phone_separator(raw) || raw.contains('+');
    }
    false
}

fn accept_phone_candidate(raw: &str) -> Option<String> {
    let norm = raw.trim().trim_end_matches('.');
    if norm.is_empty() {
        return None;
    }
    if looks_like_dateish_token(norm) {
        return None;
    }
    let digits: String = norm.chars().filter(|c| c.is_ascii_digit()).collect();
    let n = digits.len();
    if n < 8 || n > 15 {
        return None;
    }
    if !has_phone_separator(norm) && !norm.starts_with('+') && !norm.starts_with("tel:") {
        return None;
    }
    if looks_like_french_phone(&digits, norm)
        || norm.starts_with('+')
        || norm.to_ascii_lowercase().starts_with("tel:")
    {
        return Some(norm.to_string());
    }
    if has_phone_separator(norm) && n >= 9 {
        return Some(norm.to_string());
    }
    None
}

fn push_phone_unique(out: &mut Vec<String>, candidate: &str) {
    if out.len() >= 8 {
        return;
    }
    if let Some(p) = accept_phone_candidate(candidate) {
        if !out.iter().any(|x| x == &p) {
            out.push(p);
        }
    }
}

fn extract_phones_from_text(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let lower = text.to_ascii_lowercase();
    for marker in [
        "tel:",
        "tél:",
        "telephone:",
        "téléphone:",
        "phone:",
        "mobile:",
        "portable:",
    ] {
        let mut search_from = 0usize;
        while let Some(pos) = lower[search_from..].find(marker) {
            let start = search_from + pos + marker.len();
            let slice = text.get(start..).unwrap_or("");
            let end = slice
                .find(|c: char| c == '\n' || c == '\r' || c == '<')
                .unwrap_or(slice.len().min(48));
            push_phone_unique(&mut out, slice[..end].trim());
            search_from = start + end;
            if search_from >= lower.len() {
                break;
            }
        }
    }
    let mut cur = String::new();
    for ch in text.chars() {
        if ch.is_ascii_digit() || matches!(ch, '+' | ' ' | '-' | '.' | '(' | ')' | '/') {
            cur.push(ch);
        } else if !cur.is_empty() {
            push_phone_unique(&mut out, &cur);
            cur.clear();
        }
    }
    if !cur.is_empty() {
        push_phone_unique(&mut out, &cur);
    }
    out.truncate(8);
    out
}

fn is_noisy_entity_value(value: &str) -> bool {
    let v = value.trim();
    if v.len() < 3 {
        return true;
    }
    let lower = v.to_ascii_lowercase();
    if lower.contains("px") && v.chars().any(|c| c.is_ascii_digit()) {
        return true;
    }
    if lower.contains("jan-") || lower.contains("feb-") || lower.contains("mar-") {
        return true;
    }
    if v.chars()
        .all(|c| c.is_ascii_digit() || c == '-' || c == '/')
        && digit_count(v) >= 8
        && !has_phone_separator(v)
    {
        return true;
    }
    false
}

pub fn live_message_count_for_sender(
    conn: &Connection,
    email: &str,
    account_id: &str,
    global_scope: bool,
) -> u32 {
    let account_filter = if global_scope {
        String::new()
    } else {
        " AND m.account_id = ?2 ".to_string()
    };
    let sql = format!(
        "SELECT COUNT(*) FROM messages m WHERE lower(trim(m.sender_email)) = ?1 {account_filter}"
    );
    let count: i64 = if global_scope {
        conn.query_row(&sql, params![email], |r| r.get(0))
    } else {
        conn.query_row(&sql, params![email, account_id], |r| r.get(0))
    }
    .unwrap_or(0);
    count.max(0) as u32
}

pub fn count_address_contacts_scoped(
    db_path: &Path,
    account_id: &str,
    global_scope: bool,
) -> Result<u32, String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let account_id = account_id.trim();
    if global_scope {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT email) FROM address_contacts",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        return Ok(n.max(0) as u32);
    }
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM address_contacts WHERE account_id = ?1",
            params![account_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n.max(0) as u32)
}

pub fn list_sender_emails_for_domain(
    db_path: &Path,
    account_id: &str,
    domain: &str,
    global_scope: bool,
) -> Result<Vec<String>, String> {
    let domain = domain.trim().trim_start_matches('@').to_ascii_lowercase();
    if domain.is_empty() {
        return Ok(Vec::new());
    }
    let like = format!("%@{}", domain);
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let sql = if global_scope {
        "
        SELECT DISTINCT lower(trim(sender_email)) FROM messages
        WHERE sender_email != '' AND lower(trim(sender_email)) LIKE ?1 ESCAPE '\\'
        ORDER BY 1
        LIMIT 200
        "
    } else {
        "
        SELECT DISTINCT lower(trim(sender_email)) FROM messages
        WHERE account_id = ?2 AND sender_email != ''
          AND lower(trim(sender_email)) LIKE ?1 ESCAPE '\\'
        ORDER BY 1
        LIMIT 200
        "
    };
    let mut out = Vec::new();
    if global_scope {
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![like], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            let e = row.trim().to_ascii_lowercase();
            if e.contains('@') && !out.contains(&e) {
                out.push(e);
            }
        }
    } else {
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![like, account_id.trim()], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            let e = row.trim().to_ascii_lowercase();
            if e.contains('@') && !out.contains(&e) {
                out.push(e);
            }
        }
    }
    Ok(out)
}

/// Kind expéditeur pour suggestions d'activité : `human`, `auto`, ou `mixed`.
pub fn sender_auto_kind_for_account(conn: &Connection, account_id: &str, email: &str) -> String {
    let rules = match list_newsletter_rules_connection(conn) {
        Ok(r) => r,
        Err(_) => return "human".to_string(),
    };
    let account_emails: Vec<String> = conn
        .query_row(
            "SELECT email FROM accounts WHERE id = ?1 LIMIT 1",
            params![account_id.trim()],
            |r| r.get(0),
        )
        .ok()
        .into_iter()
        .collect();
    let (kind, _, _) = compute_auto_stats(conn, email, account_id, false, &rules, &account_emails);
    kind
}

pub fn get_address_contact_detail(
    db_path: &Path,
    account_id: &str,
    email: &str,
    global_scope: bool,
) -> Result<ContactDetailDto, String> {
    let email = normalize_email(email).ok_or_else(|| "email invalide".to_string())?;
    let account_id = account_id.trim();
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let rules = list_newsletter_rules_connection(&conn).map_err(|e| e.to_string())?;
    let account_emails = account_emails_for_scope(&conn, account_id, global_scope);

    let row = if global_scope {
        merge_contact_row_global(&conn, &email)
    } else {
        row_by_email(&conn, account_id, &email)
    }
    .ok_or_else(|| "contact introuvable".to_string())?;

    let domain = host_of_email(&email).unwrap_or_default();
    let message_count = live_message_count_for_sender(&conn, &email, account_id, global_scope);
    let (auto_sender_kind, auto_thread_ratio, matched_rule_labels) = compute_auto_stats(
        &conn,
        &email,
        account_id,
        global_scope,
        &rules,
        &account_emails,
    );

    let account_filter = if global_scope {
        String::new()
    } else {
        " AND m.account_id = ?2 ".to_string()
    };
    let threads_sql = format!(
        "
        SELECT m.thread_id,
               COALESCE(t.subject, m.subject, ''),
               MAX(m.received_at),
               COUNT(*),
               SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END)
        FROM messages m
        LEFT JOIN threads t ON t.id = m.thread_id
        WHERE lower(trim(m.sender_email)) = ?1
        {account_filter}
        GROUP BY m.thread_id
        ORDER BY MAX(m.received_at) DESC
        LIMIT 15
        "
    );
    let mut recent_threads = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&threads_sql) {
        let map_row = |r: &rusqlite::Row<'_>| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)? as u32,
                r.get::<_, i64>(4)? != 0,
            ))
        };
        let parsed: Vec<(String, String, String, u32, bool)> = if global_scope {
            stmt.query_map(params![email], map_row)
                .ok()
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
                .unwrap_or_default()
        } else {
            stmt.query_map(params![email, account_id], map_row)
                .ok()
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
                .unwrap_or_default()
        };
        for r in parsed {
            let nl = thread_newsletter_from_messages(&conn, &r.0, &account_emails, &rules);
            recent_threads.push(ContactThreadSnippet {
                thread_id: r.0,
                subject: r.1,
                last_activity: r.2,
                message_count: r.3,
                unread: r.4,
                is_newsletter_thread: nl,
            });
        }
    }

    let bodies_sql = format!(
        "
        SELECT COALESCE(body_plain, body, '')
        FROM messages m
        WHERE lower(trim(m.sender_email)) = ?1
        {account_filter}
        ORDER BY m.received_at DESC
        LIMIT 25
        "
    );
    let mut bodies: Vec<String> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&bodies_sql) {
        if global_scope {
            if let Ok(rows) = stmt.query_map(params![email], |r| r.get::<_, String>(0)) {
                bodies = rows.filter_map(|r| r.ok()).collect();
            }
        } else if let Ok(rows) =
            stmt.query_map(params![email, account_id], |r| r.get::<_, String>(0))
        {
            bodies = rows.filter_map(|r| r.ok()).collect();
        }
    }

    let mut entity_map: HashMap<(String, String), ()> = HashMap::new();
    let mut phones: Vec<String> = Vec::new();
    for body in &bodies {
        for p in extract_phones_from_text(body) {
            if !phones.contains(&p) {
                phones.push(p);
            }
        }
        let ext = extract_entities(body, None);
        for e in ext.entities {
            if is_noisy_entity_value(&e.value) {
                continue;
            }
            let kind = match e.kind {
                EntityKind::Email => "email",
                EntityKind::Link => "link",
                EntityKind::Identifier => "identifier",
                EntityKind::Date => "date",
                EntityKind::ActionItem => "action",
                EntityKind::Person => "person",
            };
            entity_map.insert((kind.to_string(), e.value), ());
        }
    }
    let mut extracted_entities: Vec<ContactEntitySnippet> = entity_map
        .keys()
        .map(|(k, v)| ContactEntitySnippet {
            kind: k.clone(),
            value: v.clone(),
        })
        .collect();
    extracted_entities.sort_by(|a, b| a.kind.cmp(&b.kind).then(a.value.cmp(&b.value)));
    extracted_entities.truncate(40);

    Ok(ContactDetailDto {
        account_id: row.account_id,
        email: row.email,
        display_name: row.display_name,
        message_count,
        last_seen_at: row.last_seen_at,
        last_source: row.last_source,
        is_favorite: row.is_favorite,
        notes: row.notes,
        source: row.source,
        updated_at: row.updated_at,
        domain,
        auto_sender_kind,
        auto_thread_ratio,
        matched_rule_labels,
        recent_threads,
        extracted_entities,
        phones,
    })
}

pub fn list_address_contacts_scoped(
    db_path: &Path,
    account_id: &str,
    query: &str,
    offset: u32,
    limit: u32,
    global_scope: bool,
) -> Result<ListAddressContactsScopedResult, String> {
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let rules = list_newsletter_rules_connection(&conn).map_err(|e| e.to_string())?;
    let account_id = account_id.trim();
    let limit = limit.clamp(1, 100);
    let q = query.trim().to_ascii_lowercase();

    let (rows, total): (Vec<AddressContactRow>, u32) = if global_scope {
        list_global_contacts(&conn, &q, offset, limit)?
    } else {
        let inner = crate::address_contacts::list_address_contacts(
            db_path, account_id, query, offset, limit,
        )?;
        (inner.items, inner.total)
    };

    let mut items = Vec::with_capacity(rows.len());
    for mut row in rows {
        row.message_count =
            live_message_count_for_sender(&conn, &row.email, account_id, global_scope);
        let rule_match = matches_newsletter_email(&row.email, &rules);
        let kind = if rule_match {
            "auto".to_string()
        } else {
            "human".to_string()
        };
        items.push(AddressContactListRow {
            row,
            auto_sender_kind: kind,
        });
    }
    Ok(ListAddressContactsScopedResult { items, total })
}

fn list_global_contacts(
    conn: &Connection,
    q: &str,
    offset: u32,
    limit: u32,
) -> Result<(Vec<AddressContactRow>, u32), String> {
    let like = if q.is_empty() {
        "%".to_string()
    } else {
        format!(
            "%{}%",
            q.replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        )
    };
    let total: u32 = if q.is_empty() {
        conn.query_row(
            "SELECT COUNT(DISTINCT email) FROM address_contacts",
            [],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u32
    } else {
        conn.query_row(
            "
            SELECT COUNT(DISTINCT email) FROM address_contacts
            WHERE email LIKE ?1 ESCAPE '\\'
               OR lower(display_name) LIKE ?1 ESCAPE '\\'
               OR lower(notes) LIKE ?1 ESCAPE '\\'
            ",
            params![like],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u32
    };

    let sql = if q.is_empty() {
        "
        SELECT MIN(account_id) AS account_id, email,
               MAX(CASE WHEN display_name != '' THEN display_name ELSE NULL END) AS display_name,
               SUM(message_count) AS mc,
               MAX(last_seen_at), MAX(last_source),
               MAX(is_favorite), MAX(notes), MAX(source), MAX(updated_at)
        FROM address_contacts
        GROUP BY email
        ORDER BY MAX(is_favorite) DESC, mc DESC, MAX(last_seen_at) DESC, email ASC
        LIMIT ?1 OFFSET ?2
        "
    } else {
        "
        SELECT MIN(account_id) AS account_id, email,
               MAX(CASE WHEN display_name != '' THEN display_name ELSE NULL END) AS display_name,
               SUM(message_count) AS mc,
               MAX(last_seen_at), MAX(last_source),
               MAX(is_favorite), MAX(notes), MAX(source), MAX(updated_at)
        FROM address_contacts
        WHERE email LIKE ?1 ESCAPE '\\'
           OR lower(display_name) LIKE ?1 ESCAPE '\\'
           OR lower(notes) LIKE ?1 ESCAPE '\\'
        GROUP BY email
        ORDER BY MAX(is_favorite) DESC, mc DESC, MAX(last_seen_at) DESC, email ASC
        LIMIT ?2 OFFSET ?3
        "
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = if q.is_empty() {
        stmt.query_map(params![limit, offset], map_grouped_contact_row)
    } else {
        stmt.query_map(params![like, limit, offset], map_grouped_contact_row)
    }
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    Ok((rows, total))
}

fn map_grouped_contact_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AddressContactRow> {
    Ok(AddressContactRow {
        account_id: row.get(0)?,
        email: row.get(1)?,
        display_name: row.get(2)?,
        message_count: row.get::<_, i64>(3)? as u32,
        last_seen_at: row.get(4)?,
        last_source: row.get(5)?,
        is_favorite: row.get::<_, i64>(6)? != 0,
        notes: row.get(7)?,
        source: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

/// Échantillon de corps de messages pour profil IA contact.
pub fn contact_message_samples(
    db_path: &Path,
    account_id: &str,
    email: &str,
    global_scope: bool,
    limit: u32,
) -> Result<String, String> {
    let email = email.trim().to_ascii_lowercase();
    if email.is_empty() {
        return Ok(String::new());
    }
    let account_id = account_id.trim();
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let account_filter = if global_scope {
        String::new()
    } else {
        " AND m.account_id = ?2 ".to_string()
    };
    let limit = limit.clamp(1, 30);
    let sql = format!(
        "
        SELECT COALESCE(body_plain, body, '')
        FROM messages m
        WHERE lower(trim(m.sender_email)) = ?1
        {account_filter}
        ORDER BY m.received_at DESC
        LIMIT {limit}
        "
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows: Vec<String> = if global_scope {
        stmt.query_map(params![email], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map(params![email, account_id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect()
    };
    Ok(rows
        .into_iter()
        .map(|b| b.trim().chars().take(2000).collect::<String>())
        .filter(|b| !b.is_empty())
        .collect::<Vec<_>>()
        .join("\n---\n"))
}

#[cfg(test)]
mod phone_extract_tests {
    use super::extract_phones_from_text;

    #[test]
    fn rejects_date_tokens_as_phones() {
        let phones = extract_phones_from_text("Reçu le 20/05/2020 17 et aussi 19/12/2017 12");
        assert!(
            phones.is_empty(),
            "dates must not be listed as phones: {phones:?}"
        );
    }

    #[test]
    fn keeps_french_phone_with_dots() {
        let phones = extract_phones_from_text("Joignable au 06.82.65.04.71 pour le dossier.");
        assert!(
            phones.iter().any(|p| p.contains("06.82.65.04.71")),
            "expected french phone, got {phones:?}"
        );
    }
}
