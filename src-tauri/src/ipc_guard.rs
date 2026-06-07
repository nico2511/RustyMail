//! Garde commune pour les flux IPC sensibles (cohérence entrées, éviter payloads absurdes).

use rustymail_domain::{Draft, SearchQuery};

const MAX_TOKEN_LEN: usize = 512;
const MAX_ACCOUNT_ID_LEN: usize = 320;
const MAX_MAILBOX_LEN: usize = 512;
const MAX_JOB_ID_LEN: usize = 128;
const MAX_SESSION_TOKEN_LEN: usize = 128;
const MAX_EMAIL_LEN: usize = 320;
const MAX_SEARCH_TEXT_LEN: usize = 4_096;
const MAX_QA_QUESTION_LEN: usize = 8_192;
const MAX_TARGET_LANG_LEN: usize = 32;
const MAX_DOMAIN_LEN: usize = 253;
const MAX_AI_CACHE_KEY_LEN: usize = 512;
const MAX_PAGE_SIZE: usize = 500;
const MAX_PAGE_OFFSET: usize = 250_000;
const MAX_IMAP_SYNC_LIMIT: usize = 2_000;
const MAX_SYNC_MAILBOXES: usize = 64;
const MAX_DICTATION_BASE64_LEN: usize = 32 * 1024 * 1024;
const MAX_FILE_NAME_LEN: usize = 255;
const MAX_MIME_TYPE_LEN: usize = 128;
const MAX_DRAFT_SUBJECT_LEN: usize = 998;
const MAX_DRAFT_BODY_LEN: usize = 512 * 1024;
const MAX_DRAFT_RECIPIENTS: usize = 200;
const MAX_DRAFT_ATTACHMENTS: usize = 50;
const MAX_DRAFT_ATTACHMENT_PATH_LEN: usize = 4_096;
const ACK_DELETE_ACCOUNT: &str = "delete-account";
const ACK_EMPTY_TRASH: &str = "empty-trash";
const ACK_DELETE_MAILBOX: &str = "delete-mailbox";
const ACK_DELETE_MAILBOX_WITH_CONTENTS: &str = "delete-mailbox-with-contents";
const ACK_SEND_DRAFT: &str = "send-draft";
const ACK_OPEN_ATTACHMENT: &str = "open-attachment";
const ACK_BULK_TRASH_ORG: &str = "bulk-trash-org";
const AI_CACHE_KEY_PREFIXES: &[&str] = &[
    "summary:v2:",
    "translate:v2:",
    "contact_profile:v1:",
];

fn reject_nul(label: &'static str, s: &str) -> Result<(), String> {
    if s.as_bytes().contains(&0) {
        return Err(format!("{label}: caractères interdits"));
    }
    Ok(())
}

fn reject_len(label: &'static str, s: &str, max: usize) -> Result<(), String> {
    if s.len() > max {
        return Err(format!("{label}: valeur trop longue (max {max} caractères)."));
    }
    Ok(())
}

fn reject_newlines(label: &'static str, s: &str) -> Result<(), String> {
    if s.bytes().any(|b| b == b'\n' || b == b'\r') {
        return Err(format!("{label}: retours à la ligne interdits."));
    }
    Ok(())
}

fn validate_nonempty_trimmed(label: &'static str, s: &str, max: usize) -> Result<(), String> {
    reject_nul(label, s)?;
    reject_len(label, s, max)?;
    if s.trim().is_empty() {
        return Err(format!("{label}: valeur vide."));
    }
    Ok(())
}

fn validate_ack(label: &'static str, got: Option<&str>, expected: &'static str) -> Result<(), String> {
    match got.map(str::trim) {
        Some(v) if v == expected => Ok(()),
        _ => Err(format!("{label}: confirmation backend requise.")),
    }
}

pub fn validate_delete_account_ack(ack: Option<&str>) -> Result<(), String> {
    validate_ack("deleteAccountAck", ack, ACK_DELETE_ACCOUNT)
}

