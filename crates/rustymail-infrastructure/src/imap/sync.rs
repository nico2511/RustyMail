use std::collections::{HashMap, HashSet};
use std::path::Path;

use async_imap::imap_proto::types::{Address, Envelope, MessageSection};
use async_imap::types::Flag;
use chrono::{SecondsFormat, Utc};
use futures::TryStreamExt;
use mailparse::{addrparse, parse_mail, MailHeaderMap, ParsedMail, SingleInfo};
use rusqlite::{params, OptionalExtension};

use rustymail_domain::{
    canonical_source_domain, host_of_email, Account, Attachment, AttachmentId, AttachmentKind,
    Message, MessageId, Tag, Thread, ThreadId,
};
use rustymail_modules::ai_tagging::infer_content_kind;

use super::ops::{
    decode_imap_mailbox_name, format_uid_set, imap_session_select_variants,
    list_selectable_mailbox_entries, mailbox_list_entry_by_match_key, mailbox_name_match_key,
    mailbox_select_variant_strings,
};
use super::session::{login_session_for_account, map_imap_error, ImapSession};
use crate::{
    account_imap_lock::acquire_account_imap_lock,
    address_contacts::upsert_contacts_from_message_row, ensure_imap_uid_validity,
    filter_tombstoned_uids, get_imap_last_uid, merge_thread_tag_csv, open_sqlite_migrated,
    set_imap_last_uid, text_sample::append_utf8_byte_sample, update_message_read_by_imap_uid,
};

const FETCH_BATCH: usize = 20;
const DEFAULT_LIMIT: usize = 80;
/// Recent UID window re-fetched each cycle for `\\Seen` / flag drift on already-synced messages.
const FLAG_RECONCILE_WINDOW: u32 = 500;

fn tags_for_thread(
    mailbox: &str,
    messages: &[Message],
    has_unsubscribe: bool,
    has_attachments: bool,
) -> Vec<Tag> {
    let mut tags = vec![Tag::source("imap"), Tag::kind(mailbox.to_ascii_lowercase())];
    if has_unsubscribe {
        let t = Tag::state("unsubscribe");
        if !tags.contains(&t) {
            tags.push(t);
        }
    }
    if has_attachments {
        let t = Tag::state("attachment");
        if !tags.contains(&t) {
            tags.push(t);
        }
    }
    let mut body_sample = String::new();
    for m in messages {
        if let Some(host) = host_of_email(&m.sender.email) {
            let d = canonical_source_domain(&host);
            let t = Tag::source(d);
            if !tags.contains(&t) {
                tags.push(t);
            }
        }
        if let Some(ref l) = m.detected_lang {
            if !l.is_empty() && l != "und" {
                let t = Tag::kind(format!("lang-{l}"));
                if !tags.contains(&t) {
                    tags.push(t);
                }
            }
        }
        append_utf8_byte_sample(&mut body_sample, &m.plain_body, 4000);
    }
    let subject = messages.last().map(|m| m.subject.as_str()).unwrap_or("");
    if let Some(kind) = infer_content_kind(subject, &body_sample) {
        let t = Tag::kind(kind);
        if !tags.contains(&t) {
            tags.push(t);
        }
    }
    tags
}

fn header_value(headers: &[mailparse::MailHeader], name: &str) -> Option<String> {
    headers
        .get_first_header(name)
        .map(|header| {
            let value = header.get_value();
            value.trim().to_string()
        })
        .filter(|value| !value.is_empty())
}

fn first_address(from_header: &str) -> Option<SingleInfo> {
    let list = addrparse(from_header).ok()?;
    for addr in list.iter() {
        if let mailparse::MailAddr::Single(single) = addr {
            return Some(single.clone());
        }
    }
    None
}

fn parse_address_list(header: &str) -> Vec<rustymail_domain::EmailAddress> {
    let mut out = Vec::new();
    if let Ok(list) = addrparse(header) {
        for addr in list.iter() {
            if let mailparse::MailAddr::Single(single) = addr {
                let email = single.addr.trim().to_ascii_lowercase();
                if email.is_empty() {
                    continue;
                }
                if out.iter().any(|existing: &rustymail_domain::EmailAddress| {
                    existing.email.eq_ignore_ascii_case(&email)
                }) {
                    continue;
                }
                out.push(rustymail_domain::EmailAddress {
                    name: single.display_name.clone(),
                    email,
                });
            }
        }
    }
    out
}

