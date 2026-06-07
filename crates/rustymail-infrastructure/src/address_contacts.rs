//! Carnet d’adresses (mail + contacts manuels) avec recherche FTS5.

use mailparse::addrparse;
use rusqlite::{params, Connection};
use rustymail_domain::EmailAddress;
use serde::Serialize;
use std::path::Path;

use crate::email_util::normalize_email;
use crate::open_sqlite_migrated;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressContactHit {
    pub email: String,
    pub display_name: String,
    pub message_count: u32,
    #[serde(default)]
    pub is_favorite: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressContactRow {
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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAddressContactsResult {
    pub items: Vec<AddressContactRow>,
    pub total: u32,
}

#[derive(Debug, Clone)]
pub struct ManualContactUpsert {
    pub account_id: String,
    pub email: String,
    pub display_name: String,
    pub notes: String,
    pub is_favorite: bool,
}

fn now_iso(conn: &Connection) -> String {
    conn.query_row(
        "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        [],
        |r| r.get(0),
    )
    .unwrap_or_default()
}

/// Migration L3 : colonnes carnet, FTS5, déclencheurs, backfill index.
pub fn migrate_address_contacts_l3(connection: &Connection) -> Result<(), rusqlite::Error> {
    let _ = connection.execute(
        "ALTER TABLE address_contacts ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE address_contacts ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE address_contacts ADD COLUMN source TEXT NOT NULL DEFAULT 'mail'",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE address_contacts ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
        [],
    );

    connection.execute_batch(
        "
        CREATE VIRTUAL TABLE IF NOT EXISTS address_contacts_fts USING fts5(
            account_id UNINDEXED,
            email,
            display_name,
            tokenize='unicode61'
        );
        ",
    )?;

    let fts_count: i64 = connection
        .query_row("SELECT count(*) FROM address_contacts_fts", [], |r| r.get(0))
        .unwrap_or(0);
    if fts_count == 0 {
        let _ = connection.execute(
            "
            INSERT INTO address_contacts_fts(account_id, email, display_name)
            SELECT account_id, email, display_name FROM address_contacts
            ",
            [],
        );
    } else {
        let fts_dupes: i64 = connection
            .query_row(
                "
                SELECT count(*) FROM (
                    SELECT account_id, email FROM address_contacts_fts
                    GROUP BY account_id, email
                    HAVING count(*) > 1
                )
                ",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if fts_dupes > 0 {
            rebuild_address_contacts_fts(connection)?;
        }
    }
    Ok(())
}

fn fts_sync_row(
    conn: &Connection,
    account_id: &str,
    email: &str,
    display_name: &str,
) -> Result<(), rusqlite::Error> {
    fts_purge_email(conn, account_id, email)?;
    conn.execute(
        "
        INSERT INTO address_contacts_fts(account_id, email, display_name)
        VALUES (?1, ?2, ?3)
        ",
        params![account_id, email, display_name],
    )?;
    Ok(())
}

fn fts_delete_row(conn: &Connection, account_id: &str, email: &str, display_name: &str) {
    let _ = conn.execute(
        "
        INSERT INTO address_contacts_fts(address_contacts_fts, account_id, email, display_name)
        VALUES ('delete', ?1, ?2, ?3)
        ",
        params![account_id, email, display_name],
    );
}

/// Retire toutes les lignes FTS pour un e-mail (évite les doublons quand le nom affiché change).
fn fts_purge_email(conn: &Connection, account_id: &str, email: &str) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT display_name FROM address_contacts_fts WHERE account_id = ?1 AND email = ?2",
    )?;
    let names: Vec<String> = stmt
        .query_map(params![account_id, email], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    for name in names {
        fts_delete_row(conn, account_id, email, &name);
    }
    Ok(())
}

fn dedup_contact_hits(mut hits: Vec<AddressContactHit>) -> Vec<AddressContactHit> {
    hits.sort_by(|a, b| {
        b.is_favorite
            .cmp(&a.is_favorite)
            .then(b.message_count.cmp(&a.message_count))
            .then(b.display_name.len().cmp(&a.display_name.len()))
            .then(a.email.cmp(&b.email))
    });
    hits.dedup_by(|a, b| a.email.eq_ignore_ascii_case(&b.email));
    hits
}

fn rebuild_address_contacts_fts(conn: &Connection) -> Result<(), rusqlite::Error> {
    let _ = conn.execute("DELETE FROM address_contacts_fts", []);
    conn.execute(
        "
        INSERT INTO address_contacts_fts(account_id, email, display_name)
        SELECT account_id, email, display_name FROM address_contacts
        ",
        [],
    )?;
    Ok(())
}

/// Parse une liste d’adresses RFC (To/Cc/Reply-To).
pub fn parse_header_address_list(header: &str) -> Vec<EmailAddress> {
    let mut out = Vec::new();
    let Ok(list) = addrparse(header) else {
        return out;
    };
    for addr in list.iter() {
        if let mailparse::MailAddr::Single(single) = addr {
            let Some(email) = normalize_email(&single.addr) else {
                continue;
            };
            if out.iter().any(|e: &EmailAddress| e.email.eq_ignore_ascii_case(&email)) {
                continue;
            }
            out.push(EmailAddress {
                name: single
                    .display_name
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string),
                email,
            });
        }
    }
    out
}