pub fn validate_empty_trash_ack(ack: Option<&str>) -> Result<(), String> {
    validate_ack("emptyTrashAck", ack, ACK_EMPTY_TRASH)
}

pub fn validate_delete_mailbox_ack(ack: Option<&str>) -> Result<(), String> {
    validate_ack("deleteMailboxAck", ack, ACK_DELETE_MAILBOX)
}

pub fn validate_delete_mailbox_with_contents_ack(ack: Option<&str>) -> Result<(), String> {
    validate_ack("deleteMailboxAck", ack, ACK_DELETE_MAILBOX_WITH_CONTENTS)
}

pub fn validate_send_draft_ack(ack: Option<&str>) -> Result<(), String> {
    validate_ack("sendAck", ack, ACK_SEND_DRAFT)
}

pub fn validate_open_attachment_ack(ack: Option<&str>) -> Result<(), String> {
    validate_ack("openAck", ack, ACK_OPEN_ATTACHMENT)
}

pub fn validate_bulk_trash_org_ack(ack: Option<&str>) -> Result<(), String> {
    validate_ack("bulkTrashOrgAck", ack, ACK_BULK_TRASH_ORG)
}

pub fn validate_account_id(account_id: &str) -> Result<(), String> {
    validate_nonempty_trimmed("accountId", account_id, MAX_ACCOUNT_ID_LEN)?;
    let t = account_id.trim();
    if t.contains('@') || t.starts_with("oauth:") {
        Ok(())
    } else {
        Err("accountId: identifiant de compte invalide.".into())
    }
}

pub fn validate_optional_account_id(account_id: Option<&str>) -> Result<(), String> {
    if let Some(id) = account_id {
        if !id.trim().is_empty() {
            validate_account_id(id)?;
        }
    }
    Ok(())
}

pub fn validate_thread_id(thread_id: &str) -> Result<(), String> {
    validate_nonempty_trimmed("threadId", thread_id, MAX_TOKEN_LEN)
}

/// Identifiant de carte Organiser (`stale-tags`, `llm-…`, etc.).
pub fn validate_proposal_id(proposal_id: &str) -> Result<(), String> {
    validate_nonempty_trimmed("proposalId", proposal_id, MAX_TOKEN_LEN)?;
    reject_newlines("proposalId", proposal_id)?;
    Ok(())
}

/// Liste optionnelle de fils / dossiers pour un apply partiel.
pub fn validate_org_thread_ids(thread_ids: Option<&[String]>) -> Result<(), String> {
    let Some(ids) = thread_ids else {
        return Ok(());
    };
    if ids.is_empty() {
        return Ok(());
    }
    if ids.len() > 500 {
        return Err("threadIds: trop d’identifiants (max 500).".into());
    }
    for id in ids {
        validate_thread_id(id)?;
    }
    Ok(())
}

pub fn validate_message_id(message_id: &str) -> Result<(), String> {
    validate_nonempty_trimmed("messageId", message_id, MAX_TOKEN_LEN)
}

pub fn validate_optional_message_id(message_id: Option<&str>) -> Result<(), String> {
    if let Some(id) = message_id {
        if !id.trim().is_empty() {
            validate_message_id(id)?;
        }
    }
    Ok(())
}

/// Nom de boîte IMAP (vide autorisé : certains appels retombent sur INBOX côté commande).
pub fn validate_mailbox(mailbox: &str) -> Result<(), String> {
    reject_nul("mailbox", mailbox)?;
    reject_len("mailbox", mailbox, MAX_MAILBOX_LEN)?;
    reject_newlines("mailbox", mailbox)?;
    Ok(())
}

pub fn validate_optional_mailbox(mailbox: Option<&str>) -> Result<(), String> {
    if let Some(m) = mailbox {
        if !m.trim().is_empty() {
            validate_mailbox(m)?;
        }
    }
    Ok(())
}

pub fn validate_cid(cid: &str) -> Result<(), String> {
    validate_nonempty_trimmed("cid", cid, MAX_TOKEN_LEN)
}

pub fn validate_job_id(job_id: &str) -> Result<(), String> {
    validate_nonempty_trimmed("jobId", job_id, MAX_JOB_ID_LEN)
}