fn bytes_to_str(input: Option<&[u8]>) -> Option<String> {
    input
        .and_then(|raw| std::str::from_utf8(raw).ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(std::string::ToString::to_string)
}

fn imap_address_email(addr: &Address) -> Option<String> {
    let local = bytes_to_str(addr.mailbox.as_deref().map(|c| c.as_ref()))?;
    let host = bytes_to_str(addr.host.as_deref().map(|c| c.as_ref()))?;
    Some(format!("{local}@{host}").to_ascii_lowercase())
}

fn imap_envelope_from(envelope: &Envelope) -> (Option<String>, String) {
    if let Some(list) = &envelope.from {
        if let Some(addr) = list.first() {
            let name = addr
                .name
                .as_deref()
                .and_then(|raw| std::str::from_utf8(raw).ok().map(String::from));
            let email = imap_address_email(addr).unwrap_or_else(|| "unknown@invalid".to_string());
            return (name, email);
        }
    }
    (None, "unknown@invalid".to_string())
}

fn pick_plain_body(part: &ParsedMail) -> Option<String> {
    let mimetype = part.ctype.mimetype.to_ascii_lowercase();
    if mimetype.starts_with("text/plain") {
        return part.get_body().ok();
    }
    for sub in &part.subparts {
        if let Some(body) = pick_plain_body(sub) {
            return Some(body);
        }
    }
    None
}

fn pick_htmlish_body(part: &ParsedMail) -> Option<String> {
    let mimetype = part.ctype.mimetype.to_ascii_lowercase();
    if mimetype.starts_with("text/html") {
        return part.get_body().ok();
    }
    for sub in &part.subparts {
        if let Some(body) = pick_htmlish_body(sub) {
            return Some(body);
        }
    }
    None
}

fn extract_bodies(mail: &ParsedMail) -> (String, Option<String>) {
    let plain = pick_plain_body(mail).unwrap_or_else(|| "".to_string());
    let html = pick_htmlish_body(mail);
    (plain, html)
}

fn normalize_content_id(raw: &str) -> String {
    raw.trim()
        .trim_matches(|c| c == '<' || c == '>')
        .to_ascii_lowercase()
}

/// Bloc multipart image référencé par `<img src="cid:…">`, souvent sans `filename`.
fn extract_attachments(
    mail: &ParsedMail,
    account_id: &str,
    mailbox: &str,
    uid: u32,
    out: &mut Vec<Attachment>,
    blobs: &mut HashMap<String, Vec<u8>>,
) {
    let cdisp = mail.get_content_disposition();
    let disposition = match cdisp.disposition {
        mailparse::DispositionType::Attachment => "attachment",
        mailparse::DispositionType::Inline => "inline",
        _ => "",
    };
    let mut file_name = cdisp.params.get("filename").cloned().unwrap_or_default();
    if file_name.trim().is_empty() {
        file_name = mail.ctype.params.get("name").cloned().unwrap_or_default();
    }
    let mime = mail.ctype.mimetype.to_ascii_lowercase();
    let content_id_storage = mail
        .headers
        .get_first_header("Content-Id")
        .map(|header| normalize_content_id(&header.get_value()))
        .filter(|s| !s.is_empty());
    let is_attachment = disposition == "attachment" || !file_name.trim().is_empty();
    let is_inline_named = disposition == "inline" && !file_name.trim().is_empty();
    let cid_inline_image =
        content_id_storage.is_some() && mime.starts_with("image/") && mime != "message/rfc822";

    let take_part = is_attachment || is_inline_named || cid_inline_image;

    if take_part {
        let body_raw = mail.get_body_raw().unwrap_or_default();
        let raw_size = body_raw.len();
        let scope = format!(
            "{}-{}",
            sanitize_attachment_id_segment(account_id),
            sanitize_attachment_id_segment(mailbox)
        );
        let att_id = format!("att-{scope}-{uid}-{}", out.len() + 1);

        let display_name = if !file_name.trim().is_empty() {
            file_name.trim().to_string()
        } else if let Some(cid) = content_id_storage.as_ref() {
            format!(
                "{}.{}",
                cid.replace('/', "_"),
                mime.split_once('/').map(|(_, s)| s).unwrap_or("img")
            )
        } else {
            "attachment".to_string()
        };

        let kind = if is_inline_named || cid_inline_image {
            AttachmentKind::Inline
        } else {
            AttachmentKind::Regular
        };

        out.push(Attachment {
            id: AttachmentId(att_id.clone()),
            file_name: display_name,
            mime_type: if mime.is_empty() {
                "application/octet-stream".to_string()
            } else {
                mime.clone()
            },
            size_bytes: raw_size as u64,
            kind,
            content_id: content_id_storage.clone(),
        });
        blobs.insert(att_id, body_raw);
    }
    for sub in &mail.subparts {
        extract_attachments(sub, account_id, mailbox, uid, out, blobs);
    }
}

fn sanitize_attachment_id_segment(raw: &str) -> String {
    let out: String = raw
        .trim()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(80)
        .collect();
    if out.is_empty() {
        "scope".into()
    } else {
        out
    }
}

/// Opening `<tag ...>` where `tag` is a full ASCII name (`style` must not match `stylesheet`).
fn find_open_tag_start(html: &str, tag: &[u8]) -> Option<usize> {
    let b = html.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] != b'<' {
            i += 1;
            continue;
        }
        if b.get(i..i.saturating_add(4)) == Some(b"<!--") {
            if let Some(rel) = html[i..].find("-->") {
                i += rel + 3;
                continue;
            }
        }
        let mut j = i + 1;
        while j < b.len() && b[j].is_ascii_whitespace() {
            j += 1;
        }
        if b.get(j) == Some(&b'/') {
            i += 1;
            continue;
        }
        let name_start = j;
        let mut k = 0;
        while k < tag.len() && name_start + k < b.len() {
            if !b[name_start + k].eq_ignore_ascii_case(&tag[k]) {
                break;
            }
            k += 1;
        }
        if k == tag.len() {
            let after = name_start + k;
            if let Some(&next) = b.get(after) {
                if next.is_ascii_alphanumeric() || next == b'-' {
                    i += 1;
                    continue;
                }
            }
            return Some(i);
        }
        i += 1;
    }
    None
}

fn open_tag_gt_exclusive(html: &str, lt: usize) -> Option<usize> {
    html[lt..].find('>').map(|d| lt + d + 1)
}

/// End byte index after `</tag>` (exclusive), searching after `search_from`.
fn find_close_tag_end(html: &str, tag: &[u8], search_from: usize) -> Option<usize> {
    let sbytes = html[search_from..].as_bytes();
    let mut i = 0;
    while i + 2 + tag.len() <= sbytes.len() {
        if sbytes[i] == b'<' && sbytes[i + 1] == b'/' {
            let name_start = i + 2;
            let mut k = 0;
            while k < tag.len() && name_start + k < sbytes.len() {
                if !sbytes[name_start + k].eq_ignore_ascii_case(&tag[k]) {
                    break;
                }
                k += 1;
            }
            if k == tag.len() {
                let after_name = name_start + k;
                if let Some(&next) = sbytes.get(after_name) {
                    if next.is_ascii_alphanumeric() || next == b'-' {
                        i += 1;
                        continue;
                    }
                }
                let abs = search_from + i;
                return html[abs..].find('>').map(|k| abs + k + 1);
            }
        }
        i += 1;
    }
    None
}

/// Newsletter HTML often puts large CSS in `<style>`; naïve tag-stripping keeps that text. Remove
/// subdocuments that are not meant to appear as body copy before building the inbox preview.
fn strip_non_body_html_blocks(html: &str) -> String {
    let mut html = html.to_string();
    const TAGS: [&[u8]; 3] = [b"style", b"script", b"noscript"];
    for _ in 0..256u16 {
        let mut pick: Option<(usize, &[u8])> = None;
        for tag in TAGS {
            if let Some(s) = find_open_tag_start(&html, tag) {
                pick = Some(match pick {
                    None => (s, tag),
                    Some((best, _)) if s < best => (s, tag),
                    Some(prev) => prev,
                });
            }
        }
        let Some((start, tag)) = pick else {
            break;
        };
        let Some(open_end) = open_tag_gt_exclusive(&html, start) else {
            html.truncate(start);
            break;
        };
        let Some(close_end) = find_close_tag_end(&html, tag, open_end) else {
            html.truncate(start);
            break;
        };
        html.replace_range(start..close_end, "");
    }
    html
}

fn extract_preview_body(plain: &str, html: Option<&str>) -> String {
    if !plain.trim().is_empty() {
        return plain.to_string();
    }
    if let Some(html) = html {
        let html = strip_non_body_html_blocks(html);
        // Minimal strip for preview; full HTML rendering is not part of this slice.
        let mut s = String::new();
        let mut in_tag = false;
        for ch in html.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => s.push(ch),
                _ => {}
            }
        }
        let t = s.split_whitespace().collect::<Vec<_>>().join(" ");
        if t.is_empty() {
            return "(message HTML, stripped for import)".to_string();
        }
        return t;
    }
    "".to_string()
}

fn subject_from_parsed(subject: &str) -> String {
    let s = subject.trim();
    if s.is_empty() {
        "(no subject)".to_string()
    } else {
        s.to_string()
    }
}

fn imap_envelope_subject(envelope: &Envelope) -> String {
    if let Some(raw) = envelope.subject.as_deref() {
        if let Ok(s) = std::str::from_utf8(raw.as_ref()) {
            return subject_from_parsed(s);
        }
    }
    "(no subject)".to_string()
}

// Old subject-hash threading removed in favor of stable threading via headers.

fn is_seen<'a>(flags: impl Iterator<Item = Flag<'a>>) -> bool {
    for flag in flags {
        if flag == Flag::Seen {
            return true;
        }
    }
    false
}

