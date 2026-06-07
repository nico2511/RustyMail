//! Copie locale d’un message sortant après envoi SMTP pour l’affichage dans le fil (en attendant une synchro « Envoyés » IMAP).

use rusqlite::{params, OptionalExtension};
use rustymail_domain::{Draft, EmailAddress, Tag};
use std::path::Path;

use crate::{
    address_contacts::{upsert_contacts_from_addresses, upsert_contacts_from_message_row},
    lang_detect, open_sqlite_migrated, smtp_send::markdown_body_to_html,
};

fn normalize_msg_id_token(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.contains('<') && trimmed.contains('>') {
        return Some(trimmed.to_string());
    }
    Some(format!("<{trimmed}>"))
}

fn format_address_header(addrs: &[EmailAddress]) -> Option<String> {
    if addrs.is_empty() {
        return None;
    }
    let formatted: Vec<String> = addrs
        .iter()
        .map(|a| {
            let e = a.email.trim();
            if e.is_empty() {
                return String::new();
            }
            match &a.name {
                Some(n) if !n.trim().is_empty() => format!("{} <{}>", n.trim(), e),
                _ => e.to_string(),
            }
        })
        .filter(|s| !s.is_empty())
        .collect();
    if formatted.is_empty() {
        None
    } else {
        Some(formatted.join(", "))
    }
}

fn outbound_received_at_stamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Enregistre les PJ comme `message_attachments` (+ `content_blob`) pour l’aperçu / télécharger dans RustyMail.
fn insert_attachment_rows_from_paths(
    conn: &rusqlite::Connection,
    message_row_id: &str,
    paths: &[String],
) -> Result<(), String> {
    for raw in paths {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let path = Path::new(trimmed);
        if !path.is_file() {
            eprintln!(
                "[RustyMail] pré-enreg PJ ignorée (fichier absent): {}",
                path.display()
            );
            continue;
        }
        let data = std::fs::read(path).map_err(|e| format!("PJ locale {}: {e}", path.display()))?;
        let fname = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("attachment.bin")
            .to_string();
        let mime = mime_guess::from_path(path)
            .first_or_octet_stream()
            .to_string();
        let aid = format!("a-local-{}", uuid::Uuid::new_v4().simple());
        conn.execute(
            "
            INSERT INTO message_attachments (id, message_id, file_name, mime_type, size_bytes, kind, content_id, content_blob)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)
            ",
            params![
                aid,
                message_row_id,
                fname,
                mime,
                data.len() as i64,
                "regular",
                data,
            ],
        )
        .map_err(|e| format!("SQLite message_attachments: {e}"))?;
    }
    Ok(())
}