pub fn validate_session_token(label: &'static str, token: &str) -> Result<(), String> {
    validate_nonempty_trimmed(label, token, MAX_SESSION_TOKEN_LEN)
}

pub fn validate_contact_email(email: &str) -> Result<(), String> {
    validate_nonempty_trimmed("email", email, MAX_EMAIL_LEN)?;
    if !email.trim().contains('@') {
        return Err("email: adresse invalide.".into());
    }
    Ok(())
}

pub fn validate_domain_label(domain: &str) -> Result<(), String> {
    validate_nonempty_trimmed("domain", domain, MAX_DOMAIN_LEN)?;
    if domain.trim().contains('@') {
        return Err("domain: doit être un nom de domaine, pas une adresse complète.".into());
    }
    Ok(())
}

pub fn validate_search_phrase(phrase: &str) -> Result<(), String> {
    reject_nul("phrase", phrase)?;
    reject_len("phrase", phrase, MAX_SEARCH_TEXT_LEN)?;
    Ok(())
}

pub fn validate_qa_question(question: &str) -> Result<(), String> {
    reject_nul("question", question)?;
    reject_len("question", question, MAX_QA_QUESTION_LEN)?;
    if question.trim().is_empty() {
        return Err("question: valeur vide.".into());
    }
    Ok(())
}

pub fn validate_target_lang(lang: &str) -> Result<(), String> {
    validate_nonempty_trimmed("targetLang", lang, MAX_TARGET_LANG_LEN)
}

/// Clé de lecture cache IA (`ai_cache_get`) — préfixes connus, taille bornée.
pub fn validate_ai_cache_key(key: &str) -> Result<(), String> {
    reject_nul("cacheKey", key)?;
    reject_newlines("cacheKey", key)?;
    reject_len("cacheKey", key, MAX_AI_CACHE_KEY_LEN)?;
    let t = key.trim();
    if t.is_empty() {
        return Err("cacheKey: valeur vide.".into());
    }
    if !AI_CACHE_KEY_PREFIXES.iter().any(|p| t.starts_with(p)) {
        return Err("cacheKey: préfixe non autorisé.".into());
    }
    Ok(())
}

pub fn normalize_page_size(page_size: Option<usize>, default: usize) -> Result<usize, String> {
    let raw = page_size.unwrap_or(default).max(1);
    if raw > MAX_PAGE_SIZE {
        return Err(format!("pageSize: valeur trop grande (max {MAX_PAGE_SIZE})."));
    }
    Ok(raw)
}

pub fn normalize_page_offset(page_offset: Option<usize>) -> Result<usize, String> {
    let raw = page_offset.unwrap_or(0);
    if raw > MAX_PAGE_OFFSET {
        return Err(format!("pageOffset: valeur trop grande (max {MAX_PAGE_OFFSET})."));
    }
    Ok(raw)
}

pub fn normalize_imap_sync_limit(limit: Option<usize>) -> Result<Option<usize>, String> {
    match limit {
        Some(v) if v == 0 => Ok(Some(1)),
        Some(v) if v > MAX_IMAP_SYNC_LIMIT => {
            Err(format!("limit: valeur trop grande (max {MAX_IMAP_SYNC_LIMIT})."))
        }
        other => Ok(other),
    }
}

pub fn validate_sync_mailboxes(mailboxes: &[String]) -> Result<(), String> {
    if mailboxes.len() > MAX_SYNC_MAILBOXES {
        return Err(format!(
            "mailboxes: trop de boîtes demandées (max {MAX_SYNC_MAILBOXES})."
        ));
    }
    for (i, m) in mailboxes.iter().enumerate() {
        validate_mailbox(m).map_err(|e| format!("mailboxes[{i}]: {e}"))?;
    }
    Ok(())
}