fn extract_msg_ids(header_value: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let mut in_angle = false;
    let mut buf = String::new();
    for ch in header_value.chars() {
        if ch == '<' {
            in_angle = true;
            buf.clear();
            buf.push(ch);
            continue;
        }
        if in_angle {
            buf.push(ch);
            if ch == '>' {
                let trimmed = buf.trim().to_string();
                if trimmed.len() >= 3 {
                    ids.push(trimmed);
                }
                in_angle = false;
                buf.clear();
            }
        }
    }
    if ids.is_empty() {
        // Fallback: whitespace split (some servers omit <>).
        ids = header_value
            .split_whitespace()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    ids
}

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

fn first_msg_id_from_header(value: Option<String>) -> Option<String> {
    let raw = value?;
    let ids = extract_msg_ids(&raw);
    ids.first()
        .cloned()
        .or_else(|| normalize_msg_id_token(&raw))
}

/// Trouve un fil existant pour ce `Message-ID`, sur **tous** les dossiers du compte.
/// Une réponse en boîte de réception doit pouvoir se rattacher au premier message enregistré
/// seulement dans « Envoyés » (ou à une copie locale `INBOX` sans UID) — pas seulement au dossier en cours de sync.
fn lookup_thread_id_by_message_id_for_account(
    db_path: &Path,
    account_id: &str,
    message_id_header: &str,
) -> Option<String> {
    let conn = crate::open_sqlite_migrated(db_path).ok()?;
    let normalized = normalize_msg_id_token(message_id_header)
        .unwrap_or_else(|| message_id_header.trim().to_string());
    let account_trim = account_id.trim();
    conn.query_row(
        "
        SELECT thread_id
        FROM messages
        WHERE account_id = ?1
          AND message_id_header = ?2
        LIMIT 1
        ",
        params![account_trim, normalized],
        |row| row.get::<_, String>(0),
    )
    .ok()
}

fn pick_existing_thread_id_from_refs(
    db_path: &Path,
    account_id: &str,
    _mailbox: &str,
    in_reply_to: Option<&str>,
    references: &[String],
) -> Option<String> {
    // Références / In-Reply-To : tout message déjà importé (n’importe quel dossier) suffit pour réutiliser le même thread_id.
    for r in references.iter().take(12) {
        if let Some(tid) = lookup_thread_id_by_message_id_for_account(db_path, account_id, r) {
            return Some(tid);
        }
    }
    if let Some(ir) = in_reply_to {
        if let Some(tid) = lookup_thread_id_by_message_id_for_account(db_path, account_id, ir) {
            return Some(tid);
        }
    }
    None
}

fn thread_root_from_headers(
    message_id: Option<&str>,
    in_reply_to: Option<&str>,
    references: &[String],
) -> Option<String> {
    if let Some(first) = references.first() {
        return Some(first.clone());
    }
    if let Some(ir) = in_reply_to.map(str::trim).filter(|s| !s.is_empty()) {
        return Some(ir.to_string());
    }
    message_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn normalize_subject_for_threading(subject: &str) -> Option<String> {
    let mut current = subject.trim().to_ascii_lowercase();
    if current.is_empty() || current == "(no subject)" {
        return None;
    }
    loop {
        let trimmed = current.trim_start();
        let next = if let Some(rest) = trimmed.strip_prefix("re:") {
            Some(rest)
        } else if let Some(rest) = trimmed.strip_prefix("fwd:") {
            Some(rest)
        } else if let Some(rest) = trimmed.strip_prefix("fw:") {
            Some(rest)
        } else {
            None
        };
        match next {
            Some(rest) => current = rest.trim_start().to_string(),
            None => break,
        }
    }
    let collapsed = current.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        None
    } else {
        Some(collapsed)
    }
}

fn participants_key(
    sender_email: &str,
    recipients: &[rustymail_domain::EmailAddress],
    account_email: &str,
) -> String {
    let mut participants = Vec::new();
    let sender = sender_email.trim().to_ascii_lowercase();
    if !sender.is_empty() {
        participants.push(sender);
    }
    for recipient in recipients {
        let email = recipient.email.trim().to_ascii_lowercase();
        if email.is_empty() || participants.iter().any(|existing| existing == &email) {
            continue;
        }
        participants.push(email);
    }
    if participants.is_empty() {
        participants.push(account_email.trim().to_ascii_lowercase());
    }
    participants.sort_unstable();
    participants.join("|")
}

fn thread_id_for_root(account_id: &str, mailbox: &str, root: &str) -> String {
    crate::threading::thread_id_for_root(account_id, mailbox, root)
}

fn pick_thread_id_for_imported_message(
    db_path: &Path,
    account_id: &str,
    mailbox: &str,
    message_id_header: Option<&str>,
    in_reply_to: Option<&str>,
    references: &[String],
    thread_root: &str,
) -> String {
    pick_existing_thread_id_from_refs(db_path, account_id, mailbox, in_reply_to, references)
        .or_else(|| {
            message_id_header.and_then(|mid| {
                lookup_thread_id_by_message_id_for_account(db_path, account_id, mid)
            })
        })
        .unwrap_or_else(|| thread_id_for_root(account_id, mailbox, thread_root))
}

fn serde_skip_false(v: &bool) -> bool {
    !*v
}

fn serde_skip_zero_usize(v: &usize) -> bool {
    *v == 0
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImapSyncResult {
    pub mailbox: String,
    pub message_count: usize,
    pub thread_count: usize,
    pub fetched_uids: usize,
    #[serde(default, skip_serializing_if = "serde_skip_false")]
    pub uid_validity_reset: bool,
    #[serde(default, skip_serializing_if = "serde_skip_zero_usize")]
    pub flags_reconciled: usize,
    /// UIDs présents en SQLite mais absents du serveur (MOVE/delete externe).
    #[serde(default, skip_serializing_if = "serde_skip_zero_usize")]
    pub uids_pruned: usize,
}

/// When LIST and the sidebar disagree on apostrophes/normalization but map to one folder.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMailboxAlias {
    pub requested: String,
    pub synced_as: String,
}

/// A single mailbox sync failed after `SELECT`/fetch (other mailboxes may still have succeeded).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailboxSyncError {
    pub mailbox: String,
    pub error: String,
}

#[derive(Debug)]
struct PlannedMailboxSync {
    /// Name shown in the sidebar / original request.
    requested: String,
    /// `SELECT` attempts in order (LIST wire, decoded, UTF-7, sidebar spellings…).
    select_variants: Vec<String>,
}

/// Plus petit = synchronisé en premier : les dossiers d’envoi doivent être en base avant la boîte de réception
/// pour que `In-Reply-To` / `References` retrouvent le `Message-ID` du premier message (souvent seulement dans Envoyés).
fn mailbox_sync_priority_bucket(first_select_name: &str) -> u8 {
    let n = decode_imap_mailbox_name(first_select_name).to_ascii_lowercase();
    if n.contains("sent") || n.contains("envoy") || n.contains("outbox") {
        return 0;
    }
    if n.contains("draft") || n.contains("brouillon") {
        return 1;
    }
    if n == "inbox" || n.ends_with("/inbox") {
        return 10;
    }
    5
}