fn account_own_email(conn: &Connection, account_id: &str) -> Option<String> {
    conn.query_row(
        "SELECT lower(trim(email)) FROM accounts WHERE id = ?1 LIMIT 1",
        params![account_id.trim()],
        |row| row.get(0),
    )
    .ok()
    .filter(|s: &String| !s.is_empty())
}

/// Upsert une adresse issue du mail (ne remplace pas nom/notes des contacts `manual`).
pub fn upsert_contact(
    conn: &Connection,
    account_id: &str,
    email: &str,
    display_name: Option<&str>,
    last_seen_at: &str,
    source: &str,
) -> Result<(), rusqlite::Error> {
    let account_id = account_id.trim();
    let Some(email_norm) = normalize_email(email) else {
        return Ok(());
    };
    let name = display_name.unwrap_or("").trim();
    let updated = now_iso(conn);
    conn.execute(
        "
        INSERT INTO address_contacts (
            account_id, email, display_name, last_seen_at, message_count, last_source,
            source, updated_at, is_favorite, notes
        ) VALUES (?1, ?2, ?3, ?4, 1, ?5, 'mail', ?6, 0, '')
        ON CONFLICT(account_id, email) DO UPDATE SET
            display_name = CASE
                WHEN address_contacts.source = 'manual' THEN address_contacts.display_name
                WHEN excluded.display_name != '' THEN excluded.display_name
                ELSE address_contacts.display_name
            END,
            last_seen_at = CASE
                WHEN excluded.last_seen_at > address_contacts.last_seen_at
                THEN excluded.last_seen_at
                ELSE address_contacts.last_seen_at
            END,
            message_count = address_contacts.message_count + 1,
            last_source = excluded.last_source,
            source = CASE
                WHEN address_contacts.source = 'manual' THEN 'manual'
                ELSE 'mail'
            END,
            updated_at = excluded.updated_at
        ",
        params![account_id, email_norm, name, last_seen_at, source, updated],
    )?;
    // Pour les contacts `manual`, la base protège `display_name` (ne pas l’écraser avec un `name` vide).
    // On sync FTS avec la valeur réellement stockée.
    let stored_name: String = conn.query_row(
        "SELECT COALESCE(display_name, '') FROM address_contacts WHERE account_id = ?1 AND email = ?2 LIMIT 1",
        params![account_id, email_norm],
        |r| r.get(0),
    )?;
    fts_sync_row(conn, account_id, &email_norm, stored_name.trim())?;
    Ok(())
}

pub fn upsert_contacts_from_addresses(
    conn: &Connection,
    account_id: &str,
    addrs: &[EmailAddress],
    last_seen_at: &str,
    source: &str,
) -> Result<(), rusqlite::Error> {
    for a in addrs {
        upsert_contact(
            conn,
            account_id,
            &a.email,
            a.name.as_deref(),
            last_seen_at,
            source,
        )?;
    }
    Ok(())
}