pub fn validate_dictation_payload(
    audio_base64: &str,
    audio_wav_base64: Option<&str>,
    file_name: &str,
    mime_type: &str,
) -> Result<(), String> {
    reject_nul("audioBase64", audio_base64)?;
    reject_len("audioBase64", audio_base64, MAX_DICTATION_BASE64_LEN)?;
    if let Some(wav) = audio_wav_base64 {
        reject_nul("audioWavBase64", wav)?;
        reject_len("audioWavBase64", wav, MAX_DICTATION_BASE64_LEN)?;
    }
    reject_nul("fileName", file_name)?;
    reject_newlines("fileName", file_name)?;
    reject_len("fileName", file_name, MAX_FILE_NAME_LEN)?;
    reject_nul("mimeType", mime_type)?;
    reject_newlines("mimeType", mime_type)?;
    reject_len("mimeType", mime_type, MAX_MIME_TYPE_LEN)?;
    Ok(())
}

pub fn validate_draft_for_ipc(draft: &Draft) -> Result<(), String> {
    validate_nonempty_trimmed("draft.id", &draft.id.0, MAX_TOKEN_LEN)?;
    reject_nul("draft.subject", &draft.subject)?;
    reject_len("draft.subject", &draft.subject, MAX_DRAFT_SUBJECT_LEN)?;
    reject_nul("draft.markdownBody", &draft.markdown_body)?;
    reject_len("draft.markdownBody", &draft.markdown_body, MAX_DRAFT_BODY_LEN)?;
    if draft.to.len() + draft.cc.len() + draft.bcc.len() > MAX_DRAFT_RECIPIENTS {
        return Err(format!(
            "draft.recipients: trop de destinataires (max {MAX_DRAFT_RECIPIENTS})."
        ));
    }
    for (i, r) in draft
        .to
        .iter()
        .chain(draft.cc.iter())
        .chain(draft.bcc.iter())
        .enumerate()
    {
        validate_contact_email(&r.email).map_err(|e| format!("draft.recipients[{i}]: {e}"))?;
    }
    if draft.references.len() > MAX_DRAFT_RECIPIENTS {
        return Err("draft.references: trop d’éléments.".into());
    }
    if let Some(mid) = draft.in_reply_to.as_deref() {
        validate_optional_message_id(Some(mid))?;
    }
    if let Some(tid) = draft.thread_id.as_deref() {
        validate_optional_message_id(Some(tid))?;
    }
    if draft.attachment_paths.len() > MAX_DRAFT_ATTACHMENTS {
        return Err(format!(
            "draft.attachmentPaths: trop de fichiers (max {MAX_DRAFT_ATTACHMENTS})."
        ));
    }
    for (i, p) in draft.attachment_paths.iter().enumerate() {
        reject_nul("draft.attachmentPaths", p)
            .map_err(|e| format!("draft.attachmentPaths[{i}]: {e}"))?;
        reject_newlines("draft.attachmentPaths", p)
            .map_err(|e| format!("draft.attachmentPaths[{i}]: {e}"))?;
        reject_len("draft.attachmentPaths", p, MAX_DRAFT_ATTACHMENT_PATH_LEN)
            .map_err(|e| format!("draft.attachmentPaths[{i}]: {e}"))?;
    }
    Ok(())
}

pub fn validate_search_query(query: &SearchQuery) -> Result<(), String> {
    validate_optional_account_id(query.account_id.as_deref())?;
    validate_optional_mailbox(query.mailbox.as_deref())?;
    if let Some(text) = query.text.as_deref() {
        if !text.trim().is_empty() {
            reject_nul("query.text", text)?;
            reject_len("query.text", text, MAX_SEARCH_TEXT_LEN)?;
        }
    }
    if let Some(sender) = query.sender.as_deref() {
        if !sender.trim().is_empty() {
            reject_nul("query.sender", sender)?;
            reject_len("query.sender", sender, MAX_EMAIL_LEN)?;
            rustymail_modules::ai_llm_contracts::normalize_search_nl_sender(sender)
                .ok_or_else(|| "query.sender: email ou domaine invalide.".to_string())?;
        }
    }
    for (i, s) in query.senders.iter().enumerate() {
        if s.trim().is_empty() {
            continue;
        }
        reject_nul("query.senders", s)?;
        reject_len("query.senders", s, MAX_EMAIL_LEN)
            .map_err(|e| format!("query.senders[{i}]: {e}"))?;
        rustymail_modules::ai_llm_contracts::normalize_search_nl_sender(s).ok_or_else(|| {
            format!("query.senders[{i}]: email ou domaine invalide.")
        })?;
    }
    if let Some(lang) = query.language.as_deref() {
        if !lang.trim().is_empty() {
            reject_nul("query.language", lang)?;
            reject_len("query.language", lang, 16)?;
        }
    }
    Ok(())
}