/// Result of syncing several mailboxes in one IMAP session; folders missing on the server are skipped.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMailboxesOutcome {
    pub results: Vec<ImapSyncResult>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skipped_not_on_server: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub synced_mailbox_aliases: Vec<SyncMailboxAlias>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sync_errors: Vec<MailboxSyncError>,
}

pub async fn sync_inbox(
    db_path: impl AsRef<Path> + Send,
    account: &Account,
    mailbox: &str,
    limit: Option<usize>,
) -> Result<ImapSyncResult, String> {
    let _lock = acquire_account_imap_lock(&account.id.0).await;
    let limit = limit.unwrap_or(DEFAULT_LIMIT).max(1);
    let mut session = login_session_for_account(account).await?;
    let dec = decode_imap_mailbox_name(mailbox);
    let variants = mailbox_select_variant_strings(mailbox, &dec, Some(mailbox));
    let result = sync_mailbox_with_session(
        db_path.as_ref(),
        account,
        &mut session,
        &variants,
        mailbox,
        Some(limit),
        None,
    )
    .await;
    let _ = session.logout().await;
    result
}

pub async fn sync_mailboxes_single_session(
    db_path: impl AsRef<Path> + Send,
    account: &Account,
    mailboxes: &[String],
    limit_per_mailbox: Option<usize>,
) -> Result<SyncMailboxesOutcome, String> {
    let _lock = acquire_account_imap_lock(&account.id.0).await;
    sync_mailboxes_single_session_locked(db_path, account, mailboxes, limit_per_mailbox).await
}

async fn sync_mailboxes_single_session_locked(
    db_path: impl AsRef<Path> + Send,
    account: &Account,
    mailboxes: &[String],
    limit_per_mailbox: Option<usize>,
) -> Result<SyncMailboxesOutcome, String> {
    let mut uniq: Vec<String> = mailboxes
        .iter()
        .map(|m| m.to_string())
        .filter(|m| !m.trim().is_empty())
        .collect();
    uniq.sort();
    uniq.dedup();
    if uniq.is_empty() {
        return Ok(SyncMailboxesOutcome {
            results: Vec::new(),
            skipped_not_on_server: Vec::new(),
            synced_mailbox_aliases: Vec::new(),
            sync_errors: Vec::new(),
        });
    }

    let mut session = login_session_for_account(account).await?;
    let selectable_entries = list_selectable_mailbox_entries(&mut session).await?;
    let server_mailbox_list: Vec<String> = selectable_entries
        .iter()
        .map(|e| e.decoded_name.clone())
        .collect();
    let canon_entries = mailbox_list_entry_by_match_key(&selectable_entries);

    let mut skipped: Vec<String> = Vec::new();
    let mut select_plan: Vec<PlannedMailboxSync> = Vec::new();
    let mut queued_folder_keys = HashSet::new();

    for m in uniq {
        let mk = mailbox_name_match_key(&m);
        let planned_opt = match canon_entries.get(&mk) {
            Some(entry) => {
                let variants = mailbox_select_variant_strings(
                    &entry.raw_list_name,
                    &entry.decoded_name,
                    Some(&m),
                );
                Some(PlannedMailboxSync {
                    requested: m.clone(),
                    select_variants: variants,
                })
            }
            None => {
                let variants =
                    mailbox_select_variant_strings(&m, &decode_imap_mailbox_name(&m), Some(&m));
                match imap_session_select_variants(
                    &mut session,
                    &variants,
                    Some(&server_mailbox_list),
                )
                .await
                {
                    Ok(_) => Some(PlannedMailboxSync {
                        requested: m.clone(),
                        select_variants: variants,
                    }),
                    Err(_) => {
                        skipped.push(m);
                        None
                    }
                }
            }
        };
        let Some(planned) = planned_opt else {
            continue;
        };
        let key = match canon_entries.get(&mk) {
            Some(e) => mailbox_name_match_key(&e.decoded_name),
            None => mk,
        };
        if queued_folder_keys.insert(key) {
            select_plan.push(planned);
        }
    }

    select_plan.sort_by(|a, b| {
        let a_key = a.select_variants.first().map(|s| s.as_str()).unwrap_or("");
        let b_key = b.select_variants.first().map(|s| s.as_str()).unwrap_or("");
        mailbox_sync_priority_bucket(a_key)
            .cmp(&mailbox_sync_priority_bucket(b_key))
            .then_with(|| a.requested.cmp(&b.requested))
    });

    skipped.sort();

    if select_plan.is_empty() {
        let _ = session.logout().await;
        return Err(format!(
            "Aucun dossier demandé n’existe sur le serveur : {}.",
            skipped.join(", ")
        ));
    }

    let mut out = Vec::new();
    let mut aliases: Vec<SyncMailboxAlias> = Vec::new();
    let mut sync_errors: Vec<MailboxSyncError> = Vec::new();
    let list_for_select = server_mailbox_list.as_slice();
    for plan in select_plan {
        match sync_mailbox_with_session(
            db_path.as_ref(),
            account,
            &mut session,
            &plan.select_variants,
            &plan.requested,
            limit_per_mailbox,
            Some(list_for_select),
        )
        .await
        {
            Ok(res) => {
                if mailbox_name_match_key(&res.mailbox) != mailbox_name_match_key(&plan.requested) {
                    aliases.push(SyncMailboxAlias {
                        requested: plan.requested.clone(),
                        synced_as: res.mailbox.clone(),
                    });
                }
                out.push(res);
            }
            Err(error) => {
                sync_errors.push(MailboxSyncError {
                    mailbox: plan.requested.clone(),
                    error,
                });
            }
        }
    }
    let _ = session.logout().await;
    Ok(SyncMailboxesOutcome {
        results: out,
        skipped_not_on_server: skipped,
        synced_mailbox_aliases: aliases,
        sync_errors,
    })
}