/// Ajoute au fil `thread_id` une ligne `messages` pour le message envoyé (idem style date que sync IMAP).
pub fn sqlite_record_sent_message_copy(
    db_path: impl AsRef<Path>,
    account_id: &str,
    thread_id: &str,
    draft: &Draft,
    message_id_header: &str,
    sender_name: &str,
    sender_email: &str,
) -> Result<(), String> {
    let tid = thread_id.trim();
    if tid.is_empty() {
        return Ok(());
    }
    let account_norm = account_id.trim();
    if account_norm.is_empty() {
        return Err("account_id vide pour l’envoi".to_string());
    }

    let mut connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;

    let belongs: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM threads WHERE id = ?1 AND account_id = ?2)",
            params![tid, account_norm],
            |row| row.get::<_, i64>(0).map(|n| n != 0),
        )
        .map_err(|e| e.to_string())?;
    if !belongs {
        return Err(format!(
            "Fil « {} » introuvable pour ce compte (copie envoyée non enregistrée).",
            tid
        ));
    }

    let mailbox_threads: Option<String> = connection
        .query_row(
            "SELECT mailbox FROM threads WHERE id = ?1 AND account_id = ?2 LIMIT 1",
            params![tid, account_norm],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mailbox_msgs: Option<String> = connection
        .query_row(
            "SELECT mailbox FROM messages WHERE thread_id = ?1 AND account_id = ?2 LIMIT 1",
            params![tid, account_norm],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mailbox_row = mailbox_threads
        .or(mailbox_msgs)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "INBOX".to_string());

    let outbound_mid_key = normalize_msg_id_token(message_id_header.trim()).unwrap_or_else(|| {
        let t = message_id_header.trim();
        t.to_string()
    });

    let duplicate_mid_in_thread = {
        let mut hdr_stmt = connection
            .prepare(
                "SELECT message_id_header FROM messages WHERE thread_id = ?1 AND account_id = ?2",
            )
            .map_err(|e| format!("SQLite (vérif Message-ID envoyé): {e}"))?;
        let mut hdr_rows = hdr_stmt
            .query(params![tid, account_norm])
            .map_err(|e| format!("SQLite (vérif Message-ID envoyé): {e}"))?;
        let mut dup = false;
        while let Some(row) = hdr_rows
            .next()
            .map_err(|e| format!("SQLite (vérif Message-ID envoyé): {e}"))?
        {
            let existing: Option<String> = row
                .get(0)
                .map_err(|e| format!("SQLite (vérif Message-ID envoyé): {e}"))?;
            let Some(stored) = existing else {
                continue;
            };
            let stored_key =
                normalize_msg_id_token(stored.trim()).unwrap_or_else(|| stored.trim().to_string());
            if stored_key == outbound_mid_key && !stored_key.is_empty() {
                dup = true;
                break;
            }
        }
        dup
    };

    if duplicate_mid_in_thread {
        return Ok(());
    }

    let row_id = format!(
        "m-local-sent-{}-{}",
        account_norm.replace(['/', '\\'], "-"),
        uuid::Uuid::new_v4().simple()
    );

    let max_position: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM messages WHERE thread_id = ?1",
            params![tid],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?;
    let position = max_position + 1;

    let received_at = outbound_received_at_stamp();
    let body_plain = draft.markdown_body.trim().to_string();
    let body_html = if draft.send_html {
        Some(markdown_body_to_html(&draft.markdown_body))
    } else {
        None
    };
    let to_header = format_address_header(&draft.to);
    let cc_header = format_address_header(&draft.cc);
    let in_reply_to = draft
        .in_reply_to
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let refs_joined = if draft.references.is_empty() {
        None
    } else {
        let line: String = draft
            .references
            .iter()
            .filter_map(|s| {
                let t = s.trim();
                (!t.is_empty()).then(|| t.to_string())
            })
            .collect::<Vec<_>>()
            .join(" ");
        (!line.is_empty()).then_some(line)
    };

    let mid_trim = normalize_msg_id_token(message_id_header.trim())
        .unwrap_or_else(|| message_id_header.trim().to_string());

    let lang_sample = format!(
        "{}\n{}",
        draft.subject.trim(),
        body_plain.chars().take(3000).collect::<String>()
    );
    let detected_lang = lang_detect::detect_language_iso639_1(&lang_sample);

    let transaction = connection
        .transaction()
        .map_err(|e| format!("SQLite transaction (copie envoyée): {e}"))?;
    transaction
        .execute(
            "
            INSERT INTO messages (
                id, thread_id, account_id, mailbox, imap_uid,
                sender_name, sender_email, subject, received_at,
                body, body_plain, body_html,
                message_id_header, in_reply_to, references_header,
                to_header, cc_header, reply_to_header,
                authentication_results, return_path,
                detected_lang,
                is_read, position
            ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8,
                ?9, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL,
                NULL, NULL, ?16,
                1, ?17)
            ",
            params![
                row_id,
                tid,
                account_norm,
                mailbox_row,
                sender_name,
                sender_email.to_ascii_lowercase().trim(),
                draft.subject.trim(),
                received_at,
                body_plain,
                body_html,
                mid_trim,
                in_reply_to,
                refs_joined,
                to_header,
                cc_header,
                detected_lang,
                position as i64,
            ],
        )
        .map_err(|e| format!("SQLite record sent message: {e}"))?;
    insert_attachment_rows_from_paths(&transaction, &row_id, &draft.attachment_paths)?;
    upsert_contacts_from_message_row(
        &transaction,
        account_norm,
        sender_name,
        sender_email,
        to_header.as_deref(),
        cc_header.as_deref(),
        None,
        &received_at,
    )
    .map_err(|e| format!("carnet adresses (envoi): {e}"))?;
    let mut outbound: Vec<EmailAddress> = draft.to.clone();
    outbound.extend(draft.cc.iter().cloned());
    upsert_contacts_from_addresses(&transaction, account_norm, &outbound, &received_at, "sent")
        .map_err(|e| format!("carnet adresses destinataires: {e}"))?;
    transaction
        .commit()
        .map_err(|e| format!("SQLite commit (copie envoyée): {e}"))?;

    let _ = crate::activity::record_message_sent_activity(
        db_path.as_ref(),
        account_norm,
        tid,
        &mailbox_row,
    );

    Ok(())
}