pub fn validate_message_attachment_ids(message_id: &str, attachment_id: &str) -> Result<(), String> {
    validate_message_id(message_id)?;
    validate_nonempty_trimmed("attachmentId", attachment_id, MAX_TOKEN_LEN)
}

pub fn validate_imap_thread_op(
    account_id: Option<&str>,
    mailbox: &str,
    thread_id: &str,
) -> Result<(), String> {
    validate_optional_account_id(account_id)?;
    validate_mailbox(mailbox)?;
    validate_thread_id(thread_id)
}

pub fn validate_imap_thread_move(
    account_id: Option<&str>,
    mailbox: &str,
    thread_id: &str,
    dest_mailbox: &str,
) -> Result<(), String> {
    validate_imap_thread_op(account_id, mailbox, thread_id)?;
    validate_mailbox(dest_mailbox)?;
    if dest_mailbox.trim().is_empty() {
        return Err("destMailbox: valeur vide.".into());
    }
    Ok(())
}

/// Journalisation hors chemins utilisateur (`user@domain` → `***@domain`).
pub fn audit_email_shadow(value: &str) -> String {
    let trim = value.trim();
    let Some((_u, domain)) = trim.rsplit_once('@') else {
        return "(non-email)".into();
    };
    if domain.is_empty() {
        "(non-email)".into()
    } else {
        format!("***@{domain}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_nul_in_thread_id() {
        assert!(validate_thread_id("abc\0def").is_err());
    }

    #[test]
    fn rejects_overlong_message_id() {
        let long = "a".repeat(MAX_TOKEN_LEN + 1);
        assert!(validate_message_id(&long).is_err());
    }

    #[test]
    fn account_id_requires_email_or_oauth() {
        assert!(validate_account_id("user@example.com").is_ok());
        assert!(validate_account_id("oauth:user@example.com").is_ok());
        assert!(validate_account_id("not-an-id").is_err());
    }

    #[test]
    fn mailbox_rejects_newlines() {
        assert!(validate_mailbox("INBOX").is_ok());
        assert!(validate_mailbox("a\nb").is_err());
    }

    #[test]
    fn attachment_pair_validates() {
        assert!(validate_message_attachment_ids("m1", "a1").is_ok());
        assert!(validate_message_attachment_ids("", "a1").is_err());
    }

    #[test]
    fn ai_cache_key_requires_known_prefix() {
        assert!(validate_ai_cache_key("summary:v2:or:m1:p2:thread-1").is_ok());
        assert!(validate_ai_cache_key("evil:drop").is_err());
        assert!(validate_ai_cache_key("summary:v2:\n").is_err());
    }

    #[test]
    fn destructive_ack_requires_exact_token() {
        assert!(validate_delete_account_ack(Some("delete-account")).is_ok());
        assert!(validate_delete_account_ack(Some(" delete-account ")).is_ok());
        assert!(validate_delete_account_ack(None).is_err());
        assert!(validate_delete_account_ack(Some("delete")).is_err());
    }

    #[test]
    fn page_size_and_sync_limits_are_bounded() {
        assert_eq!(normalize_page_size(None, 50).unwrap(), 50);
        assert!(normalize_page_size(Some(MAX_PAGE_SIZE + 1), 50).is_err());
        assert!(normalize_page_offset(Some(MAX_PAGE_OFFSET + 1)).is_err());
        assert!(normalize_imap_sync_limit(Some(MAX_IMAP_SYNC_LIMIT + 1)).is_err());
    }

}