pub fn upsert_contacts_from_message_row(
    conn: &Connection,
    account_id: &str,
    sender_name: &str,
    sender_email: &str,
    to_header: Option<&str>,
    cc_header: Option<&str>,
    reply_to_header: Option<&str>,
    last_seen_at: &str,
) -> Result<(), rusqlite::Error> {
    if let Some(email) = normalize_email(sender_email) {
        upsert_contact(
            conn,
            account_id,
            &email,
            Some(sender_name),
            last_seen_at,
            "from",
        )?;
    }
    if let Some(raw) = to_header.filter(|s| !s.trim().is_empty()) {
        let addrs = parse_header_address_list(raw);
        upsert_contacts_from_addresses(conn, account_id, &addrs, last_seen_at, "to")?;
    }
    if let Some(raw) = cc_header.filter(|s| !s.trim().is_empty()) {
        let addrs = parse_header_address_list(raw);
        upsert_contacts_from_addresses(conn, account_id, &addrs, last_seen_at, "cc")?;
    }
    if let Some(raw) = reply_to_header.filter(|s| !s.trim().is_empty()) {
        let addrs = parse_header_address_list(raw);
        upsert_contacts_from_addresses(conn, account_id, &addrs, last_seen_at, "reply_to")?;
    }
    Ok(())
}