async fn sync_mailbox_with_session(
    db_path: &Path,
    account: &Account,
    session: &mut ImapSession,
    select_variants: &[String],
    _requested_display: &str,
    limit: Option<usize>,
    server_mailbox_list: Option<&[String]>,
) -> Result<ImapSyncResult, String> {
    if select_variants.is_empty() {
        return Err("IMAP: mailbox is empty".to_string());
    }
    let limit = limit.unwrap_or(DEFAULT_LIMIT).max(1);
    let (mbox, selected_wire) =
        imap_session_select_variants(session, select_variants, server_mailbox_list).await?;
    let mailbox = decode_imap_mailbox_name(&selected_wire);
    if mailbox.is_empty() {
        return Err("IMAP: mailbox is empty".to_string());
    }
    let uid_validity_reset =
        ensure_imap_uid_validity(db_path, &account.id.0, &mailbox, mbox.uid_validity)?;
    let last_uid = get_imap_last_uid(db_path, &account.id.0, &mailbox)?;
    let mut uids: Vec<async_imap::types::Uid> = session
        .uid_search(format!("UID {}:*", last_uid.saturating_add(1)))
        .await
        .map_err(map_imap_error)?
        .into_iter()
        .collect();
    uids.sort_unstable();
    if uids.len() > limit {
        let start = uids.len() - limit;
        uids = uids[start..].to_vec();
    }
    // Ne pas réinsérer des UIDs récemment déplacés/supprimés (course sync ↔ MOVE).
    {
        let mut uid_nums: Vec<u32> = uids.iter().copied().map(|u| u.into()).collect();
        let skipped = filter_tombstoned_uids(db_path, &account.id.0, &mailbox, &mut uid_nums)?;
        if skipped > 0 {
            log::info!(
                target: "rustymail::audit",
                "imap_sync: skipped {skipped} tombstoned UID(s) account={} mailbox={}",
                account.id.0,
                mailbox
            );
            let keep: HashSet<u32> = uid_nums.into_iter().collect();
            uids.retain(|u| keep.contains(&u32::from(*u)));
        }
    }

    // Purge les UIDs locaux absents du serveur (MOVE/delete hors app, EXPUNGE…).
    let uids_pruned =
        prune_vanished_mailbox_uids(db_path, &account.id.0, &mailbox, session).await?;

    if uids.is_empty() {
        let flags_reconciled =
            reconcile_recent_flags(db_path, &account.id.0, &mailbox, session, last_uid).await?;
        return Ok(ImapSyncResult {
            mailbox: mailbox.to_string(),
            message_count: 0,
            thread_count: 0,
            fetched_uids: 0,
            uid_validity_reset,
            flags_reconciled,
            uids_pruned,
        });
    }

    let query = "(UID ENVELOPE INTERNALDATE FLAGS BODY.PEEK[] BODY.PEEK[TEXT])";
    let mut fetches: Vec<async_imap::types::Fetch> = Vec::new();
    for chunk in uids.chunks(FETCH_BATCH) {
        let mut set = String::new();
        for (index, uid) in chunk.iter().enumerate() {
            if index > 0 {
                set.push(',');
            }
            set.push_str(&uid.to_string());
        }
        let stream = session
            .uid_fetch(&set, query)
            .await
            .map_err(map_imap_error)?;
        let part: Vec<async_imap::types::Fetch> =
            stream.try_collect().await.map_err(map_imap_error)?;
        fetches.extend(part);
    }

    let mut by_thread: HashMap<String, (String, Option<String>, Vec<Message>, bool)> =
        HashMap::new();
    let mut message_headers: HashMap<String, (Option<String>, Option<String>, Option<String>)> =
        HashMap::new();
    let mut message_unsub_index: HashMap<String, (Option<String>, String)> = HashMap::new();
    let mut attachment_blobs: HashMap<String, Vec<u8>> = HashMap::new();
    for fetch in fetches {
        let uid = fetch
            .uid
            .ok_or_else(|| "IMAP: fetch missing UID".to_string())?;
        let seen = is_seen(fetch.flags());
        let internal = fetch
            .internal_date()
            .map(|date| {
                date.with_timezone(&Utc)
                    .to_rfc3339_opts(SecondsFormat::Secs, true)
            })
            .unwrap_or_else(|| "—".to_string());

        let body_bytes = fetch.body().or_else(|| {
            fetch.section(&async_imap::imap_proto::types::SectionPath::Full(
                MessageSection::Text,
            ))
        });
        let (
            subject,
            from_name,
            from_email,
            recipients,
            to_header,
            cc_header,
            reply_to_header,
            body_plain,
            body_html,
            attachments,
            message_id_header,
            in_reply_to,
            references,
            authentication_results,
            return_path,
            list_unsubscribe,
        ) = if let Some(bytes) = body_bytes {
            let mail = parse_mail(bytes).map_err(|error| error.to_string())?;
            let subject = header_value(&mail.headers, "Subject")
                .as_deref()
                .map(subject_from_parsed)
                .or_else(|| {
                    fetch
                        .envelope()
                        .map(|envelope| imap_envelope_subject(envelope))
                })
                .unwrap_or_else(|| "(no subject)".to_string());
            let (name, email) = if let Some(fh) = header_value(&mail.headers, "From") {
                if let Some(single) = first_address(&fh) {
                    (single.display_name, single.addr.trim().to_ascii_lowercase())
                } else {
                    fetch
                        .envelope()
                        .map(|envelope| imap_envelope_from(envelope))
                        .unwrap_or((None, "unknown@invalid".to_string()))
                }
            } else {
                fetch
                    .envelope()
                    .map(|envelope| imap_envelope_from(envelope))
                    .unwrap_or((None, "unknown@invalid".to_string()))
            };
            let message_id_header =
                header_value(&mail.headers, "Message-ID").and_then(|v| normalize_msg_id_token(&v));
            let in_reply_to = first_msg_id_from_header(header_value(&mail.headers, "In-Reply-To"));
            let references_header = header_value(&mail.headers, "References");
            let to_header = header_value(&mail.headers, "To");
            let cc_header = header_value(&mail.headers, "Cc");
            let reply_to_header = header_value(&mail.headers, "Reply-To");
            let authentication_results = header_value(&mail.headers, "Authentication-Results");
            let return_path = header_value(&mail.headers, "Return-Path");
            let parsed_headers: Vec<(String, String)> = mail
                .headers
                .iter()
                .map(|h| (h.get_key().to_string(), h.get_value()))
                .collect();
            let list_unsubscribe =
                if crate::unsubscribe_detect::list_unsubscribe_header_present(&parsed_headers) {
                    header_value(&mail.headers, "List-Unsubscribe")
                        .or_else(|| header_value(&mail.headers, "List-Unsubscribe-Post"))
                } else {
                    None
                };
            let references = references_header
                .as_deref()
                .map(extract_msg_ids)
                .unwrap_or_default();
            let mut recipients = Vec::new();
            if let Some(h) = to_header.as_deref() {
                recipients.extend(parse_address_list(h));
            }
            if let Some(h) = cc_header.as_deref() {
                for cc in parse_address_list(h) {
                    if recipients
                        .iter()
                        .any(|existing: &rustymail_domain::EmailAddress| {
                            existing.email.eq_ignore_ascii_case(&cc.email)
                        })
                    {
                        continue;
                    }
                    recipients.push(cc);
                }
            }
            let (body_plain, body_html) = extract_bodies(&mail);
            let mut attachments = Vec::new();
            extract_attachments(
                &mail,
                &account.id.0,
                &mailbox,
                uid,
                &mut attachments,
                &mut attachment_blobs,
            );
            (
                subject,
                name,
                email,
                recipients,
                to_header,
                cc_header,
                reply_to_header,
                body_plain,
                body_html,
                attachments,
                message_id_header,
                in_reply_to,
                references,
                authentication_results,
                return_path,
                list_unsubscribe,
            )
        } else {
            let env = fetch
                .envelope()
                .ok_or_else(|| format!("IMAP: missing body and envelope (uid {uid})"))?;
            let (name, email) = imap_envelope_from(env);
            let subj = imap_envelope_subject(env);
            (
                subj,
                name,
                email,
                Vec::new(),
                None,
                None,
                None,
                String::new(),
                None,
                Vec::new(),
                None,
                None,
                Vec::new(),
                None,
                None,
                None,
            )
        };

        let unsub_signal = crate::unsubscribe_detect::message_has_unsubscribe_signal(
            list_unsubscribe.as_deref(),
            &subject,
            &body_plain,
            body_html.as_deref(),
        );

        let header_root = thread_root_from_headers(
            message_id_header.as_deref(),
            in_reply_to.as_deref(),
            &references,
        );
        let thread_root = if let Some(root) = header_root {
            root
        } else if let Some(normalized_subject) = normalize_subject_for_threading(&subject) {
            let participant_fallback = participants_key(&from_email, &recipients, &account.email);
            format!("subject:{normalized_subject}|participants:{participant_fallback}")
        } else {
            format!("uid:{uid}")
        };
        let thread_id = pick_thread_id_for_imported_message(
            db_path,
            &account.id.0,
            &mailbox,
            message_id_header.as_deref(),
            in_reply_to.as_deref(),
            &references,
            &thread_root,
        );

        let id = MessageId(format!(
            "m-imap-{}-{}-{}",
            account.id.0,
            mailbox.to_ascii_lowercase(),
            uid
        ));

        let preview = extract_preview_body(&body_plain, body_html.as_deref());

        let reply_to = reply_to_header
            .as_deref()
            .map(parse_address_list)
            .unwrap_or_default();

        let plain_body = if body_plain.trim().is_empty() {
            preview
        } else {
            body_plain.clone()
        };
        let lang_sample = format!(
            "{}\n{}",
            subject,
            plain_body.chars().take(3000).collect::<String>()
        );
        let detected_lang = Some(crate::lang_detect::detect_language_iso639_1(&lang_sample));

        let message = Message {
            id,
            sender: rustymail_domain::EmailAddress {
                name: from_name,
                email: from_email,
            },
            recipients: if recipients.is_empty() {
                vec![rustymail_domain::EmailAddress {
                    name: None,
                    email: account.email.clone(),
                }]
            } else {
                recipients
            },
            reply_to,
            subject: subject.clone(),
            received_at: internal,
            plain_body,
            html_body: body_html.clone(),
            references: rustymail_domain::MessageReferences {
                message_id_header: message_id_header.clone(),
                in_reply_to: in_reply_to.clone(),
                references: references.clone(),
            },
            attachments,
            tags: Vec::new(),
            detected_lang,
            is_read: seen,
            is_pinned: false,
            authentication_results,
            return_path,
        };
        message_headers.insert(
            message.id.0.clone(),
            (to_header, cc_header, reply_to_header),
        );
        let (list_unsub_stored, unsub_urls_json) =
            crate::unsubscribe_detect::index_message_unsubscribe_urls(
                list_unsubscribe.as_deref(),
                &message.subject,
                &message.plain_body,
                message.html_body.as_deref(),
                8,
            );
        message_unsub_index.insert(message.id.0.clone(), (list_unsub_stored, unsub_urls_json));

        match by_thread.get_mut(&thread_id) {
            Some((_subject, _root, messages, thread_unsub)) => {
                if unsub_signal {
                    *thread_unsub = true;
                }
                messages.push(message);
            }
            None => {
                by_thread.insert(
                    thread_id,
                    (subject, Some(thread_root), vec![message], unsub_signal),
                );
            }
        }
    }

    for (_tid, (_subject, _root, messages, _)) in by_thread.iter_mut() {
        messages.sort_by(|a, b| a.received_at.cmp(&b.received_at));
    }

    let mut threads: Vec<Thread> = by_thread
        .into_iter()
        .map(|(thread_id, (subject, _root, messages, has_unsub))| {
            let has_attachments = messages.iter().any(|m| !m.attachments.is_empty());
            Thread {
                id: ThreadId(thread_id),
                subject,
                tags: tags_for_thread(&mailbox, &messages, has_unsub, has_attachments),
                entities: Vec::new(),
                messages,
                followed: false,
            }
        })
        .collect();
    threads.sort_by(|a, b| a.id.0.cmp(&b.id.0));

    upsert_threads_to_db(
        db_path,
        &threads,
        &message_headers,
        &message_unsub_index,
        &attachment_blobs,
        &account.id.0,
        &mailbox,
    )?;

    if let Some(max_uid) = uids.iter().copied().max() {
        set_imap_last_uid(db_path, &account.id.0, &mailbox, max_uid)?;
    }
    let high_water = get_imap_last_uid(db_path, &account.id.0, &mailbox)?;
    let flags_reconciled =
        reconcile_recent_flags(db_path, &account.id.0, &mailbox, session, high_water).await?;

    let message_count: usize = threads.iter().map(|thread| thread.messages.len()).sum();
    Ok(ImapSyncResult {
        mailbox: mailbox.to_string(),
        message_count,
        thread_count: threads.len(),
        fetched_uids: uids.len(),
        uid_validity_reset,
        flags_reconciled,
        uids_pruned,
    })
}