/// Crée un fil INBOX + le premier message (envoi « nouveau ») pour que la réponse IMAP se rattache via `In-Reply-To` / `References`.
/// Retourne l’identifiant du fil (même clé que la sync IMAP) pour chaîner des envois découpés.
pub fn sqlite_record_sent_starting_thread(
    db_path: impl AsRef<Path>,
    account_id: &str,
    draft: &Draft,
    message_id_header: &str,
    sender_name: &str,
    sender_email: &str,
) -> Result<String, String> {
    let account_norm = account_id.trim();
    if account_norm.is_empty() {
        return Err("account_id vide pour l’envoi".to_string());
    }
    let storage_mid = normalize_msg_id_token(message_id_header.trim())
        .ok_or_else(|| "Message-ID vide".to_string())?;

    let mut connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;

    let exists: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM messages WHERE account_id = ?1 AND message_id_header = ?2)",
            params![account_norm, storage_mid.trim()],
            |row| row.get::<_, i64>(0).map(|n| n != 0),
        )
        .map_err(|e| e.to_string())?;
    if exists {
        transaction.rollback().map_err(|e| e.to_string())?;
        let tid: Option<String> = connection
            .query_row(
                "SELECT thread_id FROM messages WHERE account_id = ?1 AND trim(message_id_header) = trim(?2) LIMIT 1",
                params![account_norm, storage_mid.trim()],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        return tid.ok_or_else(|| {
            "Message déjà enregistré localement sans fil associé (Message-ID en double)."
                .to_string()
        });
    }

    let mailbox = "INBOX";
    let thread_id = crate::threading::thread_id_for_root(account_norm, mailbox, storage_mid.trim());
    let tags = [Tag::source("imap"), Tag::kind(mailbox.to_ascii_lowercase())]
        .iter()
        .map(Tag::as_filter)
        .collect::<Vec<_>>()
        .join(",");

    transaction
        .execute(
            "
            INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![
                thread_id,
                account_norm,
                mailbox,
                storage_mid.trim(),
                draft.subject.trim(),
                tags
            ],
        )
        .map_err(|e| format!("SQLite thread (nouveau fil): {e}"))?;

    let row_id = format!(
        "m-local-sent-{}-{}",
        account_norm.replace(['/', '\\'], "-"),
        uuid::Uuid::new_v4().simple()
    );
    let received_at = outbound_received_at_stamp();
    let body_plain = draft.markdown_body.trim().to_string();
    let body_html = if draft.send_html {
        Some(markdown_body_to_html(&draft.markdown_body))
    } else {
        None
    };
    let to_header = format_address_header(&draft.to);
    let cc_header = format_address_header(&draft.cc);

    let lang_sample = format!(
        "{}\n{}",
        draft.subject.trim(),
        body_plain.chars().take(3000).collect::<String>()
    );
    let detected_lang = lang_detect::detect_language_iso639_1(&lang_sample);

    transaction
        .execute(
            "
            INSERT INTO messages (
                id, thread_id, account_id, mailbox, imap_uid,
                sender_name, sender_email, subject, received_at,
                body, body_plain, body_html,
                message_id_header, in_reply_to, references_header,
                to_header, cc_header, reply_to_header,
                authentication_results, return_path,
                detected_lang,
                is_read, position
            ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8,
                ?9, ?9, ?10, ?11, NULL, NULL, ?12, ?13, NULL,
                NULL, NULL, ?14,
                1, 0)
            ",
            params![
                row_id,
                thread_id,
                account_norm,
                mailbox,
                sender_name,
                sender_email.to_ascii_lowercase().trim(),
                draft.subject.trim(),
                received_at,
                body_plain,
                body_html,
                storage_mid.trim(),
                to_header,
                cc_header,
                detected_lang,
            ],
        )
        .map_err(|e| format!("SQLite message (nouveau fil): {e}"))?;

    insert_attachment_rows_from_paths(&transaction, &row_id, &draft.attachment_paths)?;

    transaction.commit().map_err(|e| e.to_string())?;
    Ok(thread_id)
}
