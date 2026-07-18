use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use rustymail_application::{message, AppCore};
use rustymail_domain::{
    Account, MailAuthKind, SecurityMode, ServerSettings, Tag, Thread, ThreadId, ThreadListItem,
};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

mod account_imap_lock;
mod activity;
mod address_contacts;
mod archive_layout;
mod attachment_policy;
mod contact_detail;
mod demo_playground;
mod draft_revisions;
mod folder_ops;
mod imap;
mod imap_tombstones;
mod lang_detect;
mod mail_autoconfig;
mod mail_ops;
mod mailbox_local_cache;
mod newsletter;
mod oauth_mail;
mod org_apply;
mod org_consolidate;
mod org_mailbox_structure;
mod org_memory;
mod org_post_move;
mod org_retag;
mod org_scan;
mod org_v2_scan;
mod prefs_urls;
mod provider_errors;
mod saved_drafts;
mod saved_searches;
mod semantic_search;
mod smtp_send;
mod split_send;
mod sqlite_crypto;
mod sqlite_sent;
mod text_sample;
mod threading;
mod tls_policy;
mod unsubscribe_detect;
mod vcard;

pub const KEYRING_SERVICE: &str = "RustyMail";
const MAX_ATTACHMENT_DOWNLOAD_BYTES: usize = 75 * 1024 * 1024;
const MAX_INLINE_IMAGE_BYTES: usize = 8 * 1024 * 1024;

mod ai_features;
mod app_prefs;
mod dictation;
mod email_util;
mod hf_download;
mod llama_server;
mod llm_singleton;
mod local_llm;
mod openrouter;
pub use address_contacts::{
    delete_manual_contact, list_address_contacts, parse_header_address_list,
    reindex_address_contacts, search_address_contacts, search_address_contacts_scoped,
    upsert_contacts_from_message_row, upsert_manual_contact, AddressContactHit, AddressContactRow,
    ListAddressContactsResult, ManualContactUpsert,
};
pub use ai_features::{ai_feature_enabled, AiFeature};
pub use app_prefs::{
    load_app_prefs, prefs_path_from_db_dir, save_app_prefs, sync_draft_language_from_mother,
    AiPrefs, AppPrefs, GeneralPrefs, APP_PREFS_FILE,
};
pub use attachment_policy::{
    attachment_needs_explicit_ack, log_attachment_audited, PREFIX_RISK_CONFIRM,
};
pub use contact_detail::{
    contact_message_samples, count_address_contacts_scoped, get_address_contact_detail,
    list_address_contacts_scoped, list_sender_emails_for_domain, live_message_count_for_sender,
    AddressContactListRow, ContactDetailDto, ContactEntitySnippet, ContactThreadSnippet,
    ListAddressContactsScopedResult,
};
pub use dictation::{
    decode_audio_base64, dictation_api_key_clear, dictation_api_key_get, dictation_api_key_present,
    dictation_api_key_set, transcribe_and_maybe_translate, transcribe_audio,
    translate_to_draft_language, DICTATION_KEYRING_USERNAME,
};
pub use email_util::normalize_email;
pub use hf_download::{download_hf_file_if_needed, hf_resolve_url};
pub use llama_server::{
    llama_server_api_key_clear, llama_server_api_key_get, llama_server_api_key_present,
    llama_server_api_key_set, LLAMA_SERVER_KEYRING_USERNAME,
};
pub use llm_singleton::{llm_singleton, LlmSingletonState};
pub use local_llm::{
    build_llm_status, ensure_local_llm_gguf_download, list_cached_gguf_filenames,
    llm_expected_gguf_path, llm_gguf_cached, llm_gguf_download_cancel_clear,
    llm_gguf_download_cancel_request, llm_gguf_path_for_runtime, llm_maybe_migrate_gguf_cache,
    llm_repo_cache_dir, resolved_hf_repo_for_download, LlmStatusPayload,
};
pub use mail_autoconfig::{discover_mail_servers, DiscoveredMailServers};
pub use openrouter::{
    openrouter_api_key_clear, openrouter_api_key_get, openrouter_api_key_present,
    openrouter_api_key_set, OPENROUTER_KEYRING_USERNAME,
};
pub use prefs_urls::{
    parse_llama_loopback_listen_addr, save_app_prefs_validated, validate_app_prefs_ai_urls,
    validate_local_companion_base_url, validate_openai_compatible_base_url,
};
pub use provider_errors::{oauth_http_error, oauth_redirect_error, redact_sensitive_snippet};
pub use tls_policy::{effective_allow_invalid_tls, persist_allow_invalid_tls_from_ui_checkbox};
pub use vcard::{export_address_contacts_vcard, import_address_contacts_vcard, ImportVcardResult};

pub use account_imap_lock::{acquire_account_imap_lock, with_account_imap_lock};
pub use activity::{
    activity_card_calibration_stats, list_suggested_saved_views, migrate_activity,
    purge_activity_events_older_than, record_activity_events, record_message_sent_activity,
    record_suggestion_decision,
};
pub use archive_layout::{archive_mailbox_path, parse_archive_layout, resolve_archive_target};
pub use folder_ops::{
    archive_mailbox_threads, delete_imap_mailbox_with_contents, list_mailbox_tree,
    retag_threads_in_mailboxes, set_mailbox_locked, ArchiveMailboxThreadsOutcome,
    DeleteMailboxWithContentsOutcome, MailboxTreeReport,
};
pub use imap::ops;
pub use imap::{
    imap_append_sent_copy, list_mailboxes, sync_inbox, sync_mailboxes_single_session,
    ImapIdleCoordinator, ImapPushEvent, ImapSentCopyOutcome, ImapSyncResult, SyncMailboxAlias,
    SyncMailboxesOutcome,
};
/// Re-exports for callers that need a lower-level IMAP session or mailbox ops.
pub use imap::{login_session, login_session_for_account, map_imap_error, ImapSession};
pub use imap_tombstones::{
    active_tombstone_uids, filter_tombstoned_uids, record_imap_uid_tombstones,
};
pub use mail_ops::{
    empty_trash_mailbox, is_sent_like_mailbox, is_trash_like_mailbox, move_thread_to_archive,
    move_thread_to_mailbox, move_thread_to_trash, pick_archive_folder, pick_trash_folder,
    set_thread_seen, ArchiveDestination, ArchiveMoveResult, ThreadMailboxMoveResult,
};
pub use mailbox_local_cache::{
    purge_mailbox_local_cache, register_mailbox_local_cache, rename_mailbox_local_cache,
    rename_mailbox_subtree_local_cache, thread_ids_for_mailboxes, MailboxCachePurgeStats,
    MailboxCacheRenameStats,
};
pub use org_apply::{
    org_apply_proposal_with, org_resolve_archive_path, prepare_org_proposal_for_apply,
    resolve_apply_action, validate_org_apply_thread_ids,
};
pub use org_memory::{
    clear_mailbox_auto_archive, ignore_mailbox, is_mailbox_auto_archive,
    list_auto_archive_mailboxes, list_ignored_mailboxes, proposal_scope_fingerprint,
    record_proposal_decision, set_mailbox_auto_archive, unignore_mailbox,
};
pub use org_post_move::{
    post_move_heuristic_refresh, spawn_post_move_background_sync, PostMoveRefreshOutcome,
};
pub use org_retag::{org_retag_account, org_retag_threads};
pub use org_scan::{enrich_org_report_llm_refs, org_llm_proposals_for_account, org_scan_account};
pub use org_v2_scan::org_v2_scan_account;
pub use saved_searches::{
    delete_saved_search, get_saved_search, list_saved_searches, mark_saved_search_seen,
    migrate_saved_searches, upsert_saved_search,
};
pub use semantic_search::{
    count_threads_matching_query, embedding_plain_for_message, init_semantic_model_dir,
    reindex_semantic_account, reindex_semantic_mailbox, semantic_embedding_counts_snapshot,
    semantic_model_present, sqlite_search_threads_unified, SemanticEmbeddingCountsSnapshot,
    SemanticReindexStats,
};

pub use demo_playground::{
    sqlite_remove_demo_playground, sqlite_reset_demo_playground, DEMO_PLAYGROUND_ACCOUNT_ID,
};
pub use draft_revisions::{
    sqlite_draft_orphan_session_open, sqlite_draft_orphan_sessions_list,
    sqlite_draft_orphan_sessions_purge_stale, sqlite_draft_revision_get,
    sqlite_draft_revision_list, sqlite_draft_revision_purge_session, sqlite_draft_revision_save,
    DraftRevisionListItem, OrphanDraftSessionItem,
};
pub use saved_drafts::{
    sqlite_saved_draft_delete, sqlite_saved_draft_list, sqlite_saved_draft_open,
    sqlite_saved_draft_upsert_by_session, sqlite_saved_drafts_count, SavedDraftListItem,
    SavedDraftOpenResult,
};
pub use smtp_send::{send_draft_via_smtp, DraftSendOutcome};
pub use split_send::{
    execute_split_send, plan_split_draft_attachments, stat_attachments, SplitSendResult,
    DEFAULT_ATTACHMENT_BUDGET_BYTES,
};
pub use sqlite_sent::{sqlite_record_sent_message_copy, sqlite_record_sent_starting_thread};

pub use newsletter::{
    add_newsletter_rule, annotate_newsletter_thread, host_matches_suffix, list_newsletter_rules,
    list_newsletter_rules_connection, matches_newsletter_email, newsletter_migrate,
    parse_newsletter_rule_input, remove_newsletter_rule, thread_blocks_reply, NewsletterRule,
};

pub use oauth_mail::{
    bind_oauth_tokens_for_account, ensure_valid_access_token, forget_oauth_tokens,
    init_oauth_tokens_dir, load_oauth_tokens, oauth_google_desktop_login, oauth_imap_username,
    oauth_microsoft_desktop_login, store_oauth_tokens, MailOAuthProvider, OAuthDesktopLoginOutcome,
    StoredMailOAuthTokens,
};

pub fn get_account_password(account_id: &str) -> Result<String, String> {
    keyring::use_native_store(false)
        .map_err(|error| format!("keyring native store failed: {error}"))?;
    let entry = keyring_core::Entry::new(KEYRING_SERVICE, account_id)
        .map_err(|error| format!("keyring entry failed: {error}"))?;
    entry
        .get_password()
        .map_err(|error| format!("keyring read failed: {error}"))
}

pub fn seeded_app_core() -> AppCore {
    AppCore::new(seed_threads())
}

pub fn sqlite_app_core(db_path: impl AsRef<Path>) -> Result<AppCore, rusqlite::Error> {
    let connection = open_sqlite_migrated(db_path.as_ref())?;
    seed_if_empty(&connection)?;
    let threads = load_threads(&connection)?;
    Ok(AppCore::new(threads))
}

/// Load threads for a single IMAP account and mailbox (folder), newest activity first.
pub fn sqlite_app_core_scoped(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
) -> Result<AppCore, rusqlite::Error> {
    let connection = open_sqlite_migrated(db_path.as_ref())?;
    seed_if_empty(&connection)?;
    let threads = load_threads_scoped(&connection, account_id, mailbox)?;
    Ok(AppCore::new(threads))
}

