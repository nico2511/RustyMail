//! Normalisation déterministe des tags de fils.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use rustymail_domain::{
    canonical_source_domain, host_of_email, rewrite_tags_csv_sources, OrgApplyProgress, Tag,
    TagFamily,
};

use crate::mail_classify::{
    apply_mail_type_tag, classify_mail_type, mail_type_db_value, priority_score_for_thread,
};
use crate::newsletter::{list_newsletter_rules_connection, NewsletterRule};
use crate::{open_sqlite_migrated, parse_tags, text_sample::append_utf8_byte_sample};
use rustymail_modules::ai_tagging::{infer_content_kind, is_message_content_kind};

pub use crate::mail_classify::sender_is_transactional;

/// Au moins une pièce jointe enregistrée sur un message du fil.
pub fn thread_has_attachments(
    conn: &Connection,
    account_id: &str,
    thread_id: &str,
) -> Result<bool, String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM message_attachments ma
             INNER JOIN messages m ON m.id = ma.message_id
             WHERE m.thread_id = ?1 AND m.account_id = ?2",
            params![thread_id, account_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

pub fn retag_csv_for_thread(
    mailbox: &str,
    tags_csv: &str,
    sender_email: &str,
    subject: &str,
    body_sample: &str,
    langs: &[String],
    has_unsubscribe: bool,
    has_attachments: bool,
    rules: &[NewsletterRule],
) -> String {
    // Ne jamais conserver d’anciens tags `kind:` (dossier, langue, contenu) — recalculés ci-dessous.
    let kept: Vec<Tag> = parse_tags(tags_csv)
        .into_iter()
        .filter(|t| match t.family {
            TagFamily::Kind => false,
            TagFamily::State => t.value != "unsubscribe" && t.value != "attachment",
            TagFamily::Entity => false,
            TagFamily::Source => t.value != "imap",
        })
        .collect();

    let mut out = vec![Tag::source("imap"), Tag::kind(mailbox.to_ascii_lowercase())];
    if let Some(host) = host_of_email(sender_email) {
        let d = canonical_source_domain(&host);
        let t = Tag::source(d);
        if !out.contains(&t) {
            out.push(t);
        }
    }
    for l in langs {
        if !l.is_empty() && l != "und" {
            let t = Tag::kind(format!("lang-{l}"));
            if !out.contains(&t) {
                out.push(t);
            }
        }
    }
    if has_unsubscribe {
        let t = Tag::state("unsubscribe");
        if !out.contains(&t) {
            out.push(t);
        }
    }
    if has_attachments {
        let t = Tag::state("attachment");
        if !out.contains(&t) {
            out.push(t);
        }
    }
    let mail_type = classify_mail_type(sender_email, subject, has_unsubscribe, rules);
    apply_mail_type_tag(&mut out, mail_type);
    if let Some(kind) = infer_content_kind(subject, body_sample) {
        let t = Tag::kind(kind);
        if !out.contains(&t) {
            out.push(t);
        }
    }
    for t in kept {
        if !out.contains(&t) {
            out.push(t);
        }
    }
    out.iter().map(Tag::as_filter).collect::<Vec<_>>().join(",")
}

/// Dossier IMAP effectif du fil (dernier message en cache), sinon `threads.mailbox`.
pub fn effective_thread_mailbox(
    conn: &Connection,
    account_id: &str,
    thread_id: &str,
    thread_row_mailbox: &str,
) -> String {
    conn.query_row(
        "SELECT mailbox FROM messages
         WHERE thread_id = ?1 AND account_id = ?2 AND trim(mailbox) <> ''
         ORDER BY received_at DESC, position DESC, id DESC LIMIT 1",
        params![thread_id, account_id],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .filter(|m| !m.trim().is_empty())
    .unwrap_or_else(|| thread_row_mailbox.trim().to_string())
}

fn apply_retag_for_thread(
    conn: &Connection,
    account_id: &str,
    thread_id: &str,
    thread_row_mailbox: &str,
    subject: &str,
    tags_csv: &str,
    rules: &[NewsletterRule],
    dry_run: bool,
) -> Result<bool, String> {
    let mailbox = effective_thread_mailbox(conn, account_id, thread_id, thread_row_mailbox);
    let (sender, langs, unsub, body_sample) = thread_message_hints(conn, account_id, thread_id)?;
    let has_attachments = thread_has_attachments(conn, account_id, thread_id)?;
    let mail_type = classify_mail_type(&sender, subject, unsub, rules);
    let new_csv = retag_csv_for_thread(
        &mailbox,
        tags_csv,
        &sender,
        subject,
        &body_sample,
        &langs,
        unsub,
        has_attachments,
        rules,
    );
    let followed: bool = conn
        .query_row(
            "SELECT COALESCE(is_followed, 0) FROM threads WHERE id = ?1 AND account_id = ?2",
            params![thread_id, account_id],
            |r| r.get::<_, i64>(0).map(|v| v != 0),
        )
        .unwrap_or(false);
    let unread: bool = conn
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM messages
                WHERE thread_id = ?1 AND account_id = ?2 AND COALESCE(is_read, 0) = 0
             )",
            params![thread_id, account_id],
            |r| r.get::<_, i64>(0).map(|v| v != 0),
        )
        .unwrap_or(false);
    let priority = priority_score_for_thread(unread, followed, 0.0, 0.0);
    let mail_type_s = mail_type_db_value(mail_type);
    let mailbox_changed = mailbox != thread_row_mailbox.trim();
    let prev_mail_type: Option<String> = conn
        .query_row(
            "SELECT mail_type FROM threads WHERE id = ?1 AND account_id = ?2",
            params![thread_id, account_id],
            |r| r.get::<_, Option<String>>(0),
        )
        .unwrap_or(None);
    let prev_priority: f64 = conn
        .query_row(
            "SELECT COALESCE(priority_score, 0) FROM threads WHERE id = ?1 AND account_id = ?2",
            params![thread_id, account_id],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let classify_changed = prev_mail_type.as_deref() != Some(mail_type_s)
        || (prev_priority - f64::from(priority.score)).abs() > 0.01;
    if new_csv == tags_csv && !mailbox_changed && !classify_changed {
        return Ok(false);
    }
    if !dry_run {
        // Colonnes mail_type / priority_score ajoutées par migrate ; ignore si absentes.
        let updated = conn.execute(
            "UPDATE threads SET tags = ?1, mailbox = ?2, mail_type = ?3, priority_score = ?4
             WHERE id = ?5 AND account_id = ?6",
            params![
                new_csv,
                mailbox,
                mail_type_s,
                priority.score,
                thread_id,
                account_id
            ],
        );
        match updated {
            Ok(_) => {}
            Err(_) => {
                conn.execute(
                    "UPDATE threads SET tags = ?1, mailbox = ?2 WHERE id = ?3 AND account_id = ?4",
                    params![new_csv, mailbox, thread_id, account_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(true)
}

/// Recalcule les tags pour une liste de fils (après déplacement de dossier).
pub fn org_retag_threads(
    conn: &Connection,
    account_id: &str,
    thread_ids: &[String],
) -> Result<usize, String> {
    if thread_ids.is_empty() {
        return Ok(0);
    }
    let rules = list_newsletter_rules_connection(conn).map_err(|e| e.to_string())?;
    let mut done = 0usize;
    for tid in thread_ids {
        let row = conn.query_row(
            "SELECT mailbox, subject, tags FROM threads WHERE id = ?1 AND account_id = ?2",
            params![tid, account_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        );
        let Ok((mailbox, subject, tags_csv)) = row else {
            continue;
        };
        if apply_retag_for_thread(
            conn, account_id, tid, &mailbox, &subject, &tags_csv, &rules, false,
        )? {
            done += 1;
        }
    }
    Ok(done)
}

pub fn org_retag_account(
    path: &Path,
    account_id: &str,
    dry_run: bool,
) -> Result<OrgApplyProgress, String> {
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let rules = list_newsletter_rules_connection(&conn).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT t.id, t.mailbox, t.subject, t.tags FROM threads t WHERE t.account_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String, String)> = stmt
        .query_map(params![account_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let total = rows.len();
    let mut done = 0usize;
    let mut errors = Vec::new();
    for (tid, mailbox, subject, tags_csv) in rows {
        match apply_retag_for_thread(
            &conn, account_id, &tid, &mailbox, &subject, &tags_csv, &rules, dry_run,
        ) {
            Ok(true) => done += 1,
            Ok(false) => {}
            Err(e) => errors.push(format!("{tid}: {e}")),
        }
    }
    Ok(OrgApplyProgress {
        done,
        total,
        message: if dry_run {
            format!("Simulation : {done} fil(s) seraient retagués sur {total}.")
        } else {
            format!("{done} fil(s) retagués sur {total}.")
        },
        errors,
        mailboxes_to_sync: Vec::new(),
        threads_affected: Vec::new(),
    })
}

fn thread_message_hints(
    conn: &Connection,
    account_id: &str,
    thread_id: &str,
) -> Result<(String, Vec<String>, bool, String), String> {
    let mut stmt = conn
        .prepare(
            "SELECT sender_email, detected_lang, COALESCE(body_plain, body), body_html, subject,
                    list_unsubscribe, unsubscribe_urls
             FROM messages
             WHERE thread_id = ?1 AND account_id = ?2
             ORDER BY position DESC LIMIT 5",
        )
        .map_err(|e| e.to_string())?;
    let mut sender = String::new();
    let mut langs = Vec::new();
    let mut unsub = false;
    let mut subject = String::new();
    let mut body_sample = String::new();
    let rows = stmt
        .query_map(params![thread_id, account_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        if sender.is_empty() {
            sender = row.0.clone();
        }
        let msg_subject = row.4.clone();
        if subject.is_empty() {
            subject = msg_subject.clone();
        }
        if let Some(l) = row.1 {
            if !langs.contains(&l) {
                langs.push(l);
            }
        }
        append_utf8_byte_sample(&mut body_sample, &row.2, 4000);
        if !crate::unsubscribe_detect::parse_unsubscribe_urls_json(row.6.as_deref()).is_empty() {
            unsub = true;
            continue;
        }
        if crate::unsubscribe_detect::message_has_unsubscribe_signal(
            row.5.as_deref(),
            &msg_subject,
            &row.2,
            row.3.as_deref(),
        ) {
            unsub = true;
        }
    }
    Ok((sender, langs, unsub, body_sample))
}

/// Migration one-shot : réécrit les `source:*` des fils déjà en base (idempotent).
pub fn migrate_canonical_thread_source_tags(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
    )?;
    let already: bool = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'canonical_source_tags_v1'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()?
        .as_deref()
        == Some("1");
    if already {
        return Ok(());
    }

    let mut stmt = conn.prepare("SELECT id, tags FROM threads WHERE tags LIKE '%source:%'")?;
    let rows: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e)?
        .filter_map(|r| r.ok())
        .collect();

    for (id, tags) in rows {
        let new_tags = rewrite_tags_csv_sources(&tags);
        if new_tags != tags {
            conn.execute(
                "UPDATE threads SET tags = ?1 WHERE id = ?2",
                params![new_tags, id],
            )?;
        }
    }

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('canonical_source_tags_v1', '1')",
        [],
    )?;
    Ok(())
}

/// Migration one-shot : aligne `state:attachment` sur les PJ réellement en base.
pub fn migrate_thread_attachment_state_tags(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
    )?;
    let already: bool = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'thread_attachment_state_v1'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()?
        .as_deref()
        == Some("1");
    if already {
        return Ok(());
    }

    let mut stmt = conn.prepare("SELECT id, account_id, tags FROM threads")?;
    let rows: Vec<(String, String, String)> = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e)?
        .filter_map(|r| r.ok())
        .collect();

    for (thread_id, account_id, tags_csv) in rows {
        let has = thread_has_attachments(conn, &account_id, &thread_id).unwrap_or(false);
        let has_tag = parse_tags(&tags_csv)
            .iter()
            .any(|t| t.family == TagFamily::State && t.value == "attachment");
        if has == has_tag {
            continue;
        }
        let mut tags = parse_tags(&tags_csv);
        tags.retain(|t| !(t.family == TagFamily::State && t.value == "attachment"));
        if has {
            let t = Tag::state("attachment");
            if !tags.contains(&t) {
                tags.push(t);
            }
        }
        let new_csv = tags
            .iter()
            .map(Tag::as_filter)
            .collect::<Vec<_>>()
            .join(",");
        conn.execute(
            "UPDATE threads SET tags = ?1 WHERE id = ?2 AND account_id = ?3",
            params![new_csv, thread_id, account_id],
        )?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('thread_attachment_state_v1', '1')",
        [],
    )?;
    Ok(())
}

pub fn thread_tags_stale(mailbox: &str, tags_csv: &str) -> bool {
    use crate::imap::ops::{mailbox_logical_path_key, mailbox_name_match_key};

    let mb_key = mailbox_logical_path_key(mailbox);
    let mb_nfc = mailbox_name_match_key(mailbox);
    let tags = parse_tags(tags_csv);
    let kind_mailboxes: Vec<_> = tags
        .iter()
        .filter(|t| {
            t.family == TagFamily::Kind
                && !t.value.starts_with("lang-")
                && !is_message_content_kind(&t.value)
                && t.value != "newsletter"
                && t.value != "transactional"
                && t.value != "notification"
                && t.value != "discussion"
                && t.value != "conversation"
        })
        .collect();
    if kind_mailboxes.len() > 1 {
        return true;
    }
    kind_mailboxes.first().is_some_and(|t| {
        mailbox_logical_path_key(&t.value) != mb_key
            && mailbox_name_match_key(&t.value) != mb_nfc
            && !t.value.eq_ignore_ascii_case(mailbox.trim())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn sender_is_transactional_billing_with_invoice_subject() {
        assert!(sender_is_transactional(
            "billing@shop.example",
            "Your invoice #42"
        ));
    }

    #[test]
    fn sender_is_transactional_orders_without_noreply() {
        assert!(sender_is_transactional(
            "orders@retailer.com",
            "Order confirmation"
        ));
    }

    #[test]
    fn sender_is_transactional_requires_subject_signal() {
        assert!(!sender_is_transactional("billing@shop.example", "Hello"));
        assert!(!sender_is_transactional(
            "hello@shop.example",
            "Your invoice"
        ));
    }

    #[test]
    fn retag_transactional_wins_over_newsletter_esp_domain() {
        use crate::newsletter::NewsletterRule;
        let rules = vec![NewsletterRule {
            domain: "sendgrid.net".into(),
            local_part: "*".into(),
        }];
        let csv = retag_csv_for_thread(
            "INBOX",
            "",
            "billing@notify.sendgrid.net",
            "Votre facture",
            "",
            &[],
            false,
            false,
            &rules,
        );
        assert!(csv.contains("kind:transactional"));
        assert!(!csv.contains("kind:newsletter"));
    }

    #[test]
    fn retag_adds_content_kind_from_subject() {
        let csv = retag_csv_for_thread(
            "INBOX",
            "",
            "billing@bank.com",
            "Votre facture",
            "",
            &[],
            false,
            false,
            &[],
        );
        assert!(csv.contains("kind:facture"));
        assert!(!thread_tags_stale("INBOX", &csv));
    }

    #[test]
    fn thread_tags_stale_only_on_conflicting_mailbox_kind() {
        assert!(!thread_tags_stale("INBOX", "source:imap,source:amazon.fr"));
        assert!(!thread_tags_stale(
            "INBOX",
            "kind:facture,kind:inbox,source:imap"
        ));
        assert!(thread_tags_stale("INBOX", "kind:archive,source:imap"));
        assert!(thread_tags_stale(
            "INBOX",
            "kind:archive,kind:INBOX,source:imap"
        ));
    }

    #[test]
    fn retag_drops_legacy_kind_tags() {
        let csv = retag_csv_for_thread(
            "INBOX",
            "kind:archive,kind:trash,source:imap",
            "a@b.com",
            "Hi",
            "",
            &[],
            false,
            false,
            &[],
        );
        assert!(csv.contains("kind:inbox"));
        assert!(!csv.contains("kind:archive"));
        assert!(!csv.contains("kind:trash"));
        assert!(!thread_tags_stale("INBOX", &csv));
    }

    #[test]
    fn thread_tags_stale_matches_logical_inbox_dot_path() {
        assert!(!thread_tags_stale(
            "INBOX.Archive.2025.01-janvier",
            "kind:inbox.archive.2025.01-janvier,source:imap"
        ));
    }

    #[test]
    fn thread_message_hints_scoped_to_account() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                account_id TEXT NOT NULL,
                sender_email TEXT NOT NULL,
                detected_lang TEXT,
                body TEXT NOT NULL,
                body_plain TEXT,
                body_html TEXT,
                subject TEXT NOT NULL,
                position INTEGER NOT NULL,
                list_unsubscribe TEXT,
                unsubscribe_urls TEXT
            );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO messages (id, thread_id, account_id, sender_email, body, subject, position)
             VALUES ('m1', 't-shared', 'acc-a', 'good@a.example', '', 'Sub A', 0),
                    ('m2', 't-shared', 'acc-b', 'leak@b.example', '', 'Sub B', 0)",
            [],
        )
        .unwrap();
        let (sender, _, _, _) = thread_message_hints(&conn, "acc-a", "t-shared").unwrap();
        assert_eq!(sender, "good@a.example");
    }

    #[test]
    fn migrate_canonical_thread_source_tags_rewrites_rows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, tags TEXT NOT NULL);
             CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO threads (id, tags) VALUES ('t1', 'source:imap,source:mail.shop.com,kind:inbox')",
            [],
        )
        .unwrap();
        migrate_canonical_thread_source_tags(&conn).unwrap();
        let tags: String = conn
            .query_row("SELECT tags FROM threads WHERE id = 't1'", [], |r| r.get(0))
            .unwrap();
        assert!(tags.contains("source:shop.com"));
        assert!(!tags.contains("mail.shop.com"));
        migrate_canonical_thread_source_tags(&conn).unwrap();
        let tags2: String = conn
            .query_row("SELECT tags FROM threads WHERE id = 't1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(tags, tags2);
    }

    #[test]
    fn retag_csv_uses_canonical_source_domain() {
        let csv = retag_csv_for_thread(
            "INBOX",
            "",
            "Shop <orders@mail.amazon.fr>",
            "Order shipped",
            "Your order has shipped",
            &[],
            false,
            false,
            &[],
        );
        assert!(csv.contains("source:amazon.fr"));
        assert!(!csv.contains("source:mail.amazon.fr"));
    }

    #[test]
    fn retag_csv_adds_and_removes_state_attachment() {
        let with = retag_csv_for_thread("INBOX", "", "a@b.com", "Hi", "", &[], false, true, &[]);
        assert!(with.contains("state:attachment"));
        let without =
            retag_csv_for_thread("INBOX", &with, "a@b.com", "Hi", "", &[], false, false, &[]);
        assert!(!without.contains("state:attachment"));
    }

    #[test]
    fn thread_has_attachments_scoped_to_account() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                account_id TEXT NOT NULL
            );
            CREATE TABLE message_attachments (
                id TEXT PRIMARY KEY,
                message_id TEXT NOT NULL
            );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO messages (id, thread_id, account_id) VALUES ('m1', 't1', 'acc-a'),
             ('m2', 't1', 'acc-b')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO message_attachments (id, message_id) VALUES ('a1', 'm2')",
            [],
        )
        .unwrap();
        assert!(!thread_has_attachments(&conn, "acc-a", "t1").unwrap());
        assert!(thread_has_attachments(&conn, "acc-b", "t1").unwrap());
    }

    #[test]
    fn migrate_thread_attachment_state_tags_aligns_rows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, tags TEXT NOT NULL);
             CREATE TABLE messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, account_id TEXT NOT NULL);
             CREATE TABLE message_attachments (id TEXT PRIMARY KEY, message_id TEXT NOT NULL);
             CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO threads (id, account_id, tags) VALUES ('t1', 'a1', 'source:imap,kind:inbox')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO messages (id, thread_id, account_id) VALUES ('m1', 't1', 'a1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO message_attachments (id, message_id) VALUES ('pj1', 'm1')",
            [],
        )
        .unwrap();
        migrate_thread_attachment_state_tags(&conn).unwrap();
        let tags: String = conn
            .query_row("SELECT tags FROM threads WHERE id = 't1'", [], |r| r.get(0))
            .unwrap();
        assert!(tags.contains("state:attachment"));
    }
}