pub fn upsert_manual_contact(
    db_path: &Path,
    input: ManualContactUpsert,
) -> Result<AddressContactRow, String> {
    let account_id = input.account_id.trim();
    let Some(email) = normalize_email(&input.email) else {
        return Err("Adresse e-mail invalide.".into());
    };
    if account_id.is_empty() {
        return Err("account_id vide".into());
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let updated = now_iso(&conn);
    let display_name = input.display_name.trim();
    let notes = input.notes.trim();
    let is_fav = i64::from(input.is_favorite);
    conn.execute(
        "
        INSERT INTO address_contacts (
            account_id, email, display_name, last_seen_at, message_count, last_source,
            source, updated_at, is_favorite, notes
        ) VALUES (?1, ?2, ?3, ?4, 0, 'manual', 'manual', ?4, ?5, ?6)
        ON CONFLICT(account_id, email) DO UPDATE SET
            display_name = excluded.display_name,
            notes = excluded.notes,
            is_favorite = excluded.is_favorite,
            source = 'manual',
            updated_at = excluded.updated_at
        ",
        params![account_id, email, display_name, updated, is_fav, notes],
    )
    .map_err(|e| e.to_string())?;
    fts_sync_row(&conn, account_id, &email, display_name).map_err(|e| e.to_string())?;
    row_by_email(&conn, account_id, &email).ok_or_else(|| "Contact introuvable après enregistrement.".into())
}

pub fn delete_manual_contact(
    db_path: &Path,
    account_id: &str,
    email: &str,
) -> Result<bool, String> {
    let account_id = account_id.trim();
    let Some(email_norm) = normalize_email(email) else {
        return Err("Adresse e-mail invalide.".into());
    };
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let display_name: String = conn
        .query_row(
            "SELECT display_name FROM address_contacts WHERE account_id = ?1 AND email = ?2",
            params![account_id, email_norm],
            |r| r.get(0),
        )
        .unwrap_or_default();
    let n = conn
        .execute(
            "DELETE FROM address_contacts WHERE account_id = ?1 AND email = ?2 AND source = 'manual'",
            params![account_id, email_norm],
        )
        .map_err(|e| e.to_string())?;
    if n > 0 {
        fts_delete_row(&conn, account_id, &email_norm, &display_name);
    }
    Ok(n > 0)
}

pub(crate) fn row_by_email(
    conn: &Connection,
    account_id: &str,
    email: &str,
) -> Option<AddressContactRow> {
    conn.query_row(
        "
        SELECT account_id, email, display_name, message_count, last_seen_at, last_source,
               is_favorite, notes, source, updated_at
        FROM address_contacts
        WHERE account_id = ?1 AND email = ?2
        ",
        params![account_id, email],
        map_contact_row,
    )
    .ok()
}

pub(crate) fn map_contact_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AddressContactRow> {
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

pub fn list_address_contacts(
    db_path: &Path,
    account_id: &str,
    query: &str,
    offset: u32,
    limit: u32,
) -> Result<ListAddressContactsResult, String> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Ok(ListAddressContactsResult {
            items: Vec::new(),
            total: 0,
        });
    }
    let limit = limit.clamp(1, 100);
    let offset = offset;
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let q = query.trim().to_ascii_lowercase();
    let like = format!(
        "%{}%",
        q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
    );

    let total: u32 = if q.is_empty() {
        conn.query_row(
            "SELECT count(*) FROM address_contacts WHERE account_id = ?1",
            params![account_id],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u32
    } else {
        conn.query_row(
            "
            SELECT count(*) FROM address_contacts
            WHERE account_id = ?1
              AND (email LIKE ?2 ESCAPE '\\' OR lower(display_name) LIKE ?2 ESCAPE '\\'
                   OR lower(notes) LIKE ?2 ESCAPE '\\')
            ",
            params![account_id, like],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u32
    };

    let mut stmt = if q.is_empty() {
        conn.prepare(
            "
            SELECT account_id, email, display_name, message_count, last_seen_at, last_source,
                   is_favorite, notes, source, updated_at
            FROM address_contacts
            WHERE account_id = ?1
            ORDER BY is_favorite DESC, message_count DESC, last_seen_at DESC, email ASC
            LIMIT ?2 OFFSET ?3
            ",
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.prepare(
            "
            SELECT account_id, email, display_name, message_count, last_seen_at, last_source,
                   is_favorite, notes, source, updated_at
            FROM address_contacts
            WHERE account_id = ?1
              AND (email LIKE ?2 ESCAPE '\\' OR lower(display_name) LIKE ?2 ESCAPE '\\'
                   OR lower(notes) LIKE ?2 ESCAPE '\\')
            ORDER BY is_favorite DESC, message_count DESC, last_seen_at DESC, email ASC
            LIMIT ?3 OFFSET ?4
            ",
        )
        .map_err(|e| e.to_string())?
    };

    let rows = if q.is_empty() {
        stmt.query_map(params![account_id, limit, offset], map_contact_row)
    } else {
        stmt.query_map(params![account_id, like, limit, offset], map_contact_row)
    }
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(ListAddressContactsResult { items: rows, total })
}

fn fts_match_query(q: &str) -> String {
    let tokens: Vec<String> = q
        .split(|c: char| c.is_whitespace() || c == '@')
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(|t| {
            let esc = t.replace('"', "\"\"");
            format!("\"{esc}\"*")
        })
        .collect();
    if tokens.is_empty() {
        return String::new();
    }
    tokens.join(" AND ")
}

fn search_like(
    conn: &Connection,
    account_id: &str,
    own: &str,
    q: &str,
    limit: u32,
) -> Result<Vec<AddressContactHit>, String> {
    let like = if q.is_empty() {
        "%".to_string()
    } else {
        format!(
            "{}%",
            q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
        )
    };
    let mut stmt = conn
        .prepare(
            "
            SELECT email, display_name, message_count, is_favorite
            FROM address_contacts
            WHERE account_id = ?1
              AND (?2 = '' OR email != ?2)
              AND (
                ?3 = '%' OR email LIKE ?3 ESCAPE '\\'
                OR lower(display_name) LIKE ?3 ESCAPE '\\'
              )
            ORDER BY is_favorite DESC, message_count DESC, last_seen_at DESC
            LIMIT ?4
            ",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id, own, like, limit], |row| {
            Ok(AddressContactHit {
                email: row.get(0)?,
                display_name: row.get(1)?,
                message_count: row.get::<_, i64>(2)? as u32,
                is_favorite: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(dedup_contact_hits(
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?,
    ))
}

fn search_fts(
    conn: &Connection,
    account_id: &str,
    own: &str,
    q: &str,
    limit: u32,
) -> Result<Vec<AddressContactHit>, String> {
    let match_q = fts_match_query(q);
    if match_q.is_empty() {
        return search_like(conn, account_id, own, q, limit);
    }
    let mut stmt = conn
        .prepare(
            "
            SELECT ac.email, ac.display_name, ac.message_count, ac.is_favorite
            FROM address_contacts ac
            INNER JOIN address_contacts_fts fts
              ON ac.account_id = fts.account_id AND ac.email = fts.email
            WHERE ac.account_id = ?1
              AND fts.account_id = ?1
              AND (?2 = '' OR ac.email != ?2)
              AND address_contacts_fts MATCH ?3
            ORDER BY ac.is_favorite DESC, ac.message_count DESC, ac.last_seen_at DESC
            LIMIT ?4
            ",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id, own, match_q, limit], |row| {
            Ok(AddressContactHit {
                email: row.get(0)?,
                display_name: row.get(1)?,
                message_count: row.get::<_, i64>(2)? as u32,
                is_favorite: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(dedup_contact_hits(
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?,
    ))
}

fn search_global_fts(
    conn: &Connection,
    own_emails: &[String],
    q: &str,
    limit: u32,
) -> Result<Vec<AddressContactHit>, String> {
    let match_q = fts_match_query(q);
    if match_q.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "
            SELECT ac.email, ac.display_name, ac.message_count, ac.is_favorite
            FROM address_contacts ac
            INNER JOIN address_contacts_fts fts
              ON ac.account_id = fts.account_id AND ac.email = fts.email
            WHERE address_contacts_fts MATCH ?1
            ORDER BY ac.is_favorite DESC, ac.message_count DESC, ac.last_seen_at DESC
            LIMIT ?2
            ",
        )
        .map_err(|e| e.to_string())?;
    let hits: Vec<AddressContactHit> = stmt
        .query_map(params![match_q, limit.saturating_mul(4)], |row| {
            Ok(AddressContactHit {
                email: row.get(0)?,
                display_name: row.get(1)?,
                message_count: row.get::<_, i64>(2)? as u32,
                is_favorite: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter(|h| !own_emails.iter().any(|o| o == &h.email))
        .collect();
    let mut hits = dedup_contact_hits(hits);
    hits.truncate(limit as usize);
    Ok(hits)
}

pub fn search_address_contacts(
    db_path: &Path,
    account_id: &str,
    query: &str,
    limit: u32,
) -> Result<Vec<AddressContactHit>, String> {
    search_address_contacts_scoped(db_path, account_id, query, limit, false)
}

pub fn search_address_contacts_scoped(
    db_path: &Path,
    account_id: &str,
    query: &str,
    limit: u32,
    global_scope: bool,
) -> Result<Vec<AddressContactHit>, String> {
    let account_id = account_id.trim();
    if account_id.is_empty() && !global_scope {
        return Ok(Vec::new());
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let own = account_own_email(&conn, account_id).unwrap_or_default();
    let q = query.trim().to_ascii_lowercase();
    let limit = limit.clamp(1, 50);

    if global_scope && q.len() >= 2 {
        let own_all: Vec<String> = conn
            .prepare("SELECT lower(trim(email)) FROM accounts WHERE email != ''")
            .ok()
            .map(|mut s| {
                s.query_map([], |r| r.get(0))
                    .ok()
                    .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
                    .unwrap_or_default()
            })
            .unwrap_or_default();
        return search_global_fts(&conn, &own_all, &q, limit);
    }

    if q.len() < 2 {
        return search_like(&conn, account_id, &own, &q, limit);
    }

    search_fts(&conn, account_id, &own, &q, limit).or_else(|_| search_like(&conn, account_id, &own, &q, limit))
}

pub fn reindex_address_contacts(
    db_path: &Path,
    account_id: &str,
) -> Result<u32, String> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Err("account_id vide".into());
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "
            SELECT sender_name, sender_email, to_header, cc_header, reply_to_header, received_at
            FROM messages
            WHERE account_id = ?1
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(String, String, Option<String>, Option<String>, Option<String>, String)> = stmt
        .query_map(params![account_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;
    let n = rows.len() as u32;

    // Reindex doit reconstruire les compteurs de façon idempotente.
    // On remet `message_count` à zéro puis on réapplique 1 incrément par message vu.
    tx.execute(
        "UPDATE address_contacts SET message_count = 0 WHERE account_id = ?1",
        params![account_id],
    )
    .map_err(|e| e.to_string())?;

    for (sn, se, to_h, cc_h, rt_h, at) in &rows {
        upsert_contacts_from_message_row(
            &tx,
            account_id,
            sn,
            se,
            to_h.as_deref(),
            cc_h.as_deref(),
            rt_h.as_deref(),
            at,
        )
        .map_err(|e| e.to_string())?;
    }
    rebuild_address_contacts_fts(&tx).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::open_sqlite_migrated;
    use std::path::PathBuf;

    fn temp_db() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("test.db");
        (dir, path)
    }

    #[test]
    fn upsert_increments_message_count() {
        let (_dir, path) = temp_db();
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security) VALUES ('a1', 'Me', 'me@x.com', 'h', 993, 'tls', 'h', 587, 'tls')",
            [],
        )
        .expect("account");
        upsert_contact(&conn, "a1", "bob@example.com", Some("Bob"), "2020-01-01T00:00:00Z", "from")
            .expect("u1");
        upsert_contact(&conn, "a1", "bob@example.com", Some("Robert"), "2021-01-01T00:00:00Z", "to")
            .expect("u2");
        let count: i64 = conn
            .query_row(
                "SELECT message_count FROM address_contacts WHERE account_id = 'a1' AND email = 'bob@example.com'",
                [],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!(count, 2);
        let name: String = conn
            .query_row(
                "SELECT display_name FROM address_contacts WHERE account_id = 'a1' AND email = 'bob@example.com'",
                [],
                |r| r.get(0),
            )
            .expect("name");
        assert_eq!(name, "Robert");
    }

    #[test]
    fn search_excludes_own_email() {
        let (_dir, path) = temp_db();
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security) VALUES ('a1', 'Me', 'me@x.com', 'h', 993, 'tls', 'h', 587, 'tls')",
            [],
        )
        .expect("account");
        upsert_contact(&conn, "a1", "me@x.com", Some("Me"), "2020-01-01T00:00:00Z", "from")
            .expect("self");
        upsert_contact(&conn, "a1", "alice@x.com", Some("Alice"), "2020-01-01T00:00:00Z", "from")
            .expect("alice");
        drop(conn);
        let hits = search_address_contacts(&path, "a1", "ali", 10).expect("search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].email, "alice@x.com");
    }

    #[test]
    fn manual_contact_favorite_priority() {
        let (_dir, path) = temp_db();
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security) VALUES ('a1', 'Me', 'me@x.com', 'h', 993, 'tls', 'h', 587, 'tls')",
            [],
        )
        .expect("account");
        upsert_contact(&conn, "a1", "zoe@x.com", Some("Zoe"), "2020-01-01T00:00:00Z", "from")
            .expect("zoe");
        for _ in 0..5 {
            upsert_contact(&conn, "a1", "bob@x.com", Some("Bob"), "2021-01-01T00:00:00Z", "from")
                .expect("bob");
        }
        drop(conn);
        upsert_manual_contact(
            &path,
            ManualContactUpsert {
                account_id: "a1".into(),
                email: "zoe@x.com".into(),
                display_name: "Zoé VIP".into(),
                notes: String::new(),
                is_favorite: true,
            },
        )
        .expect("manual");
        let hits = search_address_contacts(&path, "a1", "zo", 10).expect("search");
        assert!(!hits.is_empty());
        assert_eq!(hits[0].email, "zoe@x.com");
        assert!(hits[0].is_favorite);
    }

    #[test]
    fn fts_duplicate_rows_deduped_in_search() {
        let (_dir, path) = temp_db();
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security) VALUES ('a1', 'Me', 'me@x.com', 'h', 993, 'tls', 'h', 587, 'tls')",
            [],
        )
        .expect("account");
        upsert_contact(&conn, "a1", "dup@x.com", Some("Name A"), "2020-01-01T00:00:00Z", "from")
            .expect("a");
        upsert_contact(&conn, "a1", "dup@x.com", Some("Name B"), "2021-01-01T00:00:00Z", "to")
            .expect("b");
        // Simule d’anciennes entrées FTS orphelines (nom affiché changé sans purge).
        conn.execute(
            "INSERT INTO address_contacts_fts(account_id, email, display_name) VALUES ('a1', 'dup@x.com', 'Stale')",
            [],
        )
        .expect("stale fts");
        drop(conn);
        let hits = search_address_contacts(&path, "a1", "dup", 10).expect("search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].email, "dup@x.com");
        assert!(hits[0].message_count >= 2);
    }

    #[test]
    fn fts_short_query_uses_like() {
        let (_dir, path) = temp_db();
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security) VALUES ('a1', 'Me', 'me@x.com', 'h', 993, 'tls', 'h', 587, 'tls')",
            [],
        )
        .expect("account");
        upsert_contact(&conn, "a1", "alice@x.com", Some("Alice"), "2020-01-01T00:00:00Z", "from")
            .expect("alice");
        drop(conn);
        let hits = search_address_contacts(&path, "a1", "a", 10).expect("search");
        assert_eq!(hits.len(), 1);
    }
}