/// Aligne le nom de dossier demandé par l’UI avec la chaîne réellement stockée (sync IMAP),
/// pour Thunderbird-style `A/B` vs `INBOX.A.B` ou espaces/NFC.
pub(crate) fn resolve_scoped_mailbox_for_account(
    connection: &Connection,
    account_id: &str,
    requested: &str,
) -> Result<String, rusqlite::Error> {
    use crate::imap::ops::{mailbox_logical_path_key, mailbox_name_match_key};
    use crate::org_scan::is_inbox_like_mailbox;
    use std::collections::HashSet;

    let aid = account_id.trim();
    if aid.is_empty() {
        return Ok(requested.to_string());
    }
    let want_log = mailbox_logical_path_key(requested);
    let want_nfc = mailbox_name_match_key(requested);
    let mut seen = HashSet::<String>::new();
    let mut candidates: Vec<String> = Vec::new();

    let mut stmt =
        connection.prepare("SELECT DISTINCT mailbox FROM threads WHERE account_id = ?1")?;
    for row in stmt.query_map(params![aid], |r| r.get::<_, String>(0))? {
        let m = row?;
        if seen.insert(m.clone()) {
            candidates.push(m);
        }
    }
    let mut stmt2 = connection.prepare("SELECT mailbox FROM imap_state WHERE account_id = ?1")?;
    for row in stmt2.query_map(params![aid], |r| r.get::<_, String>(0))? {
        let m = row?;
        if seen.insert(m.clone()) {
            candidates.push(m);
        }
    }
    for c in &candidates {
        if mailbox_logical_path_key(c) == want_log {
            return Ok(c.clone());
        }
    }
    for c in &candidates {
        if mailbox_name_match_key(c) == want_nfc {
            return Ok(c.clone());
        }
    }
    if is_inbox_like_mailbox(requested) {
        if let Some(hit) = candidates.iter().find(|c| is_inbox_like_mailbox(c)) {
            return Ok(hit.clone());
        }
    }
    Ok(requested.to_string())
}

pub(crate) fn resolve_scoped_mailbox_from_path(
    db_path: impl AsRef<Path>,
    account_id: &str,
    requested: &str,
) -> Result<String, String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    resolve_scoped_mailbox_for_account(&connection, account_id, requested)
        .map_err(|e| e.to_string())
}

pub fn sqlite_list_threads_page_scoped(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
    limit: usize,
    offset: usize,
) -> Result<Vec<ThreadListItem>, rusqlite::Error> {
    let connection = open_sqlite_migrated(db_path.as_ref())?;
    seed_if_empty(&connection)?;
    let resolved = resolve_scoped_mailbox_for_account(&connection, account_id, mailbox)?;
    let rules = newsletter::list_newsletter_rules_connection(&connection)?;
    let account_email: String = connection
        .query_row(
            "SELECT lower(trim(email)) FROM accounts WHERE id = ?1 LIMIT 1",
            params![account_id.trim()],
            |row| row.get(0),
        )
        .unwrap_or_default();
    let account_emails = if account_email.is_empty() {
        Vec::new()
    } else {
        vec![account_email]
    };
    let mut statement = connection.prepare(
        "
        SELECT id, subject, tags, COALESCE(is_followed, 0) FROM threads
        WHERE account_id = ?1
          AND EXISTS (
            SELECT 1 FROM messages m
            WHERE m.thread_id = threads.id
              AND m.account_id = ?1
              AND lower(trim(m.mailbox)) = lower(trim(?2))
          )
        ORDER BY
          (SELECT max(received_at) FROM messages WHERE thread_id = threads.id) DESC,
          id
        LIMIT ?3 OFFSET ?4
        ",
    )?;
    let mut out = Vec::new();
    for row in statement.query_map(
        params![
            account_id.trim(),
            resolved.as_str(),
            limit as i64,
            offset as i64
        ],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? != 0,
            ))
        },
    )? {
        let (id, subject, tags, followed) = row?;
        let thread = build_thread_from_row(&connection, id, subject, tags, followed)?;
        let mut item = thread.list_item(resolved.clone());
        let aid = account_id.trim();
        if !aid.is_empty() {
            item.account_id = Some(aid.to_string());
        }
        item.is_newsletter_thread =
            newsletter::thread_blocks_reply(&thread, &account_emails, &rules);
        out.push(item);
    }
    Ok(out)
}

/// Liste paginée des fils récents des boîtes INBOX-like, **tous comptes** confondus.
///
/// Réutilise [`crate::org_scan::is_inbox_like_mailbox`] pour sélectionner les dossiers
/// (ex. `INBOX`, `…/Inbox`, « Boîte de réception »). Chaque élément a `account_id` renseigné.
pub fn sqlite_list_threads_page_unified_inbox(
    db_path: impl AsRef<Path>,
    limit: usize,
    offset: usize,
) -> Result<Vec<ThreadListItem>, rusqlite::Error> {
    use crate::org_scan::is_inbox_like_mailbox;
    use std::collections::HashMap;

    let connection = open_sqlite_migrated(db_path.as_ref())?;
    seed_if_empty(&connection)?;
    let rules = newsletter::list_newsletter_rules_connection(&connection)?;

    let mut account_email_by_id: HashMap<String, String> = HashMap::new();
    {
        let mut stmt = connection.prepare("SELECT id, lower(trim(email)) FROM accounts")?;
        for row in stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })? {
            let (id, email) = row?;
            if !email.is_empty() {
                account_email_by_id.insert(id, email);
            }
        }
    }

    let mut seen = HashSet::<(String, String)>::new();
    let mut inbox_pairs: Vec<(String, String)> = Vec::new();
    {
        let mut stmt = connection.prepare(
            "SELECT DISTINCT account_id, mailbox FROM threads
             UNION
             SELECT DISTINCT account_id, mailbox FROM messages",
        )?;
        for row in stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })? {
            let (aid, mb) = row?;
            let aid = aid.trim().to_string();
            if aid.is_empty() || !is_inbox_like_mailbox(&mb) {
                continue;
            }
            let key = (aid.clone(), mb.trim().to_ascii_lowercase());
            if seen.insert(key) {
                inbox_pairs.push((aid, mb));
            }
        }
    }

    if inbox_pairs.is_empty() {
        return Ok(Vec::new());
    }

    connection.execute_batch(
        "CREATE TEMP TABLE IF NOT EXISTS _rm_unified_inbox (
            account_id TEXT NOT NULL,
            mailbox TEXT NOT NULL
        );",
    )?;
    connection.execute("DELETE FROM _rm_unified_inbox", [])?;
    for (aid, mb) in &inbox_pairs {
        connection.execute(
            "INSERT INTO _rm_unified_inbox(account_id, mailbox) VALUES (?1, ?2)",
            params![aid.as_str(), mb.as_str()],
        )?;
    }

    let mut statement = connection.prepare(
        "
        SELECT id, subject, tags, COALESCE(is_followed, 0), account_id, mailbox FROM threads
        WHERE trim(account_id) != ''
          AND EXISTS (
            SELECT 1 FROM messages m
            INNER JOIN _rm_unified_inbox u
              ON u.account_id = m.account_id
             AND lower(trim(u.mailbox)) = lower(trim(m.mailbox))
            WHERE m.thread_id = threads.id
              AND m.account_id = threads.account_id
          )
        ORDER BY
          (SELECT max(received_at) FROM messages WHERE thread_id = threads.id) DESC,
          id
        LIMIT ?1 OFFSET ?2
        ",
    )?;
    let mut out = Vec::new();
    for row in statement.query_map(params![limit as i64, offset as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)? != 0,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
        ))
    })? {
        let (id, subject, tags, followed, aid, mbox) = row?;
        let thread = build_thread_from_row(&connection, id, subject, tags, followed)?;
        let mut item = thread.list_item(mbox.trim().to_string());
        item.account_id = Some(aid.clone());
        let account_emails = account_email_by_id
            .get(&aid)
            .map(|e| vec![e.clone()])
            .unwrap_or_default();
        item.is_newsletter_thread =
            newsletter::thread_blocks_reply(&thread, &account_emails, &rules);
        out.push(item);
    }
    Ok(out)
}

/// Liste paginée des fils **suivis** (`is_followed`), tous dossiers confondus pour le compte.
pub fn sqlite_list_followed_threads_page(
    db_path: impl AsRef<Path>,
    account_id: &str,
    limit: usize,
    offset: usize,
) -> Result<Vec<ThreadListItem>, rusqlite::Error> {
    let connection = open_sqlite_migrated(db_path.as_ref())?;
    seed_if_empty(&connection)?;
    let rules = newsletter::list_newsletter_rules_connection(&connection)?;
    let account_email: String = connection
        .query_row(
            "SELECT lower(trim(email)) FROM accounts WHERE id = ?1 LIMIT 1",
            params![account_id.trim()],
            |row| row.get(0),
        )
        .unwrap_or_default();
    let account_emails = if account_email.is_empty() {
        Vec::new()
    } else {
        vec![account_email]
    };
    let mut statement = connection.prepare(
        "
        SELECT id, subject, tags, COALESCE(is_followed, 0), mailbox FROM threads
        WHERE account_id = ?1 AND COALESCE(is_followed, 0) = 1
        ORDER BY
          (SELECT max(received_at) FROM messages WHERE thread_id = threads.id) DESC,
          id
        LIMIT ?2 OFFSET ?3
        ",
    )?;
    let mut out = Vec::new();
    for row in statement.query_map(
        params![account_id.trim(), limit as i64, offset as i64],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? != 0,
                row.get::<_, String>(4)?,
            ))
        },
    )? {
        let (id, subject, tags, followed, mbox) = row?;
        let thread = build_thread_from_row(&connection, id, subject, tags, followed)?;
        let mut item = thread.list_item(mbox.trim().to_string());
        let aid = account_id.trim();
        if !aid.is_empty() {
            item.account_id = Some(aid.to_string());
        }
        item.is_newsletter_thread =
            newsletter::thread_blocks_reply(&thread, &account_emails, &rules);
        out.push(item);
    }
    Ok(out)
}

/// Liste paginée des fils d’un compte, **tous dossiers** (recherche / filtres `#` en portée compte).
pub fn sqlite_list_threads_page_account(
    db_path: impl AsRef<Path>,
    account_id: &str,
    limit: usize,
    offset: usize,
) -> Result<Vec<ThreadListItem>, rusqlite::Error> {
    let connection = open_sqlite_migrated(db_path.as_ref())?;
    seed_if_empty(&connection)?;
    let rules = newsletter::list_newsletter_rules_connection(&connection)?;
    let account_email: String = connection
        .query_row(
            "SELECT lower(trim(email)) FROM accounts WHERE id = ?1 LIMIT 1",
            params![account_id.trim()],
            |row| row.get(0),
        )
        .unwrap_or_default();
    let account_emails = if account_email.is_empty() {
        Vec::new()
    } else {
        vec![account_email]
    };
    let mut statement = connection.prepare(
        "
        SELECT id, subject, tags, COALESCE(is_followed, 0), mailbox FROM threads
        WHERE account_id = ?1
        ORDER BY
          (SELECT max(received_at) FROM messages WHERE thread_id = threads.id) DESC,
          id
        LIMIT ?2 OFFSET ?3
        ",
    )?;
    let mut out = Vec::new();
    for row in statement.query_map(
        params![account_id.trim(), limit as i64, offset as i64],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? != 0,
                row.get::<_, String>(4)?,
            ))
        },
    )? {
        let (id, subject, tags, followed, mbox) = row?;
        let thread = build_thread_from_row(&connection, id, subject, tags, followed)?;
        let mut item = thread.list_item(mbox.trim().to_string());
        let aid = account_id.trim();
        if !aid.is_empty() {
            item.account_id = Some(aid.to_string());
        }
        item.is_newsletter_thread =
            newsletter::thread_blocks_reply(&thread, &account_emails, &rules);
        out.push(item);
    }
    Ok(out)
}

/// Bascule (ou force) le drapeau `is_followed` sur un fil et renvoie son nouvel état.
/// Si `desired` est `None`, inverse l’état courant ; sinon force.
pub fn sqlite_thread_set_followed(
    db_path: impl AsRef<Path>,
    account_id: &str,
    thread_id: &str,
    desired: Option<bool>,
) -> Result<bool, rusqlite::Error> {
    let connection = open_sqlite_migrated(db_path.as_ref())?;
    let aid = account_id.trim();
    let current: Option<i64> = connection
        .query_row(
            "SELECT COALESCE(is_followed, 0) FROM threads WHERE id = ?1 AND (account_id = ?2 OR ?2 = '')",
            params![thread_id, aid],
            |r| r.get(0),
        )
        .optional()?;
    let Some(curr) = current else {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    };
    let next = desired.unwrap_or(curr == 0);
    connection.execute(
        "UPDATE threads SET is_followed = ?1 WHERE id = ?2 AND (account_id = ?3 OR ?3 = '')",
        params![i64::from(next), thread_id, aid],
    )?;
    Ok(next)
}