/// UIDs IMAP encore en SQLite pour ce dossier.
fn list_local_imap_uids(
    db_path: &Path,
    account_id: &str,
    mailbox: &str,
) -> Result<Vec<u32>, String> {
    let connection = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let mut stmt = connection
        .prepare(
            "
            SELECT imap_uid FROM messages
            WHERE account_id = ?1 AND mailbox = ?2
              AND imap_uid IS NOT NULL AND imap_uid > 0
            ",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id, mailbox], |row| {
            let uid: i64 = row.get(0)?;
            Ok(uid.max(0) as u32)
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let uid = row.map_err(|e| e.to_string())?;
        if uid > 0 {
            out.push(uid);
        }
    }
    out.sort_unstable();
    out.dedup();
    Ok(out)
}

/// Supprime messages (+ PJ / embeddings) pour des UIDs IMAP disparus, puis fils vides.
pub(crate) fn delete_local_messages_by_imap_uids(
    db_path: &Path,
    account_id: &str,
    mailbox: &str,
    vanished_uids: &[u32],
) -> Result<usize, String> {
    if vanished_uids.is_empty() {
        return Ok(0);
    }
    let mut connection = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let tx = connection.transaction().map_err(|e| e.to_string())?;
    let mut deleted = 0usize;
    let mut thread_ids: HashSet<String> = HashSet::new();

    for uid in vanished_uids {
        let row: Option<(String, String)> = tx
            .query_row(
                "
                SELECT id, thread_id FROM messages
                WHERE account_id = ?1 AND mailbox = ?2 AND imap_uid = ?3
                LIMIT 1
                ",
                params![account_id, mailbox, i64::from(*uid)],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((msg_id, tid)) = row else {
            continue;
        };
        tx.execute(
            "DELETE FROM message_embeddings WHERE message_id = ?1",
            params![msg_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM message_attachments WHERE message_id = ?1",
            params![msg_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM messages WHERE id = ?1", params![msg_id])
            .map_err(|e| e.to_string())?;
        thread_ids.insert(tid);
        deleted += 1;
    }

    for tid in thread_ids {
        let c: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE thread_id = ?1",
                params![tid],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if c == 0 {
            tx.execute("DELETE FROM threads WHERE id = ?1", params![tid])
                .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(deleted)
}

/// Compare le cache local aux UIDs encore présents sur le serveur ; purge les fantômes.
async fn prune_vanished_mailbox_uids(
    db_path: &Path,
    account_id: &str,
    mailbox: &str,
    session: &mut ImapSession,
) -> Result<usize, String> {
    let local = list_local_imap_uids(db_path, account_id, mailbox)?;
    if local.is_empty() {
        return Ok(0);
    }

    let mut still_present: HashSet<u32> = HashSet::new();
    const SEARCH_CHUNK: usize = 100;
    for chunk in local.chunks(SEARCH_CHUNK) {
        let set = chunk
            .iter()
            .map(|u| u.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let found: Vec<async_imap::types::Uid> = session
            .uid_search(format!("UID {set}"))
            .await
            .map_err(map_imap_error)?
            .into_iter()
            .collect();
        for uid in found {
            still_present.insert(u32::from(uid));
        }
    }

    let vanished: Vec<u32> = local
        .into_iter()
        .filter(|u| !still_present.contains(u))
        .collect();
    if vanished.is_empty() {
        return Ok(0);
    }

    let n = delete_local_messages_by_imap_uids(db_path, account_id, mailbox, &vanished)?;
    if n > 0 {
        log::info!(
            target: "rustymail::audit",
            "imap_sync: pruned {n} vanished UID(s) account={account_id} mailbox={mailbox}"
        );
    }
    Ok(n)
}

async fn reconcile_recent_flags(
    db_path: &Path,
    account_id: &str,
    mailbox: &str,
    session: &mut ImapSession,
    last_uid: u32,
) -> Result<usize, String> {
    if last_uid == 0 {
        return Ok(0);
    }
    let low = last_uid.saturating_sub(FLAG_RECONCILE_WINDOW).max(1);
    if low > last_uid {
        return Ok(0);
    }
    let mut uids: Vec<async_imap::types::Uid> = session
        .uid_search(format!("UID {low}:{last_uid}"))
        .await
        .map_err(map_imap_error)?
        .into_iter()
        .collect();
    if uids.is_empty() {
        return Ok(0);
    }
    uids.sort_unstable();
    let connection = open_sqlite_migrated(db_path).map_err(|error| error.to_string())?;
    let mut updated = 0usize;
    for chunk in uids.chunks(FETCH_BATCH) {
        let set = format_uid_set(chunk);
        let stream = session
            .uid_fetch(&set, "(UID FLAGS)")
            .await
            .map_err(map_imap_error)?;
        let fetches: Vec<async_imap::types::Fetch> =
            stream.try_collect().await.map_err(map_imap_error)?;
        for fetch in fetches {
            let Some(uid) = fetch.uid else {
                continue;
            };
            let seen = is_seen(fetch.flags());
            if update_message_read_by_imap_uid(&connection, account_id, mailbox, uid, seen)? {
                updated += 1;
            }
        }
    }
    Ok(updated)
}

// (intentionally no standalone hash helper here)

fn upsert_threads_to_db(
    path: &Path,
    threads: &[Thread],
    message_headers: &HashMap<String, (Option<String>, Option<String>, Option<String>)>,
    message_unsub_index: &HashMap<String, (Option<String>, String)>,
    attachment_blobs: &HashMap<String, Vec<u8>>,
    account_id: &str,
    mailbox: &str,
) -> Result<(), String> {
    let tombstoned = crate::active_tombstone_uids(path, account_id, mailbox).unwrap_or_default();
    let mut connection = crate::open_sqlite_migrated(path).map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for thread in threads {
        let existing_tags: Option<String> = transaction
            .query_row(
                "SELECT tags FROM threads WHERE id = ?1",
                params![thread.id.0],
                |r| r.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .flatten();
        let tags_csv = merge_thread_tag_csv(existing_tags, &thread.tags);
        transaction
            .execute(
                "
                INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(id) DO UPDATE SET
                    account_id = excluded.account_id,
                    mailbox = excluded.mailbox,
                    thread_root_message_id = COALESCE(threads.thread_root_message_id, excluded.thread_root_message_id),
                    subject = excluded.subject,
                    tags = excluded.tags
                ",
                params![
                    thread.id.0,
                    account_id,
                    mailbox,
                    thread
                        .messages
                        .first()
                        .and_then(|m| m.references.message_id_header.clone()),
                    thread.subject,
                    tags_csv
                ],
            )
            .map_err(|error| error.to_string())?;
        for (position, message) in thread.messages.iter().enumerate() {
            let imap_uid: Option<i64> = message
                .id
                .0
                .rsplit('-')
                .next()
                .and_then(|tail| tail.parse::<i64>().ok());
            if let Some(uid) = imap_uid {
                if uid > 0 && tombstoned.contains(&(uid as u32)) {
                    continue;
                }
            }
            let (to_header, cc_header, reply_to_header) = message_headers
                .get(&message.id.0)
                .cloned()
                .unwrap_or((None, None, None));
            let (list_unsubscribe, unsubscribe_urls) = message_unsub_index
                .get(&message.id.0)
                .cloned()
                .unwrap_or((None, "[]".to_string()));
            transaction
                .execute(
                    "
                    INSERT INTO messages (
                        id, thread_id, account_id, mailbox, imap_uid,
                        sender_name, sender_email, subject, received_at,
                        body, body_plain, body_html,
                        message_id_header, in_reply_to, references_header, to_header, cc_header, reply_to_header,
                        authentication_results, return_path,
                        detected_lang, list_unsubscribe, unsubscribe_urls,
                        is_read, position
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)
                    ON CONFLICT(id) DO UPDATE SET
                        thread_id = excluded.thread_id,
                        account_id = excluded.account_id,
                        mailbox = excluded.mailbox,
                        imap_uid = excluded.imap_uid,
                        sender_name = excluded.sender_name,
                        sender_email = excluded.sender_email,
                        subject = excluded.subject,
                        received_at = excluded.received_at,
                        body = excluded.body,
                        body_plain = excluded.body_plain,
                        body_html = excluded.body_html,
                        message_id_header = excluded.message_id_header,
                        in_reply_to = excluded.in_reply_to,
                        references_header = excluded.references_header,
                        to_header = excluded.to_header,
                        cc_header = excluded.cc_header,
                        reply_to_header = excluded.reply_to_header,
                        authentication_results = excluded.authentication_results,
                        return_path = excluded.return_path,
                        detected_lang = excluded.detected_lang,
                        list_unsubscribe = excluded.list_unsubscribe,
                        unsubscribe_urls = excluded.unsubscribe_urls,
                        is_read = excluded.is_read,
                        position = excluded.position
                    ",
                    params![
                        message.id.0,
                        thread.id.0,
                        account_id,
                        mailbox,
                        imap_uid,
                        message.sender.name.as_deref().unwrap_or(""),
                        message.sender.email,
                        message.subject,
                        message.received_at,
                        message.plain_body,
                        message.plain_body,
                        message.html_body,
                        message.references.message_id_header,
                        message.references.in_reply_to,
                        message.references.references.join(" "),
                        to_header,
                        cc_header,
                        reply_to_header,
                        message.authentication_results,
                        message.return_path,
                        message.detected_lang,
                        list_unsubscribe,
                        unsubscribe_urls,
                        i64::from(message.is_read),
                        position as i64
                    ],
                )
                .map_err(|error| error.to_string())?;
            upsert_contacts_from_message_row(
                &transaction,
                account_id,
                message.sender.name.as_deref().unwrap_or(""),
                &message.sender.email,
                to_header.as_deref(),
                cc_header.as_deref(),
                reply_to_header.as_deref(),
                &message.received_at,
            )
            .map_err(|e| e.to_string())?;
            transaction
                .execute(
                    "DELETE FROM message_attachments WHERE message_id = ?1",
                    params![message.id.0],
                )
                .map_err(|error| error.to_string())?;
            for att in &message.attachments {
                let kind = match att.kind {
                    AttachmentKind::Inline => "inline",
                    AttachmentKind::Regular => "regular",
                };
                transaction
                    .execute(
                        "
                        INSERT INTO message_attachments (id, message_id, file_name, mime_type, size_bytes, kind, content_id)
                        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                        ON CONFLICT(id) DO UPDATE SET
                            message_id = excluded.message_id,
                            file_name = excluded.file_name,
                            mime_type = excluded.mime_type,
                            size_bytes = excluded.size_bytes,
                            kind = excluded.kind,
                            content_id = excluded.content_id
                        ",
                        params![
                            att.id.0,
                            message.id.0,
                            att.file_name,
                            att.mime_type,
                            att.size_bytes as i64,
                            kind,
                            att.content_id
                        ],
                    )
                    .map_err(|error| error.to_string())?;
                transaction
                    .execute(
                        "UPDATE message_attachments SET content_blob = ?2 WHERE id = ?1",
                        params![att.id.0, attachment_blobs.get(&att.id.0)],
                    )
                    .map_err(|error| error.to_string())?;
            }
        }
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod thread_pick_tests {
    use super::*;
    use crate::open_sqlite_migrated;
    use rusqlite::params;

    #[test]
    fn sync_reuses_thread_when_message_id_already_local() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db = dir.path().join("test.db");
        let conn = open_sqlite_migrated(&db).expect("open db");
        let account = "acc-self";
        let mid = "<self-test@rustymail.local>";
        let local_thread = "t-local-preview";
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags) VALUES (?1, ?2, 'INBOX', ?3, 'Test', '')",
            params![local_thread, account, mid],
        )
        .expect("thread");
        conn.execute(
            "
            INSERT INTO messages (
                id, thread_id, account_id, mailbox, imap_uid,
                sender_name, sender_email, subject, received_at,
                body, body_plain, body_html,
                message_id_header, is_read, position
            ) VALUES ('m-local-sent-x', ?1, ?2, 'INBOX', NULL,
                'Me', 'me@example.com', 'Test', '2026-01-01T00:00:00Z',
                'body', 'body', NULL, ?3, 1, 0)
            ",
            params![local_thread, account, mid],
        )
        .expect("message");

        let picked =
            pick_thread_id_for_imported_message(&db, account, "INBOX", Some(mid), None, &[], mid);
        assert_eq!(picked, local_thread);
    }

    #[test]
    fn attachment_id_segment_is_stable_and_ascii() {
        assert_eq!(
            sanitize_attachment_id_segment("user@example.com"),
            "userexamplecom"
        );
        assert_eq!(sanitize_attachment_id_segment(" Boîte/测试 "), "Bote");
        assert_eq!(sanitize_attachment_id_segment(""), "scope");
    }

    #[test]
    fn upsert_skips_tombstoned_uids_after_local_delete() {
        use rustymail_domain::{EmailAddress, Message, MessageId, MessageReferences, ThreadId};

        let dir = tempfile::tempdir().expect("tempdir");
        let db = dir.path().join("tombstone.db");
        let _ = open_sqlite_migrated(&db).expect("migrate");

        crate::record_imap_uid_tombstones(&db, "acc", "INBOX", &[99], Some("t-gone"))
            .expect("tombstone");

        let thread = Thread {
            id: ThreadId("t-gone".into()),
            subject: "Gone".into(),
            tags: vec![],
            entities: vec![],
            followed: false,
            messages: vec![Message {
                id: MessageId("m-imap-acc-inbox-99".into()),
                sender: EmailAddress {
                    name: Some("A".into()),
                    email: "a@example.com".into(),
                },
                recipients: vec![],
                reply_to: vec![],
                subject: "Gone".into(),
                received_at: "2026-01-01T00:00:00Z".into(),
                plain_body: "x".into(),
                html_body: None,
                attachments: vec![],
                tags: vec![],
                is_read: true,
                is_pinned: false,
                references: MessageReferences {
                    message_id_header: Some("<gone@x>".into()),
                    in_reply_to: None,
                    references: vec![],
                },
                authentication_results: None,
                return_path: None,
                detected_lang: None,
            }],
        };

        upsert_threads_to_db(
            &db,
            &[thread],
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            "acc",
            "INBOX",
        )
        .expect("upsert");

        let conn = open_sqlite_migrated(&db).expect("reopen");
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE account_id='acc' AND imap_uid=99",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 0, "tombstoned UID must not be reinserted by sync upsert");
    }

    #[test]
    fn prune_deletes_local_uids_missing_from_server_set() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db = dir.path().join("prune.db");
        let conn = open_sqlite_migrated(&db).expect("migrate");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags)
             VALUES ('t1', 'acc', 'INBOX', '<a@x>', 'A', ''),
                    ('t2', 'acc', 'INBOX', '<b@x>', 'B', '')",
            [],
        )
        .expect("threads");
        for (id, tid, uid) in [("m1", "t1", 10i64), ("m2", "t2", 20i64), ("m3", "t1", 30i64)] {
            conn.execute(
                "INSERT INTO messages (id, thread_id, account_id, mailbox, imap_uid, sender_name, sender_email, subject, received_at, body, is_read, position)
                 VALUES (?1, ?2, 'acc', 'INBOX', ?3, 'A', 'a@x', 'S', '2026-01-01T00:00:00Z', 'b', 1, 0)",
                params![id, tid, uid],
            )
            .expect("msg");
        }
        // Serveur ne contient plus UID 20 → message m2 / fil t2 doivent disparaître.
        let n = delete_local_messages_by_imap_uids(&db, "acc", "INBOX", &[20]).expect("prune");
        assert_eq!(n, 1);
        let left: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE account_id='acc' AND mailbox='INBOX'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(left, 2);
        let t2: i64 = conn
            .query_row("SELECT COUNT(*) FROM threads WHERE id='t2'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(t2, 0, "empty thread after prune must be removed");
        let uids = list_local_imap_uids(&db, "acc", "INBOX").expect("list");
        assert_eq!(uids, vec![10, 30]);
    }
}

#[cfg(test)]
mod preview_extract_tests {
    use super::extract_preview_body;
    use super::strip_non_body_html_blocks;

    #[test]
    fn strip_removes_style_and_script() {
        let html = "<style>a{}</style><script>1</script><div>OK</div>";
        assert_eq!(strip_non_body_html_blocks(html), "<div>OK</div>");
    }

    #[test]
    fn preview_prefers_plain_part() {
        assert_eq!(
            extract_preview_body("real plain", Some("<style>x</style>")),
            "real plain"
        );
    }

    #[test]
    fn preview_skips_style_and_uses_body_text() {
        let html = r#"<html><head><style>#outlook a { padding:0; } body { margin:0; }</style></head>
        <body><p>Hello newsletter</p></body></html>"#;
        assert_eq!(extract_preview_body("", Some(html)), "Hello newsletter");
    }
}