/// Lecture cache IA générique (`ai_cache`), entrées non expirées uniquement.
pub fn sqlite_ai_cache_get(db_path: impl AsRef<Path>, key: &str) -> Result<Option<String>, String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let k = key.trim();
    if k.is_empty() {
        return Ok(None);
    }
    let found: Option<String> = connection
        .query_row(
            "SELECT payload_json FROM ai_cache WHERE cache_key = ?1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))",
            params![k],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(found)
}

const MAX_AI_CACHE_KEY_LEN: usize = 512;
const MAX_AI_CACHE_PAYLOAD_LEN: usize = 256 * 1024;

/// Durée de vie cache IA selon le préfixe de clé (secondes).
pub fn ai_cache_ttl_secs_for_key(key: &str) -> i64 {
    let k = key.trim();
    if k.starts_with("summary:v2:") {
        7 * 24 * 3600
    } else if k.starts_with("translate:v2:") {
        30 * 24 * 3600
    } else if k.starts_with("contact_profile:v1:") {
        14 * 24 * 3600
    } else {
        7 * 24 * 3600
    }
}

fn ai_cache_expires_modifier_for_key(key: &str) -> String {
    format!("+{} seconds", ai_cache_ttl_secs_for_key(key))
}

/// Supprime les entrées `ai_cache` expirées (à appeler au démarrage ou périodiquement).
pub fn sqlite_ai_cache_purge_expired(db_path: impl AsRef<Path>) -> Result<u64, String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let n = connection
        .execute(
            "DELETE FROM ai_cache WHERE expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')",
            [],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as u64)
}

/// Renseigne `expires_at` pour les lignes créées avant le TTL explicite (`expires_at` NULL).
/// Ancre sur `created_at` + même logique de durée que [`ai_cache_ttl_secs_for_key`].
pub fn sqlite_ai_cache_backfill_null_expires(db_path: impl AsRef<Path>) -> Result<u64, String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let n = connection
        .execute(
            "UPDATE ai_cache SET expires_at = datetime(created_at,
                CASE
                  WHEN trim(cache_key) LIKE 'translate:v2:%' THEN '+2592000 seconds'
                  WHEN trim(cache_key) LIKE 'contact_profile:v1:%' THEN '+1209600 seconds'
                  ELSE '+604800 seconds'
                END)
             WHERE expires_at IS NULL AND trim(cache_key) != ''",
            [],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as u64)
}

/// Écrit ou remplace une entrée `ai_cache` avec expiration selon le préfixe de clé.
pub fn sqlite_ai_cache_put(
    db_path: impl AsRef<Path>,
    key: &str,
    payload_json: &str,
) -> Result<(), String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let k = key.trim();
    if k.is_empty() {
        return Err("cache_key vide".into());
    }
    if k.len() > MAX_AI_CACHE_KEY_LEN {
        return Err(format!(
            "cache_key trop long (max {MAX_AI_CACHE_KEY_LEN} octets)"
        ));
    }
    if payload_json.len() > MAX_AI_CACHE_PAYLOAD_LEN {
        return Err(format!(
            "payload_json trop volumineux (max {MAX_AI_CACHE_PAYLOAD_LEN} octets)"
        ));
    }
    let expires_mod = ai_cache_expires_modifier_for_key(k);
    connection
        .execute(
            "INSERT INTO ai_cache (cache_key, payload_json, expires_at) VALUES (?1, ?2, datetime('now', ?3))
             ON CONFLICT(cache_key) DO UPDATE SET
               payload_json = excluded.payload_json,
               expires_at = excluded.expires_at,
               created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
            params![k, payload_json, expires_mod],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn sqlite_open_thread_by_id(
    db_path: impl AsRef<Path>,
    thread_id: &str,
) -> Result<Option<Thread>, rusqlite::Error> {
    let connection = open_sqlite_migrated(db_path.as_ref())?;
    let mut statement = connection.prepare(
        "SELECT id, subject, tags, COALESCE(is_followed, 0) FROM threads WHERE id = ?1 LIMIT 1",
    )?;
    let row: Option<(String, String, String, bool)> = statement
        .query_row(params![thread_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get::<_, i64>(3)? != 0))
        })
        .optional()?;
    match row {
        Some((id, subject, tags, followed)) => Ok(Some(build_thread_from_row(
            &connection,
            id,
            subject,
            tags,
            followed,
        )?)),
        None => Ok(None),
    }
}

pub fn sqlite_mailbox_unread_counts(
    db_path: impl AsRef<Path>,
    account_id: &str,
) -> Result<Vec<(String, usize)>, rusqlite::Error> {
    Ok(sqlite_mailbox_folder_stats(db_path, account_id)?
        .into_iter()
        .map(|(m, u, _)| (m, u))
        .collect())
}

/// Compteurs bruts par chaîne `messages.mailbox` stockée (une requête SQL).
fn query_folder_stats_on_connection(
    connection: &Connection,
    account_id: &str,
) -> Result<Vec<(String, usize, usize)>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "
        SELECT
          m.mailbox,
          CAST(SUM(
            CASE
              WHEN EXISTS (
                SELECT 1 FROM messages mu
                WHERE mu.thread_id = t.id AND COALESCE(mu.is_read, 0) = 0
              )
              THEN 1
              ELSE 0
            END
          ) AS INTEGER) AS unread_threads,
          COUNT(DISTINCT t.id) AS total_threads
        FROM threads t
        INNER JOIN messages m ON m.thread_id = t.id AND m.account_id = t.account_id
        WHERE t.account_id = ?1
        GROUP BY m.mailbox
        ORDER BY lower(trim(m.mailbox))
        ",
    )?;
    let rows = statement.query_map(params![account_id.trim()], |row| {
        let mailbox: String = row.get(0)?;
        let unread: i64 = row.get(1)?;
        let total: i64 = row.get(2)?;
        Ok((mailbox, unread.max(0) as usize, total.max(0) as usize))
    })?;
    rows.collect()
}

fn mailbox_resolution_candidates(
    connection: &Connection,
    account_id: &str,
) -> Result<Vec<String>, rusqlite::Error> {
    use std::collections::HashSet;

    let aid = account_id.trim();
    let mut seen = HashSet::<String>::new();
    let mut candidates: Vec<String> = Vec::new();

    let mut stmt =
        connection.prepare("SELECT DISTINCT mailbox FROM threads WHERE account_id = ?1")?;
    for row in stmt.query_map(params![aid], |r| r.get::<_, String>(0))? {
        let m = row?;
        if seen.insert(m.clone()) {
            candidates.push(m);
        }
    }
    let mut stmt2 = connection.prepare("SELECT mailbox FROM imap_state WHERE account_id = ?1")?;
    for row in stmt2.query_map(params![aid], |r| r.get::<_, String>(0))? {
        let m = row?;
        if seen.insert(m.clone()) {
            candidates.push(m);
        }
    }
    Ok(candidates)
}

fn resolve_scoped_mailbox_with_candidates(requested: &str, candidates: &[String]) -> String {
    use crate::imap::ops::{mailbox_logical_path_key, mailbox_name_match_key};
    use crate::org_scan::is_inbox_like_mailbox;

    let want_log = mailbox_logical_path_key(requested);
    let want_nfc = mailbox_name_match_key(requested);
    for c in candidates {
        if mailbox_logical_path_key(c) == want_log {
            return c.clone();
        }
    }
    for c in candidates {
        if mailbox_name_match_key(c) == want_nfc {
            return c.clone();
        }
    }
    if is_inbox_like_mailbox(requested) {
        if let Some(hit) = candidates.iter().find(|c| is_inbox_like_mailbox(c)) {
            return hit.clone();
        }
    }
    requested.to_string()
}

fn lookup_folder_stats(
    stats: &std::collections::HashMap<String, (usize, usize)>,
    resolved: &str,
) -> (usize, usize) {
    if let Some(v) = stats.get(resolved) {
        return *v;
    }
    let rtrim = resolved.trim();
    for (k, v) in stats {
        if k.trim().eq_ignore_ascii_case(rtrim) {
            return *v;
        }
    }
    (0, 0)
}

/// Compteurs barre latérale : une entrée par nom IMAP affiché, résolu comme la liste de fils.
pub fn sqlite_mailbox_sidebar_counts(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailboxes: &[String],
) -> Result<Vec<(String, usize, usize)>, rusqlite::Error> {
    let connection = open_sqlite_migrated(db_path.as_ref())?;
    let aid = account_id.trim();
    let stats_rows = query_folder_stats_on_connection(&connection, aid)?;
    let mut stats_map = std::collections::HashMap::with_capacity(stats_rows.len());
    for (mb, u, t) in stats_rows {
        stats_map.insert(mb, (u, t));
    }
    let candidates = mailbox_resolution_candidates(&connection, aid)?;
    let mut out = Vec::with_capacity(mailboxes.len());
    for mb in mailboxes {
        let resolved = resolve_scoped_mailbox_with_candidates(mb, &candidates);
        let (unread, total) = lookup_folder_stats(&stats_map, &resolved);
        out.push((mb.clone(), unread, total));
    }
    Ok(out)
}

/// Compteurs bruts par chaîne `messages.mailbox` stockée (debug / agrégats internes).
pub fn sqlite_mailbox_folder_stats(
    db_path: impl AsRef<Path>,
    account_id: &str,
) -> Result<Vec<(String, usize, usize)>, rusqlite::Error> {
    let connection = open_sqlite_migrated(db_path.as_ref())?;
    query_folder_stats_on_connection(&connection, account_id)
}

/// Compteurs pour les puces Tout / Non lus / Suivis / Priorité / Auto (dossier courant + suivis compte).
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailboxInboxFilterCounts {
    pub all: usize,
    pub unread: usize,
    pub starred: usize,
    pub focused: usize,
    pub auto: usize,
}

pub fn sqlite_mailbox_inbox_filter_counts(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
) -> Result<MailboxInboxFilterCounts, String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let account_id = account_id.trim();
    let resolved = resolve_scoped_mailbox_for_account(&connection, account_id, mailbox)
        .map_err(|e| e.to_string())?;
    let rules =
        newsletter::list_newsletter_rules_connection(&connection).map_err(|e| e.to_string())?;
    let account_email: String = connection
        .query_row(
            "SELECT lower(trim(email)) FROM accounts WHERE id = ?1 LIMIT 1",
            params![account_id],
            |row| row.get(0),
        )
        .unwrap_or_default();
    let account_emails = if account_email.is_empty() {
        Vec::new()
    } else {
        vec![account_email]
    };

    let all: usize = connection
        .query_row(
            "
            SELECT COUNT(DISTINCT t.id) FROM threads t
            WHERE t.account_id = ?1
              AND EXISTS (
                SELECT 1 FROM messages m
                WHERE m.thread_id = t.id AND m.account_id = ?1
                  AND lower(trim(m.mailbox)) = lower(trim(?2))
              )
            ",
            params![account_id, resolved.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        .max(0) as usize;

    let unread: usize = connection
        .query_row(
            "
            SELECT CAST(SUM(
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM messages m
                  WHERE m.thread_id = t.id AND COALESCE(m.is_read, 0) = 0
                )
                THEN 1
                ELSE 0
              END
            ) AS INTEGER)
            FROM threads t
            WHERE t.account_id = ?1
              AND EXISTS (
                SELECT 1 FROM messages m2
                WHERE m2.thread_id = t.id AND m2.account_id = ?1
                  AND lower(trim(m2.mailbox)) = lower(trim(?2))
              )
            ",
            params![account_id, resolved.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        .max(0) as usize;

    let starred: usize = connection
        .query_row(
            "
            SELECT COUNT(*) FROM threads
            WHERE account_id = ?1 AND COALESCE(is_followed, 0) = 1
            ",
            params![account_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        .max(0) as usize;

    let mut stmt = connection
        .prepare(
            "
            SELECT id, subject, tags, COALESCE(is_followed, 0) FROM threads
            WHERE account_id = ?1
              AND EXISTS (
                SELECT 1 FROM messages m
                WHERE m.thread_id = threads.id AND m.account_id = ?1
                  AND lower(trim(m.mailbox)) = lower(trim(?2))
              )
            ",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_id, resolved.as_str()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? != 0,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut focused = 0usize;
    let mut auto = 0usize;
    for row in rows {
        let (id, subject, tags, followed) = row.map_err(|e| e.to_string())?;
        let thread = build_thread_from_row(&connection, id, subject, tags, followed)
            .map_err(|e| e.to_string())?;
        if newsletter::thread_blocks_reply(&thread, &account_emails, &rules) {
            auto += 1;
        } else {
            focused += 1;
        }
    }

    Ok(MailboxInboxFilterCounts {
        all,
        unread,
        starred,
        focused,
        auto,
    })
}

static SQLITE_MIGRATED_PATHS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn migrated_paths_guard() -> &'static Mutex<HashSet<String>> {
    SQLITE_MIGRATED_PATHS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Opens the local database (WAL + SQLCipher). Automatic migration from plaintext — see `docs/SECURITY.md`.
pub(crate) fn open_sqlite_migrated(path: &Path) -> Result<Connection, rusqlite::Error> {
    let connection = sqlite_crypto::open_sqlite_encrypted(path)?;
    let key = path.to_string_lossy().to_string();
    let mut memo = match migrated_paths_guard().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    if memo.contains(&key) {
        return Ok(connection);
    }
    migrate(&connection)?;
    memo.insert(key);
    Ok(connection)
}

/// Ouvre la base locale (WAL + SQLCipher) avec migrations appliquées.
///
/// API publique pour les crates appelantes (ex. IPC Tauri).
pub fn open_sqlite_migrated_public(path: &Path) -> Result<Connection, rusqlite::Error> {
    open_sqlite_migrated(path)
}

fn migrate(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL DEFAULT '',
            mailbox TEXT NOT NULL DEFAULT 'INBOX',
            thread_root_message_id TEXT,
            subject TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '',
            is_followed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            account_id TEXT NOT NULL DEFAULT '',
            mailbox TEXT NOT NULL DEFAULT 'INBOX',
            imap_uid INTEGER,
            sender_name TEXT NOT NULL,
            sender_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            received_at TEXT NOT NULL,
            body TEXT NOT NULL,
            body_plain TEXT,
            body_html TEXT,
            message_id_header TEXT,
            in_reply_to TEXT,
            references_header TEXT,
            to_header TEXT,
            cc_header TEXT,
            reply_to_header TEXT,
            is_read INTEGER NOT NULL,
            position INTEGER NOT NULL,
            FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS message_attachments (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            kind TEXT NOT NULL DEFAULT 'regular',
            part_id TEXT,
            content_blob BLOB,
            FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            email TEXT NOT NULL,
            imap_host TEXT NOT NULL,
            imap_port INTEGER NOT NULL,
            imap_security TEXT NOT NULL,
            imap_allow_invalid_tls INTEGER NOT NULL DEFAULT 0,
            smtp_host TEXT NOT NULL,
            smtp_port INTEGER NOT NULL,
            smtp_security TEXT NOT NULL,
            smtp_allow_invalid_tls INTEGER NOT NULL DEFAULT 0,
            auth_kind TEXT NOT NULL DEFAULT 'password'
        );

        CREATE TABLE IF NOT EXISTS imap_state (
            account_id TEXT NOT NULL,
            mailbox TEXT NOT NULL,
            last_uid INTEGER NOT NULL DEFAULT 0,
            uidvalidity INTEGER,
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            PRIMARY KEY(account_id, mailbox)
        );

        CREATE TABLE IF NOT EXISTS draft_revisions (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL DEFAULT '',
            session_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_draft_revisions_session_created_at
          ON draft_revisions(account_id, session_id, created_at);

        CREATE TABLE IF NOT EXISTS saved_drafts (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(account_id, session_id)
        );
        CREATE INDEX IF NOT EXISTS idx_saved_drafts_account_updated
          ON saved_drafts(account_id, updated_at DESC);
        ",
    )?;

    // Backfill columns for older databases (ignore duplicate-column errors).
    let _ = connection.execute(
        "ALTER TABLE threads ADD COLUMN account_id TEXT NOT NULL DEFAULT ''",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE threads ADD COLUMN mailbox TEXT NOT NULL DEFAULT 'INBOX'",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE threads ADD COLUMN thread_root_message_id TEXT",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE threads ADD COLUMN is_followed INTEGER NOT NULL DEFAULT 0",
        [],
    );

    let _ = connection.execute(
        "ALTER TABLE messages ADD COLUMN account_id TEXT NOT NULL DEFAULT ''",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE messages ADD COLUMN mailbox TEXT NOT NULL DEFAULT 'INBOX'",
        [],
    );
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN imap_uid INTEGER", []);
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN body_plain TEXT", []);
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN body_html TEXT", []);
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN message_id_header TEXT", []);
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN in_reply_to TEXT", []);
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN references_header TEXT", []);
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN to_header TEXT", []);
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN cc_header TEXT", []);
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN reply_to_header TEXT", []);
    let _ = connection.execute(
        "ALTER TABLE messages ADD COLUMN authentication_results TEXT",
        [],
    );
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN return_path TEXT", []);

    let _ = connection.execute(
        "ALTER TABLE accounts ADD COLUMN imap_allow_invalid_tls INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE accounts ADD COLUMN smtp_allow_invalid_tls INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE accounts ADD COLUMN auth_kind TEXT NOT NULL DEFAULT 'password'",
        [],
    );
    let _ = connection.execute("ALTER TABLE imap_state ADD COLUMN uidvalidity INTEGER", []);

    // Uniqueness for IMAP messages: prevent collisions across accounts/mailboxes.
    let _ = connection.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_imap_unique ON messages(account_id, mailbox, imap_uid)",
        [],
    );
    let _ = connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id)",
        [],
    );
    let _ = connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_threads_account_mailbox ON threads(account_id, mailbox)",
        [],
    );
    let _ = connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON message_attachments(message_id)",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE message_attachments ADD COLUMN part_id TEXT",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE message_attachments ADD COLUMN content_blob BLOB",
        [],
    );
    let _ = connection.execute(
        "ALTER TABLE message_attachments ADD COLUMN content_id TEXT",
        [],
    );

    newsletter_migrate(connection)?;

    let _ = connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS message_embeddings (
            message_id TEXT PRIMARY KEY,
            model_id TEXT NOT NULL,
            dim INTEGER NOT NULL,
            vector BLOB NOT NULL,
            indexed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_message_embeddings_model ON message_embeddings(model_id);

        CREATE TABLE IF NOT EXISTS ai_cache (
            cache_key TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            expires_at TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        CREATE TABLE IF NOT EXISTS address_contacts (
            account_id TEXT NOT NULL,
            email TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            last_seen_at TEXT NOT NULL DEFAULT '',
            message_count INTEGER NOT NULL DEFAULT 0,
            last_source TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (account_id, email)
        );
        CREATE INDEX IF NOT EXISTS idx_address_contacts_account_name
            ON address_contacts(account_id, lower(display_name));
        ",
    );

    let _ = connection.execute_batch("DROP TABLE IF EXISTS ai_job_queue;");

    address_contacts::migrate_address_contacts_l3(connection)?;

    let _ = connection.execute("ALTER TABLE messages ADD COLUMN detected_lang TEXT", []);
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN list_unsubscribe TEXT", []);
    let _ = connection.execute("ALTER TABLE messages ADD COLUMN unsubscribe_urls TEXT", []);

    org_retag::migrate_canonical_thread_source_tags(connection)?;
    org_retag::migrate_thread_attachment_state_tags(connection)?;
    unsubscribe_detect::migrate_message_unsubscribe_urls(connection)?;
    let _ = unsubscribe_detect::migrate_resort_unsubscribe_urls(connection);
    org_memory::migrate_org_memory(connection)?;
    saved_searches::migrate_saved_searches(connection)?;
    activity::migrate_activity(connection)?;
    imap_tombstones::migrate_imap_tombstones(connection)?;

    Ok(())
}

pub(crate) fn merge_thread_tag_csv(existing_csv: Option<String>, incoming: &[Tag]) -> String {
    let mut merged: Vec<Tag> = existing_csv.as_deref().map(parse_tags).unwrap_or_default();
    for t in incoming {
        if !merged.contains(t) {
            merged.push(t.clone());
        }
    }
    merged
        .iter()
        .map(Tag::as_filter)
        .collect::<Vec<_>>()
        .join(",")
}

pub(crate) fn upsert_account_row(
    connection: &Connection,
    account: &Account,
) -> Result<(), rusqlite::Error> {
    connection.execute(
        "
            INSERT INTO accounts (
                id, display_name, email,
                imap_host, imap_port, imap_security, imap_allow_invalid_tls,
                smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls,
                auth_kind
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
                display_name = excluded.display_name,
                email = excluded.email,
                imap_host = excluded.imap_host,
                imap_port = excluded.imap_port,
                imap_security = excluded.imap_security,
                imap_allow_invalid_tls = excluded.imap_allow_invalid_tls,
                smtp_host = excluded.smtp_host,
                smtp_port = excluded.smtp_port,
                smtp_security = excluded.smtp_security,
                smtp_allow_invalid_tls = excluded.smtp_allow_invalid_tls,
                auth_kind = excluded.auth_kind
            ",
        params![
            account.id.0,
            account.display_name,
            account.email,
            account.imap.host,
            account.imap.port,
            security_to_str(&account.imap.security),
            i64::from(account.imap.allow_invalid_tls),
            account.smtp.host,
            account.smtp.port,
            security_to_str(&account.smtp.security),
            i64::from(account.smtp.allow_invalid_tls),
            account.auth_kind.as_db_str(),
        ],
    )?;
    Ok(())
}

pub(crate) fn set_keyring_password(account_id: &str, password: &str) -> Result<(), String> {
    keyring::use_native_store(false)
        .map_err(|error| format!("keyring native store failed: {error}"))?;
    let entry = keyring_core::Entry::new(KEYRING_SERVICE, account_id)
        .map_err(|error| format!("keyring entry failed: {error}"))?;
    entry
        .set_password(password)
        .map_err(|error| format!("keyring write failed: {error}"))
}

/// Supprime une entrée keyring si elle existe ; les erreurs « absent » sont ignorées.
fn forget_keyring_entry(account_id: &str) {
    let Ok(_) = keyring::use_native_store(false) else {
        return;
    };
    let Ok(entry) = keyring_core::Entry::new(KEYRING_SERVICE, account_id) else {
        return;
    };
    let _ = entry.delete_credential();
}

/// Supprime un compte : messages, pièces jointes (BLOB), **vecteurs de recherche sémantique** (`message_embeddings`),
/// fils, états IMAP, ligne compte SQLite, secret dans le trousseau, puis `VACUUM` pour recycler l’espace du fichier BD.
///
/// Les modèles IA **téléchargés** (ex. MiniLM ONNX, Whisper) restent sur disque : ils sont partagés entre comptes.
/// Les **règles anti-newsletter** (`newsletter_rules`) sont globales au profil, pas par compte : elles ne sont pas effacées.
///
/// Les copies que l’utilisateur a enregistrées ailleurs (ex. Téléchargements) ne sont pas suivies ni supprimées.
pub fn delete_account(db_path: impl AsRef<Path>, account_id: &str) -> Result<(), String> {
    let id = account_id.trim();
    if id.is_empty() {
        return Err("identifiant de compte vide".to_string());
    }
    let mut connection = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    // Obligatoire pour que les `ON DELETE CASCADE` s’appliquent ; et cohérent si une vieille connexion les avait désactivées.
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;

    let cnt: i64 = connection
        .query_row("SELECT COUNT(1) FROM accounts WHERE id = ?1", [id], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|e| e.to_string())?;
    if cnt == 0 {
        return Err(format!("compte introuvable: {id}"));
    }

    let tx = connection.transaction().map_err(|e| e.to_string())?;
    // Purge explicite (recherche sémantique / IA locale) puis pièces jointes, avant les messages —
    // garantit l’absence d’orphelins même si CASCADE n’a pas été actif lors d’anciennes migrations.
    tx.execute(
        "
        DELETE FROM ai_cache
        WHERE cache_key LIKE 'contact_profile:%:' || ?1 || ':%'
           OR EXISTS (
                SELECT 1 FROM threads t
                WHERE t.account_id = ?1
                  AND (
                    ai_cache.cache_key LIKE 'summary:%:' || t.id
                    OR ai_cache.cache_key LIKE 'translate:%:thread:' || t.id || ':%'
                  )
           )
           OR EXISTS (
                SELECT 1 FROM messages m
                WHERE m.account_id = ?1
                  AND ai_cache.cache_key LIKE 'translate:%:msg:' || m.id || ':%'
           )
        ",
        [id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM message_embeddings WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?1)",
        [id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM message_attachments WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?1)",
        [id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM messages WHERE account_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM threads WHERE account_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM imap_state WHERE account_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM saved_drafts WHERE account_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM draft_revisions WHERE account_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    let n = tx
        .execute("DELETE FROM accounts WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("aucune ligne supprimée pour le compte: {id}"));
    }

    forget_keyring_entry(id);
    forget_oauth_tokens(id);
    connection
        .execute("VACUUM", [])
        .map_err(|e| format!("vacuum après suppression compte: {e}"))?;
    Ok(())
}

/// Mot de passe IMAP acceptable à l’enregistrement (nouveau secret ou secret déjà en trousseau).
pub(crate) fn password_auth_save_allowed(password: &str, has_keyring_secret: bool) -> bool {
    !password.trim().is_empty() || has_keyring_secret
}

fn validate_account_secrets_for_save(
    connection: &Connection,
    account: &Account,
    password: &str,
) -> Result<(), String> {
    let exists: i64 = connection
        .query_row(
            "SELECT COUNT(1) FROM accounts WHERE id = ?1",
            [&account.id.0],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let has_keyring_secret = get_account_password(&account.id.0).is_ok();

    match account.auth_kind {
        MailAuthKind::Password => {
            if !password_auth_save_allowed(password, has_keyring_secret) {
                return Err(if exists > 0 {
                    "Mot de passe requis : aucun secret enregistré pour ce compte (re-saisissez le mot de passe ou reconnectez-vous)."
                        .into()
                } else {
                    "Mot de passe requis pour un nouveau compte.".into()
                });
            }
        }
        MailAuthKind::OauthGoogle | MailAuthKind::OauthMicrosoft => {
            let tokens = load_oauth_tokens(&account.id.0).map_err(|_| {
                if exists > 0 {
                    "Jetons OAuth absents pour ce compte : reconnectez-vous avec Google ou Microsoft."
                } else {
                    "Jetons OAuth absents : utilisez « Connexion Google » ou « Connexion Microsoft » avant d’enregistrer."
                }
                .to_string()
            })?;
            oauth_mail::ensure_oauth_tokens_match_auth_kind(&tokens, &account.auth_kind)?;
            if matches!(account.auth_kind, MailAuthKind::OauthGoogle)
                && !oauth_mail::google_scope_allows_imap(&tokens.scope)
            {
                return Err(
                    "Jetons Google sans accès IMAP (scope https://mail.google.com/). \
                     Reconnectez le compte via « Connexion Google »."
                        .into(),
                );
            }
        }
    }
    Ok(())
}

/// Met à jour l’identifiant de compte (clé primaire = email en minuscules) et les lignes SQLite liées.
fn rekey_account(
    db_path: &Path,
    prev_account_id: &str,
    account: &Account,
    password: &str,
) -> Result<(), String> {
    let prev = prev_account_id.trim();
    let new_id = account.id.0.trim();
    if prev.is_empty() || new_id.is_empty() || prev == new_id {
        return Err("rekey: identifiants invalides".to_string());
    }

    let mut connection = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let tx = connection.transaction().map_err(|e| e.to_string())?;

    let prev_exists: i64 = tx
        .query_row(
            "SELECT COUNT(1) FROM accounts WHERE id = ?1",
            [prev],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if prev_exists == 0 {
        return Err(format!("compte source introuvable: {prev}"));
    }

    let other_collision: Option<String> = tx
        .query_row(
            "SELECT id FROM accounts WHERE id = ?1 LIMIT 1",
            [new_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some(existing) = &other_collision {
        if existing != prev {
            return Err(format!("Un compte avec cet e-mail existe déjà ({new_id})."));
        }
    }

    tx.execute(
        "UPDATE threads SET account_id = ?1 WHERE account_id = ?2",
        params![new_id, prev],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE messages SET account_id = ?1 WHERE account_id = ?2",
        params![new_id, prev],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO imap_state (account_id, mailbox, last_uid, uidvalidity, updated_at)
         SELECT ?1, mailbox, last_uid, uidvalidity, updated_at FROM imap_state WHERE account_id = ?2",
        params![new_id, prev],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM imap_state WHERE account_id = ?1", [prev])
        .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE saved_drafts SET account_id = ?1 WHERE account_id = ?2",
        params![new_id, prev],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE draft_revisions SET account_id = ?1 WHERE account_id = ?2",
        params![new_id, prev],
    )
    .map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM accounts WHERE id = ?1", [prev])
        .map_err(|e| e.to_string())?;
    upsert_account_row(&*tx, account).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    match account.auth_kind {
        MailAuthKind::Password => {
            let secret = if password.trim().is_empty() {
                get_account_password(prev)?
            } else {
                password.trim().to_string()
            };
            forget_keyring_entry(prev);
            forget_oauth_tokens(prev);
            set_keyring_password(new_id, &secret)?;
        }
        MailAuthKind::OauthGoogle | MailAuthKind::OauthMicrosoft => {
            let tokens = load_oauth_tokens(prev)?;
            forget_keyring_entry(prev);
            forget_oauth_tokens(prev);
            store_oauth_tokens(new_id, &tokens)?;
        }
    }
    Ok(())
}

pub fn save_account(
    db_path: impl AsRef<Path>,
    account: &Account,
    password: &str,
    previous_account_id: Option<&str>,
) -> Result<(), String> {
    account
        .validate()
        .map_err(|error| format!("invalid account: {error:?}"))?;

    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|error| error.to_string())?;

    let prev = previous_account_id.map(str::trim).filter(|s| !s.is_empty());

    let new_key = account.id.0.trim();
    match prev {
        Some(p) if p != new_key => {
            drop(connection);
            rekey_account(db_path.as_ref(), p, account, password)
        }
        _ => {
            validate_account_secrets_for_save(&connection, account, password)?;
            upsert_account_row(&connection, account).map_err(|e| e.to_string())?;
            match account.auth_kind {
                MailAuthKind::Password => {
                    forget_oauth_tokens(&account.id.0);
                    if !password.trim().is_empty() {
                        set_keyring_password(&account.id.0, password)?;
                    }
                }
                MailAuthKind::OauthGoogle | MailAuthKind::OauthMicrosoft => {
                    forget_keyring_entry(&account.id.0);
                    bind_oauth_tokens_for_account(account)?;
                }
            }
            Ok(())
        }
    }
}

pub fn load_accounts(db_path: impl AsRef<Path>) -> Result<Vec<Account>, String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|error| error.to_string())?;

    let mut statement = connection
        .prepare(
            "
            SELECT id, display_name, email,
                   imap_host, imap_port, imap_security, imap_allow_invalid_tls,
                   smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls,
                   auth_kind
            FROM accounts
            ORDER BY display_name, email
            ",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let auth_raw: String = row.get(11).unwrap_or_else(|_| "password".to_string());
            Ok(Account {
                id: rustymail_domain::AccountId(row.get::<_, String>(0)?),
                display_name: row.get(1)?,
                email: row.get(2)?,
                imap: ServerSettings {
                    host: row.get(3)?,
                    port: row.get::<_, u16>(4)?,
                    security: security_from_str(&row.get::<_, String>(5)?),
                    allow_invalid_tls: row.get::<_, i64>(6)? != 0,
                },
                smtp: ServerSettings {
                    host: row.get(7)?,
                    port: row.get::<_, u16>(8)?,
                    security: security_from_str(&row.get::<_, String>(9)?),
                    allow_invalid_tls: row.get::<_, i64>(10)? != 0,
                },
                auth_kind: MailAuthKind::from_db_str(&auth_raw),
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn get_imap_last_uid(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
) -> Result<u32, String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|error| error.to_string())?;
    let resolved = resolve_scoped_mailbox_for_account(&connection, account_id, mailbox)
        .map_err(|error| error.to_string())?;
    let value: Option<i64> = connection
        .query_row(
            "SELECT last_uid FROM imap_state WHERE account_id = ?1 AND mailbox = ?2",
            params![account_id.trim(), resolved],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(value.unwrap_or(0).max(0) as u32)
}

/// Remet la sync incrémentale au début pour une boîte (après `UID MOVE` vers cette boîte).
pub fn reset_imap_last_uid(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
) -> Result<(), String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|error| error.to_string())?;
    let resolved = resolve_scoped_mailbox_for_account(&connection, account_id, mailbox)
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "
            INSERT INTO imap_state (account_id, mailbox, last_uid)
            VALUES (?1, ?2, 0)
            ON CONFLICT(account_id, mailbox) DO UPDATE SET
                last_uid = 0,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            ",
            params![account_id.trim(), resolved],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn set_imap_last_uid(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
    last_uid: u32,
) -> Result<(), String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|error| error.to_string())?;
    connection
        .execute(
            "
            INSERT INTO imap_state (account_id, mailbox, last_uid)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(account_id, mailbox) DO UPDATE SET
                last_uid = excluded.last_uid,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            ",
            params![account_id, mailbox, last_uid as i64],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn get_imap_uid_validity(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
) -> Result<Option<u32>, String> {
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|error| error.to_string())?;
    let resolved = resolve_scoped_mailbox_for_account(&connection, account_id, mailbox)
        .map_err(|error| error.to_string())?;
    let value: Option<Option<i64>> = connection
        .query_row(
            "SELECT uidvalidity FROM imap_state WHERE account_id = ?1 AND mailbox = ?2",
            params![account_id.trim(), resolved],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(value.flatten().map(|v| v.max(0) as u32))
}

fn set_imap_uid_validity(
    connection: &Connection,
    account_id: &str,
    mailbox: &str,
    uid_validity: u32,
) -> Result<(), String> {
    connection
        .execute(
            "
            INSERT INTO imap_state (account_id, mailbox, last_uid, uidvalidity)
            VALUES (?1, ?2, 0, ?3)
            ON CONFLICT(account_id, mailbox) DO UPDATE SET
                uidvalidity = excluded.uidvalidity,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            ",
            params![account_id, mailbox, uid_validity as i64],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// Drop IMAP-synced rows for one mailbox and reset the UID cursor (keeps local stubs without `imap_uid`).
pub(crate) fn invalidate_imap_mailbox_local_state(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
) -> Result<(), String> {
    let mut connection =
        open_sqlite_migrated(db_path.as_ref()).map_err(|error| error.to_string())?;
    let mailbox = resolve_scoped_mailbox_for_account(&connection, account_id, mailbox)
        .map_err(|error| error.to_string())?;
    let tx = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM message_embeddings WHERE message_id IN (
            SELECT id FROM messages WHERE account_id = ?1 AND mailbox = ?2 AND imap_uid IS NOT NULL
        )",
        params![account_id, mailbox],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM message_attachments WHERE message_id IN (
            SELECT id FROM messages WHERE account_id = ?1 AND mailbox = ?2 AND imap_uid IS NOT NULL
        )",
        params![account_id, mailbox],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM messages WHERE account_id = ?1 AND mailbox = ?2 AND imap_uid IS NOT NULL",
        params![account_id, mailbox],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM threads WHERE account_id = ?1 AND mailbox = ?2
         AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = threads.id)",
        params![account_id, mailbox],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO imap_state (account_id, mailbox, last_uid)
         VALUES (?1, ?2, 0)
         ON CONFLICT(account_id, mailbox) DO UPDATE SET
            last_uid = 0,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        params![account_id, mailbox],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(())
}

/// Compare server UIDVALIDITY with stored value; reset local cache when the server renumbered UIDs.
pub(crate) fn ensure_imap_uid_validity(
    db_path: impl AsRef<Path>,
    account_id: &str,
    mailbox: &str,
    server_uid_validity: Option<u32>,
) -> Result<bool, String> {
    let Some(server) = server_uid_validity else {
        return Ok(false);
    };
    let connection = open_sqlite_migrated(db_path.as_ref()).map_err(|error| error.to_string())?;
    let mailbox = resolve_scoped_mailbox_for_account(&connection, account_id, mailbox)
        .map_err(|error| error.to_string())?;
    let stored = get_imap_uid_validity(db_path.as_ref(), account_id, &mailbox)?;
    if stored == Some(server) {
        return Ok(false);
    }
    if stored.is_some() && stored != Some(server) {
        invalidate_imap_mailbox_local_state(db_path.as_ref(), account_id, &mailbox)?;
    }
    set_imap_uid_validity(&connection, account_id, &mailbox, server)?;
    Ok(stored.is_some() && stored != Some(server))
}

pub(crate) fn update_message_read_by_imap_uid(
    connection: &Connection,
    account_id: &str,
    mailbox: &str,
    imap_uid: u32,
    is_read: bool,
) -> Result<bool, String> {
    let n = connection
        .execute(
            "UPDATE messages SET is_read = ?1
             WHERE account_id = ?2 AND mailbox = ?3 AND imap_uid = ?4",
            params![i64::from(is_read), account_id, mailbox, imap_uid as i64],
        )
        .map_err(|error| error.to_string())?;
    Ok(n > 0)
}

fn security_to_str(security: &SecurityMode) -> &'static str {
    match security {
        SecurityMode::StartTls => "starttls",
        SecurityMode::Tls => "tls",
    }
}

fn security_from_str(value: &str) -> SecurityMode {
    match value {
        "tls" => SecurityMode::Tls,
        _ => SecurityMode::StartTls,
    }
}

fn seed_if_empty(connection: &Connection) -> Result<(), rusqlite::Error> {
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM threads", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    for thread in seed_threads() {
        let tags = thread
            .tags
            .iter()
            .map(Tag::as_filter)
            .collect::<Vec<_>>()
            .join(",");
        connection.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![thread.id.0, "", "INBOX", Option::<String>::None, thread.subject, tags],
        )?;

        for (position, message) in thread.messages.into_iter().enumerate() {
            connection.execute(
                "
                INSERT INTO messages (
                    id, thread_id, account_id, mailbox, imap_uid,
                    sender_name, sender_email, subject, received_at,
                    body, body_plain, body_html,
                    message_id_header, in_reply_to, references_header,
                    to_header, cc_header, reply_to_header,
                    is_read, position
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
                ",
                params![
                    message.id.0,
                    thread.id.0,
                    "",
                    "INBOX",
                    Option::<i64>::None,
                    message.sender.name.unwrap_or_default(),
                    message.sender.email,
                    message.subject,
                    message.received_at,
                    message.plain_body,
                    message.plain_body,
                    message.html_body,
                    message.references.message_id_header,
                    message.references.in_reply_to,
                    message.references.references.join(" "),
                    Option::<String>::None,
                    Option::<String>::None,
                    Option::<String>::None,
                    i64::from(message.is_read),
                    position as i64
                ],
            )?;
        }
    }

    Ok(())
}

fn load_threads(connection: &Connection) -> Result<Vec<Thread>, rusqlite::Error> {
    load_threads_inner(connection, None)
}

fn load_threads_scoped(
    connection: &Connection,
    account_id: &str,
    mailbox: &str,
) -> Result<Vec<Thread>, rusqlite::Error> {
    let resolved = resolve_scoped_mailbox_for_account(connection, account_id, mailbox)?;
    load_threads_inner(connection, Some((account_id.trim(), resolved.as_str())))
}

fn load_threads_inner(
    connection: &Connection,
    scope: Option<(&str, &str)>,
) -> Result<Vec<Thread>, rusqlite::Error> {
    let map_row = |row: &rusqlite::Row<'_>| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)? != 0,
        ))
    };

    let mut threads = Vec::new();
    if let Some((account_id, mailbox)) = scope {
        let mut statement = connection.prepare(
            "
            SELECT id, subject, tags, COALESCE(is_followed, 0) FROM threads
            WHERE account_id = ?1 AND lower(trim(mailbox)) = lower(trim(?2))
            ORDER BY
              (SELECT max(received_at) FROM messages WHERE thread_id = threads.id) DESC,
              id
            ",
        )?;
        for row in statement.query_map(params![account_id, mailbox], map_row)? {
            let (id, subject, tags, followed) = row?;
            threads.push(build_thread_from_row(
                connection, id, subject, tags, followed,
            )?);
        }
    } else {
        let mut statement = connection.prepare(
            "
            SELECT id, subject, tags, COALESCE(is_followed, 0) FROM threads
            ORDER BY
              (SELECT max(received_at) FROM messages WHERE thread_id = threads.id) DESC,
              id
            ",
        )?;
        for row in statement.query_map([], map_row)? {
            let (id, subject, tags, followed) = row?;
            threads.push(build_thread_from_row(
                connection, id, subject, tags, followed,
            )?);
        }
    }

    Ok(threads)
}

pub(crate) fn build_thread_from_row(
    connection: &Connection,
    id: String,
    subject: String,
    tags: String,
    followed: bool,
) -> Result<Thread, rusqlite::Error> {
    Ok(Thread {
        id: ThreadId(id.clone()),
        subject,
        tags: parse_tags(&tags),
        entities: Vec::new(),
        messages: load_messages(connection, &id)?,
        followed,
    })
}

/// Clé commune pour même Message-ID RFC, qu’il soit stocké avec ou sans `< >`.
fn normalize_msg_id_for_dedup(raw: Option<&str>) -> Option<String> {
    let s = raw?.trim();
    if s.is_empty() {
        return None;
    }
    if s.contains('<') && s.contains('>') {
        Some(s.to_string())
    } else {
        Some(format!("<{s}>"))
    }
}

/// Une copie SMTP locale (`m-local-sent-*`) puis la synchro IMAP (`m-imap-*`) peuvent référencer
/// le même `message_id_header` avec des IDs SQLite différents — on garde une seule ligne pour l’affichage,
/// en privilégiant la révision serveur lorsqu’un `imap_uid` est présent.
fn dedupe_messages_by_message_id_header(
    messages_with_imap: Vec<(rustymail_domain::Message, Option<i64>)>,
) -> Vec<rustymail_domain::Message> {
    use std::collections::{HashMap, HashSet};

    #[derive(Clone, Copy)]
    struct Best {
        index: usize,
        score: i32,
    }

    fn message_row_score(row_id: &str, imap_uid: Option<i64>) -> i32 {
        let mut s = 0;
        if imap_uid.is_some() {
            s += 100;
        }
        if row_id.starts_with("m-imap-") {
            s += 10;
        } else if row_id.starts_with("m-local-sent-") {
            s += 5;
        }
        s
    }

    let mut drop: HashSet<usize> = HashSet::new();
    let mut best_by_mid: HashMap<String, Best> = HashMap::new();

    for (i, (m, imap_uid)) in messages_with_imap.iter().enumerate() {
        let Some(key) = normalize_msg_id_for_dedup(m.references.message_id_header.as_deref())
        else {
            continue;
        };
        let score = message_row_score(&m.id.0, *imap_uid);
        match best_by_mid.get(&key) {
            None => {
                best_by_mid.insert(key, Best { index: i, score });
            }
            Some(prev) => {
                if score > prev.score {
                    drop.insert(prev.index);
                    best_by_mid.insert(key, Best { index: i, score });
                } else if score < prev.score {
                    drop.insert(i);
                } else if i < prev.index {
                    drop.insert(prev.index);
                    best_by_mid.insert(key, Best { index: i, score });
                } else {
                    drop.insert(i);
                }
            }
        }
    }

    messages_with_imap
        .into_iter()
        .enumerate()
        .filter_map(|(idx, pair)| (!drop.contains(&idx)).then_some(pair.0))
        .collect()
}

fn load_messages(
    connection: &Connection,
    thread_id: &str,
) -> Result<Vec<rustymail_domain::Message>, rusqlite::Error> {
    fn parse_recipients(
        to_header: Option<&str>,
        cc_header: Option<&str>,
    ) -> Vec<rustymail_domain::EmailAddress> {
        let mut recipients = Vec::new();
        for raw in [to_header, cc_header].iter().flatten() {
            if let Ok(list) = mailparse::addrparse(raw) {
                for addr in list.iter() {
                    if let mailparse::MailAddr::Single(single) = addr {
                        let email = single.addr.trim().to_ascii_lowercase();
                        if email.is_empty() {
                            continue;
                        }
                        if recipients.iter().any(|e: &rustymail_domain::EmailAddress| {
                            e.email.eq_ignore_ascii_case(&email)
                        }) {
                            continue;
                        }
                        recipients.push(rustymail_domain::EmailAddress {
                            name: single.display_name.clone(),
                            email,
                        });
                    }
                }
            }
        }
        recipients
    }

    fn parse_one_header_addresses(raw: Option<&str>) -> Vec<rustymail_domain::EmailAddress> {
        let mut out = Vec::new();
        let Some(raw) = raw.filter(|s| !s.trim().is_empty()) else {
            return out;
        };
        if let Ok(list) = mailparse::addrparse(raw) {
            for addr in list.iter() {
                if let mailparse::MailAddr::Single(single) = addr {
                    let email = single.addr.trim().to_ascii_lowercase();
                    if email.is_empty() {
                        continue;
                    }
                    if out.iter().any(|e: &rustymail_domain::EmailAddress| {
                        e.email.eq_ignore_ascii_case(&email)
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

    let mut statement = connection.prepare(
        "
        SELECT id, sender_name, sender_email, subject, received_at,
               COALESCE(body_plain, body) as body_plain,
               body_html,
               message_id_header,
               in_reply_to,
               references_header,
               to_header,
               cc_header,
               reply_to_header,
               authentication_results,
               return_path,
               is_read,
               imap_uid,
               detected_lang
        FROM messages
        WHERE thread_id = ?1
        ORDER BY received_at ASC, position ASC, id ASC
        ",
    )?;

    let pairs: Vec<(rustymail_domain::Message, Option<i64>)> = statement
        .query_map(params![thread_id], |row| {
            let imap_uid: Option<i64> = row.get(16)?;
            let mut msg = message(
                &row.get::<_, String>(0)?,
                &row.get::<_, String>(1)?,
                &row.get::<_, String>(2)?,
                &row.get::<_, String>(3)?,
                &row.get::<_, String>(4)?,
                &row.get::<_, String>(5)?,
                row.get::<_, i64>(15)? != 0,
            );
            msg.html_body = row.get::<_, Option<String>>(6)?;
            msg.references.message_id_header = row.get::<_, Option<String>>(7)?;
            msg.references.in_reply_to = row.get::<_, Option<String>>(8)?;
            let refs = row.get::<_, Option<String>>(9)?.unwrap_or_default();
            msg.references.references = refs.split_whitespace().map(|s| s.to_string()).collect();
            let to_header = row.get::<_, Option<String>>(10)?;
            let cc_header = row.get::<_, Option<String>>(11)?;
            let reply_to_header = row.get::<_, Option<String>>(12)?;
            msg.authentication_results = row.get::<_, Option<String>>(13)?;
            msg.return_path = row.get::<_, Option<String>>(14)?;
            msg.detected_lang = row
                .get::<_, Option<String>>(17)?
                .filter(|s| !s.trim().is_empty());
            let recipients = parse_recipients(to_header.as_deref(), cc_header.as_deref());
            if !recipients.is_empty() {
                msg.recipients = recipients;
            }
            msg.reply_to = parse_one_header_addresses(reply_to_header.as_deref());
            msg.attachments = load_attachments_for_message(connection, &msg.id.0)?;
            Ok((msg, imap_uid))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(dedupe_messages_by_message_id_header(pairs))
}

fn load_attachments_for_message(
    connection: &Connection,
    message_id: &str,
) -> Result<Vec<rustymail_domain::Attachment>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "
        SELECT id, file_name, mime_type, size_bytes, kind, content_id
        FROM message_attachments
        WHERE message_id = ?1
        ORDER BY rowid
        ",
    )?;
    let rows = statement.query_map(params![message_id], |row| {
        let kind_raw: String = row.get(4)?;
        Ok(rustymail_domain::Attachment {
            id: rustymail_domain::AttachmentId(row.get::<_, String>(0)?),
            file_name: row.get(1)?,
            mime_type: row.get(2)?,
            size_bytes: row.get::<_, i64>(3)?.max(0) as u64,
            kind: if kind_raw.eq_ignore_ascii_case("inline") {
                rustymail_domain::AttachmentKind::Inline
            } else {
                rustymail_domain::AttachmentKind::Regular
            },
            content_id: row.get::<_, Option<String>>(5)?,
        })
    })?;
    rows.collect()
}

pub fn peek_attachment_identity(
    db_path: impl AsRef<Path>,
    message_id: &str,
    attachment_id: &str,
) -> Result<(String, String), String> {
    let conn = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    conn.query_row(
        "
        SELECT file_name, mime_type
        FROM message_attachments
        WHERE id = ?1 AND message_id = ?2
        ",
        params![attachment_id.trim(), message_id.trim()],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )
    .map_err(|e| e.to_string())
}

pub fn save_attachment_to_downloads(
    db_path: impl AsRef<Path>,
    message_id: &str,
    attachment_id: &str,
) -> Result<String, String> {
    let conn = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let (file_name, data): (String, Option<Vec<u8>>) = conn
        .query_row(
            "
            SELECT file_name, content_blob
            FROM message_attachments
            WHERE id = ?1 AND message_id = ?2
            ",
            params![attachment_id, message_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let data =
        data.ok_or_else(|| "attachment payload unavailable (resync required)".to_string())?;
    if data.len() > MAX_ATTACHMENT_DOWNLOAD_BYTES {
        return Err(format!(
            "Pièce jointe trop volumineuse pour téléchargement direct (max {} Mo).",
            MAX_ATTACHMENT_DOWNLOAD_BYTES / (1024 * 1024)
        ));
    }
    let base_dir = dirs::download_dir().unwrap_or_else(std::env::temp_dir);
    std::fs::create_dir_all(&base_dir).map_err(|e| e.to_string())?;
    let safe_name = safe_attachment_file_name(&file_name)?;
    let mut path = base_dir.join(&safe_name);
    if path.exists() {
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("attachment");
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        let mut i = 1usize;
        loop {
            let candidate = if ext.is_empty() {
                base_dir.join(format!("{stem}-{i}"))
            } else {
                base_dir.join(format!("{stem}-{i}.{ext}"))
            };
            if !candidate.exists() {
                path = candidate;
                break;
            }
            i += 1;
        }
    }
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

fn safe_attachment_file_name(file_name: &str) -> Result<String, String> {
    let base = std::path::Path::new(file_name.trim())
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "nom de pièce jointe invalide (chemin traversant refusé)".to_string())?
        .to_string();
    let cleaned: String = base
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .chars()
        .take(180)
        .collect();
    if cleaned.is_empty() {
        Err("nom de pièce jointe invalide".into())
    } else {
        Ok(cleaned)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineAttachmentPayload {
    pub mime_type: String,
    pub data_base64: String,
}

/// Résolution `cid:…` → corps stocké après sync IMAP (`content_blob` + `content_id`).
pub fn inline_attachment_payload_by_content_id(
    db_path: impl AsRef<Path>,
    message_id: &str,
    cid_token: &str,
) -> Result<Option<InlineAttachmentPayload>, String> {
    let cid_key = cid_token
        .trim()
        .trim_matches(|c| c == '<' || c == '>')
        .to_ascii_lowercase();
    if cid_key.is_empty() {
        return Ok(None);
    }
    let conn = open_sqlite_migrated(db_path.as_ref()).map_err(|e| e.to_string())?;
    let row: Result<(String, Option<Vec<u8>>), rusqlite::Error> = conn.query_row(
        "
        SELECT mime_type, content_blob
        FROM message_attachments
        WHERE message_id = ?1 AND lower(trim(content_id)) = ?2
        ",
        params![message_id.trim(), cid_key.as_str()],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );
    let (mime_type, blob) = match row {
        Ok(r) => r,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let Some(bytes) = blob.filter(|b| !b.is_empty()) else {
        return Ok(None);
    };
    if bytes.len() > MAX_INLINE_IMAGE_BYTES {
        return Ok(None);
    }
    let mime_type = if mime_type.trim().is_empty() {
        "application/octet-stream".to_string()
    } else {
        mime_type
    };
    if !safe_inline_image_mime(&mime_type) {
        return Ok(None);
    }
    Ok(Some(InlineAttachmentPayload {
        mime_type,
        data_base64: STANDARD.encode(bytes),
    }))
}

fn safe_inline_image_mime(mime_type: &str) -> bool {
    matches!(
        mime_type.trim().to_ascii_lowercase().as_str(),
        "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/bmp"
    )
}

pub fn open_path_in_os(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
}

pub(crate) fn parse_tags(input: &str) -> Vec<Tag> {
    input
        .split(',')
        .filter_map(|tag| {
            let (family, value) = tag.split_once(':')?;
            let value = value.trim();
            if value.is_empty() {
                return None;
            }
            match family.trim() {
                "source" => Some(Tag::source(value)),
                "kind" => Some(Tag::kind(value)),
                "entity" => Some(Tag::entity(value)),
                "state" => Some(Tag {
                    family: rustymail_domain::TagFamily::State,
                    value: value.to_string(),
                }),
                _ => None,
            }
        })
        .collect()
}

/// Tags distincts présents en base (fils + messages) pour autocomplétion recherche.
pub fn sqlite_list_distinct_tags(
    db_path: &std::path::Path,
    account_id: &str,
) -> Result<Vec<Tag>, String> {
    let aid = account_id.trim();
    if aid.is_empty() {
        return Ok(Vec::new());
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut out: Vec<Tag> = Vec::new();
    let ingest = |raw: &str, out: &mut Vec<Tag>, seen: &mut std::collections::HashSet<String>| {
        for tag in parse_tags(raw) {
            let key = tag.as_filter();
            if seen.insert(key) {
                out.push(tag);
            }
        }
    };
    let mut stmt = conn
        .prepare("SELECT tags FROM threads WHERE account_id = ?1 AND trim(tags) != ''")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![aid], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    for row in rows {
        ingest(&row.map_err(|e| e.to_string())?, &mut out, &mut seen);
    }
    out.sort_by(|a, b| a.as_filter().cmp(&b.as_filter()));
    Ok(out)
}

#[cfg(test)]
mod imap_uid_validity_tests {
    use super::*;

    fn test_db() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("imap_p0.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
             VALUES ('a1', 'Test', 't@example.com', 'h', 993, 'tls', 0, 'h', 465, 'tls', 0)",
            [],
        )
        .expect("account");
        (dir, path)
    }

    #[test]
    fn get_uid_validity_treats_sql_null_as_unknown() {
        let (_dir, path) = test_db();
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO imap_state (account_id, mailbox, last_uid, uidvalidity)
             VALUES ('a1', 'INBOX', 10, NULL)",
            [],
        )
        .expect("state");
        let uv = get_imap_uid_validity(&path, "a1", "INBOX").expect("read");
        assert_eq!(uv, None);
    }

    #[test]
    fn uid_validity_change_purges_imap_messages_and_resets_cursor() {
        let (_dir, path) = test_db();
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO imap_state (account_id, mailbox, last_uid, uidvalidity)
             VALUES ('a1', 'INBOX', 42, 100)",
            [],
        )
        .expect("state");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags)
             VALUES ('t1', 'a1', 'INBOX', 'm1', 'Hi', '')",
            [],
        )
        .expect("thread");
        conn.execute(
            "INSERT INTO messages (id, thread_id, account_id, mailbox, imap_uid, sender_name, sender_email, subject, received_at, body, is_read, position)
             VALUES ('m-imap', 't1', 'a1', 'INBOX', 7, 'A', 'a@x.com', 'Hi', '2026-01-01', 'b', 0, 0)",
            [],
        )
        .expect("imap msg");
        conn.execute(
            "INSERT INTO messages (id, thread_id, account_id, mailbox, imap_uid, sender_name, sender_email, subject, received_at, body, is_read, position)
             VALUES ('m-local', 't1', 'a1', 'INBOX', NULL, 'Me', 'me@x.com', 'Draft', '2026-01-02', 'b', 0, 1)",
            [],
        )
        .expect("local stub");

        let reset = ensure_imap_uid_validity(&path, "a1", "INBOX", Some(200)).expect("check");
        assert!(reset);

        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE account_id = 'a1' AND mailbox = 'INBOX'",
                [],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(remaining, 1);
        let last_uid = get_imap_last_uid(&path, "a1", "INBOX").expect("last");
        assert_eq!(last_uid, 0);
        let uv = get_imap_uid_validity(&path, "a1", "INBOX").expect("uv");
        assert_eq!(uv, Some(200));
    }

    #[test]
    fn update_read_flag_by_imap_uid() {
        let (_dir, path) = test_db();
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags)
             VALUES ('t1', 'a1', 'INBOX', 'm1', 'Hi', '')",
            [],
        )
        .expect("thread");
        conn.execute(
            "INSERT INTO messages (id, thread_id, account_id, mailbox, imap_uid, sender_name, sender_email, subject, received_at, body, is_read, position)
             VALUES ('m1', 't1', 'a1', 'INBOX', 99, 'A', 'a@x.com', 'Hi', '2026-01-01', 'b', 0, 0)",
            [],
        )
        .expect("msg");
        assert!(update_message_read_by_imap_uid(&conn, "a1", "INBOX", 99, true).expect("update"));
        let read: i64 = conn
            .query_row("SELECT is_read FROM messages WHERE id = 'm1'", [], |row| {
                row.get(0)
            })
            .expect("read");
        assert_eq!(read, 1);
    }
}

#[cfg(test)]
mod search_tags_tests {
    use super::*;

    #[test]
    fn sqlite_list_distinct_tags_reads_thread_tags_csv() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("tags.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
             VALUES ('a1', 'Test', 't@example.com', 'h', 993, 'ssl', 0, 'h', 465, 'ssl', 0)",
            [],
        )
        .expect("account");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags, is_followed)
             VALUES ('t1', 'a1', 'INBOX', 'm1', 'Sujet', 'source:imap,kind:inbox,kind:lang-fr', 0)",
            [],
        )
        .expect("thread");
        let tags = sqlite_list_distinct_tags(&path, "a1").expect("list");
        let filters: Vec<String> = tags.iter().map(|t| t.as_filter()).collect();
        assert!(filters.contains(&"kind:inbox".to_string()));
        assert!(filters.contains(&"source:imap".to_string()));
    }
}

#[cfg(test)]
mod unified_inbox_tests {
    use super::*;

    fn insert_account(conn: &Connection, id: &str, email: &str) {
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
             VALUES (?1, 'Test', ?2, 'h', 993, 'tls', 0, 'h', 465, 'tls', 0)",
            params![id, email],
        )
        .expect("account");
    }

    fn insert_thread_msg(
        conn: &Connection,
        account_id: &str,
        thread_id: &str,
        mailbox: &str,
        received_at: &str,
        subject: &str,
    ) {
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags, is_followed)
             VALUES (?1, ?2, ?3, ?4, ?5, '', 0)",
            params![thread_id, account_id, mailbox, format!("root-{thread_id}"), subject],
        )
        .expect("thread");
        conn.execute(
            "INSERT INTO messages (id, thread_id, account_id, mailbox, imap_uid, sender_name, sender_email, subject, received_at, body, is_read, position)
             VALUES (?1, ?2, ?3, ?4, 1, 'A', 'a@x.com', ?5, ?6, 'body', 0, 0)",
            params![
                format!("msg-{thread_id}"),
                thread_id,
                account_id,
                mailbox,
                subject,
                received_at
            ],
        )
        .expect("message");
    }

    #[test]
    fn unified_inbox_merges_accounts_excludes_non_inbox_orders_by_activity() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("unified.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        insert_account(&conn, "acc-a", "a@example.com");
        insert_account(&conn, "acc-b", "b@example.com");
        insert_thread_msg(
            &conn,
            "acc-a",
            "t-old",
            "INBOX",
            "2026-01-01T10:00:00Z",
            "Older inbox",
        );
        insert_thread_msg(
            &conn,
            "acc-b",
            "t-new",
            "INBOX",
            "2026-06-01T12:00:00Z",
            "Newer inbox",
        );
        insert_thread_msg(
            &conn,
            "acc-a",
            "t-sent",
            "Sent",
            "2026-07-01T12:00:00Z",
            "Sent only",
        );
        drop(conn);

        let page = sqlite_list_threads_page_unified_inbox(&path, 50, 0).expect("list");
        let ids: Vec<&str> = page.iter().map(|t| t.id.0.as_str()).collect();
        assert_eq!(ids, vec!["t-new", "t-old"]);
        assert_eq!(page[0].account_id.as_deref(), Some("acc-b"));
        assert_eq!(page[1].account_id.as_deref(), Some("acc-a"));
        assert!(!ids.contains(&"t-sent"));

        let page2 = sqlite_list_threads_page_unified_inbox(&path, 1, 1).expect("page2");
        assert_eq!(page2.len(), 1);
        assert_eq!(page2[0].id.0, "t-old");
    }
}

#[cfg(test)]
mod ai_cache_tests {
    use super::*;

    fn test_db() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("ai_cache.db");
        let _ = open_sqlite_migrated(&path).expect("migrate");
        (dir, path)
    }

    #[test]
    fn ttl_by_prefix() {
        assert_eq!(ai_cache_ttl_secs_for_key("summary:v2:x"), 7 * 24 * 3600);
        assert_eq!(ai_cache_ttl_secs_for_key("translate:v2:x"), 30 * 24 * 3600);
        assert_eq!(
            ai_cache_ttl_secs_for_key("contact_profile:v1:x"),
            14 * 24 * 3600
        );
    }

    #[test]
    fn put_sets_expires_at_and_purge_removes_stale() {
        let (_dir, path) = test_db();
        let key = "summary:v2:test:p1:thread-1";
        sqlite_ai_cache_put(&path, key, r#"{"ok":true}"#).expect("put");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        let expires: Option<String> = conn
            .query_row(
                "SELECT expires_at FROM ai_cache WHERE cache_key = ?1",
                params![key],
                |row| row.get(0),
            )
            .expect("row");
        assert!(expires.as_deref().is_some_and(|s| !s.is_empty()));
        conn.execute(
            "UPDATE ai_cache SET expires_at = datetime('now', '-1 hour') WHERE cache_key = ?1",
            params![key],
        )
        .expect("backdate");
        assert!(
            sqlite_ai_cache_get(&path, key).expect("get").is_none(),
            "expired entry hidden from get"
        );
        let purged = sqlite_ai_cache_purge_expired(&path).expect("purge");
        assert!(purged >= 1);
    }

    #[test]
    fn backfill_null_expires_uses_created_at_and_prefix_ttl() {
        let (_dir, path) = test_db();
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO ai_cache (cache_key, payload_json, expires_at) VALUES ('summary:v2:legacy:p1:t1', '{}', NULL)",
            [],
        )
        .expect("insert legacy");
        conn.execute(
            "INSERT INTO ai_cache (cache_key, payload_json, expires_at) VALUES ('translate:v2:legacy:p1:thread:1:fr', '{}', NULL)",
            [],
        )
        .expect("insert legacy translate");
        let n = sqlite_ai_cache_backfill_null_expires(&path).expect("backfill");
        assert_eq!(n, 2);
        let ex_sum: String = conn
            .query_row(
                "SELECT expires_at FROM ai_cache WHERE cache_key = 'summary:v2:legacy:p1:t1'",
                [],
                |row| row.get(0),
            )
            .expect("row");
        assert!(!ex_sum.is_empty());
        let ex_tr: String = conn
            .query_row(
                "SELECT expires_at FROM ai_cache WHERE cache_key = 'translate:v2:legacy:p1:thread:1:fr'",
                [],
                |row| row.get(0),
            )
            .expect("row");
        assert!(!ex_tr.is_empty());
        // Translate TTL (30d) > summary TTL (7d) from same created_at → translate expires_at should be later
        assert!(
            ex_tr > ex_sum,
            "translate expiry should be after summary: sum={ex_sum} tr={ex_tr}"
        );
    }
}

#[cfg(test)]
mod resolve_scoped_mailbox_tests {
    use super::resolve_scoped_mailbox_for_account;
    use rusqlite::Connection;

    #[test]
    fn inbox_ui_name_resolves_to_gmail_inbox_wire_name() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE threads (id TEXT, account_id TEXT, mailbox TEXT);
             CREATE TABLE imap_state (account_id TEXT, mailbox TEXT);
             INSERT INTO threads VALUES ('t1', 'user@gmail.com', '[Gmail]/Inbox');",
        )
        .unwrap();
        let resolved =
            resolve_scoped_mailbox_for_account(&conn, "user@gmail.com", "INBOX").unwrap();
        assert_eq!(resolved, "[Gmail]/Inbox");
    }
}

#[cfg(test)]
mod oauth_account_secrets_tests {
    use super::*;

    #[test]
    fn password_auth_save_requires_new_or_existing_secret() {
        assert!(!password_auth_save_allowed("", false));
        assert!(password_auth_save_allowed("secret", false));
        assert!(password_auth_save_allowed("", true));
    }
}

#[cfg(test)]
mod attachment_io_policy_tests {
    use super::*;

    #[test]
    fn safe_attachment_file_name_strips_path_and_shell_chars() {
        let cleaned = safe_attachment_file_name(r#"C:\tmp\invoice<bad>.pdf"#).unwrap();
        assert!(cleaned.ends_with("invoice_bad_.pdf"), "{cleaned}");
        assert!(!cleaned.contains('<'));
        assert!(!cleaned.contains('>'));
        assert!(safe_attachment_file_name("..").is_err());
    }

    #[test]
    fn inline_images_are_allowlisted() {
        assert!(safe_inline_image_mime("image/png"));
        assert!(safe_inline_image_mime("image/jpeg"));
        assert!(!safe_inline_image_mime("image/svg+xml"));
        assert!(!safe_inline_image_mime("text/html"));
    }
}

pub fn seed_threads() -> Vec<Thread> {
    vec![
        Thread {
            id: ThreadId("t1".to_string()),
            subject: "Aether Audio Pro Launch — Final Coordination".to_string(),
            tags: vec![Tag::kind("coordination"), Tag::source("meridianpr.com")],
            entities: Vec::new(),
            followed: false,
            messages: vec![
                message(
                    "m1",
                    "David Park",
                    "david@meridianpr.com",
                    "Aether Audio Pro Launch — Final Coordination",
                    "09:02",
                    "Team, we are 72 hours out from the Aether Audio Pro launch. I need everyone to lock deliverables by EOD.\n\nPress kit: Elena, visuals finalized?\nEmbargo: Sarah, confirm outlets aligned Thursday 9AM ET.\nSpecs: James, anything changed?",
                    false,
                ),
                message(
                    "m2",
                    "Elena Vasquez",
                    "elena@meridianpr.com",
                    "Aether Audio Pro Launch — Final Coordination",
                    "09:15",
                    "Press kit visuals finalized.\n\n- High-res renders\n- Lifestyle photography\n- B-roll footage\n- Brand guidelines one-pager",
                    true,
                ),
                message(
                    "m3",
                    "Sarah Chen",
                    "sarah@meridianpr.com",
                    "Aether Audio Pro Launch — Final Coordination",
                    "09:23",
                    "Confirmed placements:\n\n1. The Verge — feature\n2. Wired — 1200 words\n3. TechCrunch\n4. Engadget\n\nEmbargo Thursday 9AM ET. All NDAs signed.",
                    true,
                ),
                message(
                    "m4",
                    "James Liu",
                    "james@meridianpr.com",
                    "Aether Audio Pro Launch — Final Coordination",
                    "09:41",
                    "Key change: battery revised to 38 hours from the 36-hour estimate based on final firmware.\n\nOther specs locked: 50mm beryllium drivers, adaptive 6-mic ANC, aptX Lossless, 268g.",
                    true,
                ),
            ],
        },
        Thread {
            id: ThreadId("t2".to_string()),
            subject: "Q2 Media Coverage Report".to_string(),
            tags: vec![Tag::kind("report"), Tag::source("client.example")],
            entities: Vec::new(),
            followed: false,
            messages: vec![
                message(
                    "m5",
                    "Rachel Torres",
                    "rachel@client.example",
                    "Q2 Media Coverage Report",
                    "Yesterday",
                    "Q2 media coverage summary:\n\n- 47 placements\n- 340% of target\n- 12.8M impressions\n- Tier-1 hit rate: 78%",
                    false,
                ),
                message(
                    "m6",
                    "Sarah Chen",
                    "sarah@meridianpr.com",
                    "Q2 Media Coverage Report",
                    "Yesterday",
                    "Incredible numbers. The Bloomberg feature alone is worth the quarter. Client deck by Friday with top 10 placements.",
                    true,
                ),
            ],
        },
        Thread {
            id: ThreadId("t3".to_string()),
            subject: "Press Inquiry: Bloomberg Tech — AI in PR".to_string(),
            tags: vec![Tag::kind("discussion"), Tag::source("bloomberg.net")],
            entities: Vec::new(),
            followed: false,
            messages: vec![message(
                "m7",
                "Aisha Patel",
                "aisha.patel@bloomberg.net",
                "Press Inquiry: Bloomberg Tech — AI in PR",
                "14 Mar",
                "Hi Sarah,\n\nI am Aisha Patel at Bloomberg Tech. Working on a feature about PR agencies adopting AI tools, specifically local/private AI vs cloud.\n\nGiven Meridian's privacy-first stance, I would love your perspective. 20-minute call this week?\n\nDeadline: Next Tuesday.",
                false,
            )],
        },
        Thread {
            id: ThreadId("t4".to_string()),
            subject: "Budget Review — Q3 Projection".to_string(),
            tags: vec![Tag::kind("discussion"), Tag::source("meridianpr.com")],
            entities: Vec::new(),
            followed: false,
            messages: vec![message(
                "m8",
                "Daniel Kim",
                "daniel@meridianpr.com",
                "Budget Review — Q3 Projection",
                "8 Mar",
                "Q3 budget ready.\n\nRevenue: $82,000, up 22% QoQ.\nLine items: Aether $18.5K, NovaTech $12K, CES $15K, Offsite $8.5K.\n\nCash flow tight. NovaTech Net 45 creates a gap.",
                true,
            )],
        },
    ]
}
