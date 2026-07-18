use rustymail_application::{AppCapabilities, AppCore};
use rustymail_domain::{
    Account, AccountId, DiscussionThreadView, Draft, DraftPreview, MailAuthKind, SearchQuery,
    SecurityMode, ServerSettings, ThreadId, ThreadListItem,
};
use rustymail_infrastructure::SplitSendResult;
use rustymail_infrastructure::{
    build_llm_status, decode_audio_base64, dictation_api_key_clear, dictation_api_key_present,
    dictation_api_key_set, ensure_local_llm_gguf_download, list_cached_gguf_filenames,
    llm_gguf_download_cancel_clear, llm_gguf_download_cancel_request,
    llama_server_api_key_clear,
    llama_server_api_key_present, llama_server_api_key_set, openrouter_api_key_clear,
    openrouter_api_key_present,
    openrouter_api_key_set,
    llm_singleton, load_app_prefs, prefs_path_from_db_dir, peek_attachment_identity,
    persist_allow_invalid_tls_from_ui_checkbox,
    attachment_needs_explicit_ack, save_app_prefs_validated,
    log_attachment_audited, PREFIX_RISK_CONFIRM,
    transcribe_and_maybe_translate, AppPrefs, DraftRevisionListItem, ImapSyncResult, NewsletterRule,
    SavedDraftListItem, SavedDraftOpenResult, SemanticReindexStats, SyncMailboxesOutcome,
};
mod ipc_guard;
mod llama_server_spawn;
mod address_commands;
mod llm_assist;
mod llm_commands;
mod llm_stream;
mod folder_commands;
mod org_commands;
mod saved_search_commands;
mod activity_commands;
mod imap_push;
mod rate_guard;
mod llama_winget;
mod minilm_download;
mod model_bootstrap;
mod whisper_dictation;
mod webview_microphone;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Emitter;
use tauri::Manager;
use tauri::State;

#[derive(Clone)]
struct AppPaths {
    db_path: PathBuf,
    prefs_path: PathBuf,
    models_dir: PathBuf,
    llm_models_dir: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppPathsView {
    db_path: String,
    prefs_path: String,
    models_dir: String,
    llm_models_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStatus {
    app_name: &'static str,
    version: &'static str,
    wal_enabled: bool,
    vault_key_location: &'static str,
    ai_runtime: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MailboxUnreadCount {
    mailbox: String,
    unread_count: usize,
    total_threads: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranscribeDictationArgs {
    /// WebM/Opus ou autre (cloud / compagnon HTTP).
    audio_base64: String,
    /// WAV PCM s16le mono 16 kHz — requis pour `whisper_cpp`.
    #[serde(default)]
    audio_wav_base64: Option<String>,
    file_name: String,
    mime_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DictationTestRunView {
    duration_s: f32,
    rms: f32,
    elapsed_ms: u128,
    text: Option<String>,
    error: Option<whisper_dictation::WhisperError>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoverMailServersResult {
    imap_host: String,
    imap_port: u16,
    imap_security: SecurityMode,
    imap_allow_invalid_tls: bool,
    smtp_host: String,
    smtp_port: u16,
    smtp_security: SecurityMode,
    smtp_allow_invalid_tls: bool,
    source: String,
    source_label: String,
}

fn discovery_source_label(key: &str) -> &'static str {
    match key {
        "builtin" => "Préréglage local (domaine connu)",
        "mozilla_ispdb" => "Base Mozilla Thunderbird (ISPDB)",
        "well_known" => "Fichier .well-known/autoconfig sur le domaine",
        "autoconfig_subdomain" => "Serveur autoconfig du domaine",
        _ => "Configuration distante",
    }
}

#[tauri::command]
async fn discover_mail_servers(email: String) -> Result<DiscoverMailServersResult, String> {
    let d = rustymail_infrastructure::discover_mail_servers(&email).await?;
    let source_key = d.source.to_string();
    Ok(DiscoverMailServersResult {
        imap_host: d.imap.host,
        imap_port: d.imap.port,
        imap_security: d.imap.security,
        imap_allow_invalid_tls: d.imap.allow_invalid_tls,
        smtp_host: d.smtp.host,
        smtp_port: d.smtp.port,
        smtp_security: d.smtp.security,
        smtp_allow_invalid_tls: d.smtp.allow_invalid_tls,
        source_label: discovery_source_label(&source_key).to_string(),
        source: source_key,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OAuthDesktopLoginOutcomeView {
    email: String,
    display_name: Option<String>,
    redirect_uri: String,
    ephemeral_redirect: bool,
}

#[tauri::command]
async fn oauth_google_desktop_login_cmd() -> Result<OAuthDesktopLoginOutcomeView, String> {
    let cid = std::env::var("RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID").map_err(|_| {
        "RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID manquant. Définissez la variable (même terminal que `tauri dev`, \
         redémarrage de Cursor après modification dans Windows, ou fichier `.env` à la racine du dépôt — voir `.env.example`)."
            .to_string()
    })?;
    // Valide aussi RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET avant d’ouvrir le navigateur.
    let o = rustymail_infrastructure::oauth_google_desktop_login(&cid).await?;
    Ok(OAuthDesktopLoginOutcomeView {
        email: o.email,
        display_name: o.display_name,
        redirect_uri: o.redirect_uri,
        ephemeral_redirect: o.ephemeral_redirect,
    })
}

#[tauri::command]
async fn oauth_microsoft_desktop_login_cmd() -> Result<OAuthDesktopLoginOutcomeView, String> {
    let cid = std::env::var("RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID").map_err(|_| {
        "RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID manquant. Même remarques que pour Google : terminal, redémarrage Cursor, ou `.env` à la racine du dépôt."
            .to_string()
    })?;
    let o = rustymail_infrastructure::oauth_microsoft_desktop_login(&cid).await?;
    Ok(OAuthDesktopLoginOutcomeView {
        email: o.email,
        display_name: o.display_name,
        redirect_uri: o.redirect_uri,
        ephemeral_redirect: o.ephemeral_redirect,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveAccountRequest {
    display_name: String,
    email: String,
    password: String,
    #[serde(default)]
    auth_kind: MailAuthKind,
    imap_host: String,
    imap_port: u16,
    imap_security: SecurityMode,
    #[serde(default)]
    imap_allow_invalid_tls: bool,
    smtp_host: String,
    smtp_port: u16,
    smtp_security: SecurityMode,
    #[serde(default)]
    smtp_allow_invalid_tls: bool,
    /// Lorsque l’email (clé de compte) change, passe l’identifiant précédent pour migrer SQLite + trousseau.
    #[serde(default)]
    previous_account_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenAttachmentInvoke {
    message_id: String,
    attachment_id: String,
    #[serde(default)]
    risk_acknowledged: bool,
    #[serde(default)]
    open_ack: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadAttachmentInvoke {
    message_id: String,
    attachment_id: String,
}

#[tauri::command]
fn app_status() -> AppStatus {
    AppStatus {
        app_name: "RustyMail",
        version: env!("CARGO_PKG_VERSION"),
        wal_enabled: true,
        vault_key_location: "OS Keyring",
        ai_runtime: "whisper.cpp (dictée locale)",
    }
}

#[tauri::command]
fn app_paths(paths: State<'_, AppPaths>) -> AppPathsView {
    let db_path = paths.db_path.display().to_string();
    AppPathsView {
        db_path,
        prefs_path: paths.prefs_path.display().to_string(),
        models_dir: paths.models_dir.display().to_string(),
        llm_models_dir: paths.llm_models_dir.display().to_string(),
    }
}

#[tauri::command]
fn semantic_model_available() -> bool {
    rustymail_infrastructure::semantic_model_present()
}

#[tauri::command]
fn semantic_embedding_counts(
    paths: State<'_, AppPaths>,
    account_id: String,
    mailbox: String,
) -> Result<rustymail_infrastructure::SemanticEmbeddingCountsSnapshot, String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_mailbox(&mailbox)?;
    rustymail_infrastructure::semantic_embedding_counts_snapshot(
        &paths.db_path,
        account_id.trim(),
        mailbox.trim(),
    )
}

/// Indexe tous les messages du compte présents localement (toutes boîtes SQLite).
#[tauri::command]
async fn reindex_semantic_account_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
) -> Result<SemanticReindexStats, String> {
    ipc_guard::validate_account_id(&account_id)?;
    rate_guard::cooldown(
        format!("reindex_semantic_account:{}", account_id.trim()),
        std::time::Duration::from_secs(3),
    )?;
    let db = paths.db_path.clone();
    let aid = account_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        rustymail_infrastructure::reindex_semantic_account(&db, &aid, true)
    })
    .await
    .map_err(|e| format!("reindex compte join: {e}"))?
}

#[tauri::command]
async fn reindex_semantic_mailbox_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
    mailbox: String,
) -> Result<SemanticReindexStats, String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_mailbox(&mailbox)?;
    rate_guard::cooldown(
        format!(
            "reindex_semantic_mb:{}:{}",
            account_id.trim(),
            mailbox.trim().chars().take(80).collect::<String>()
        ),
        std::time::Duration::from_secs(3),
    )?;
    let db = paths.db_path.clone();
    let aid = account_id.clone();
    let mbx = mailbox.clone();
    tauri::async_runtime::spawn_blocking(move || {
        rustymail_infrastructure::reindex_semantic_mailbox(&db, &aid, &mbx, true)
    })
    .await
    .map_err(|e| format!("reindex join: {e}"))?
}

#[tauri::command]
fn capabilities(core: State<'_, Mutex<AppCore>>) -> Result<AppCapabilities, String> {
    let core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
    Ok(core.capabilities())
}

/// Refresh in-memory `AppCore` from SQLite, optionally scoped to one IMAP account and mailbox.
/// Without `accountId` + `mailbox`, loads the full local store (démo / navigateur).
#[tauri::command]
fn list_threads(
    core: State<'_, Mutex<AppCore>>,
    paths: State<'_, AppPaths>,
    account_id: Option<String>,
    mailbox: Option<String>,
    page_size: Option<usize>,
    page_offset: Option<usize>,
    followed_only: Option<bool>,
    account_wide: Option<bool>,
) -> Result<Vec<ThreadListItem>, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    ipc_guard::validate_optional_mailbox(mailbox.as_deref())?;
    let normalized_page_size = ipc_guard::normalize_page_size(page_size, 50)?;
    let normalized_page_offset = ipc_guard::normalize_page_offset(page_offset)?;
    if followed_only == Some(true) {
        if let Some(a) = account_id.as_deref() {
            let a = a.trim();
            if !a.is_empty() {
                return rustymail_infrastructure::sqlite_list_followed_threads_page(
                    &paths.db_path,
                    a,
                    normalized_page_size,
                    normalized_page_offset,
                )
                .map_err(|e| e.to_string());
            }
        }
    }
    if account_wide == Some(true) {
        if let Some(a) = account_id.as_deref() {
            let a = a.trim();
            if !a.is_empty() {
                return rustymail_infrastructure::sqlite_list_threads_page_account(
                    &paths.db_path,
                    a,
                    normalized_page_size,
                    normalized_page_offset,
                )
                .map_err(|e| e.to_string());
            }
        }
    }
    if let (Some(a), Some(m), Some(_size), Some(_offset)) = (
        account_id.as_deref(),
        mailbox.as_deref(),
        page_size,
        page_offset,
    ) {
        if !a.trim().is_empty() && !m.trim().is_empty() {
            return rustymail_infrastructure::sqlite_list_threads_page_scoped(
                &paths.db_path,
                a.trim(),
                m,
                normalized_page_size,
                normalized_page_offset,
            )
            .map_err(|e| e.to_string());
        }
    }
    let reloaded = match (account_id.as_deref(), mailbox.as_deref()) {
        (Some(a), Some(m)) if !a.trim().is_empty() && !m.trim().is_empty() => {
            rustymail_infrastructure::sqlite_app_core_scoped(&paths.db_path, a.trim(), m)
        }
        _ => rustymail_infrastructure::sqlite_app_core(&paths.db_path),
    }
    .map_err(|e| e.to_string())?;
    {
        let mut c = core.lock().map_err(|_| "core lock poisoned".to_string())?;
        *c = reloaded;
    }
    let c = core.lock().map_err(|_| "core lock poisoned".to_string())?;
    let items = c.list_threads();
    Ok(items
        .into_iter()
        .skip(normalized_page_offset)
        .take(normalized_page_size)
        .collect())
}

#[tauri::command]
fn search_threads(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
    query: SearchQuery,
) -> Result<Vec<ThreadListItem>, String> {
    ipc_guard::validate_search_query(&query)?;
    let use_sqlite = query
        .account_id
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    if use_sqlite {
        return rustymail_infrastructure::sqlite_search_threads_unified(&paths.db_path, &query)
            .map_err(|e| e.to_string());
    }
    let core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
    Ok(core.search_threads(query))
}

#[tauri::command]
fn list_search_tags(
    paths: State<'_, AppPaths>,
    account_id: String,
) -> Result<Vec<rustymail_domain::Tag>, String> {
    ipc_guard::validate_account_id(&account_id)?;
    rustymail_infrastructure::sqlite_list_distinct_tags(&paths.db_path, account_id.trim())
}

pub(crate) fn enrich_thread_newsletter(
    paths: &AppPaths,
    view: &mut DiscussionThreadView,
) -> Result<(), String> {
    let rules = rustymail_infrastructure::list_newsletter_rules(&paths.db_path)
        .map_err(|e| e.to_string())?;
    let account_emails: Vec<String> = rustymail_infrastructure::load_accounts(&paths.db_path)?
        .into_iter()
        .map(|a| a.email.to_ascii_lowercase())
        .collect();
    rustymail_infrastructure::annotate_newsletter_thread(view, &account_emails, &rules);
    Ok(())
}

fn assert_reply_allowed_for_thread(
    paths: &AppPaths,
    core: &Mutex<AppCore>,
    thread_id: &str,
) -> Result<(), String> {
    ipc_guard::validate_thread_id(thread_id)?;
    let rules = rustymail_infrastructure::list_newsletter_rules(&paths.db_path)
        .map_err(|e| e.to_string())?;
    let account_emails: Vec<String> = rustymail_infrastructure::load_accounts(&paths.db_path)?
        .into_iter()
        .map(|a| a.email.to_ascii_lowercase())
        .collect();
    if let Some(thread) =
        rustymail_infrastructure::sqlite_open_thread_by_id(&paths.db_path, thread_id)
            .map_err(|e| e.to_string())?
    {
        if rustymail_infrastructure::thread_blocks_reply(&thread, &account_emails, &rules) {
            return Err("Ce fil correspond à un expéditeur automatique (règle paramétrée) : la réponse n’est pas proposée.".to_string());
        }
        return Ok(());
    }
    let core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
    let tid = ThreadId(thread_id.to_string());
    let thread = core
        .thread_by_id(&tid)
        .ok_or_else(|| "Fil introuvable.".to_string())?;
    if rustymail_infrastructure::thread_blocks_reply(thread, &account_emails, &rules) {
        return Err("Ce fil correspond à un expéditeur automatique (règle paramétrée) : la réponse n’est pas proposée.".to_string());
    }
    Ok(())
}

#[tauri::command]
fn open_thread(
    core: State<'_, Mutex<AppCore>>,
    paths: State<'_, AppPaths>,
    thread_id: String,
) -> Result<DiscussionThreadView, String> {
    ipc_guard::validate_thread_id(&thread_id)?;
    let mut view = if let Some(thread) =
        rustymail_infrastructure::sqlite_open_thread_by_id(&paths.db_path, &thread_id)
            .map_err(|e| e.to_string())?
    {
        let temp = AppCore::new(vec![thread]);
        temp.open_thread(&ThreadId(thread_id.clone()))
            .map_err(|error| error.to_string())?
    } else {
        let core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
        core.open_thread(&ThreadId(thread_id.clone()))
            .map_err(|error| error.to_string())?
    };
    enrich_thread_newsletter(&paths, &mut view)?;
    Ok(view)
}

#[tauri::command]
async fn summarize_thread(
    core: State<'_, Mutex<AppCore>>,
    paths: State<'_, AppPaths>,
    thread_id: String,
) -> Result<rustymail_modules::ai_summary::SummaryResult, String> {
    ipc_guard::validate_thread_id(&thread_id)?;
    let tid = ThreadId(thread_id.clone());
    let mut view = if let Some(thread) =
        rustymail_infrastructure::sqlite_open_thread_by_id(&paths.db_path, &thread_id)
            .map_err(|e| e.to_string())?
    {
        let temp = AppCore::new(vec![thread]);
        temp.open_thread(&tid).map_err(|e| e.to_string())?
    } else {
        let core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
        core.open_thread(&tid).map_err(|e| e.to_string())?
    };
    enrich_thread_newsletter(&paths, &mut view)?;
    if view.is_newsletter_thread {
        return Ok(rustymail_modules::ai_summary::newsletter_light_summary(
            &view,
        ));
    }

    let prefs = load_app_prefs(&paths.prefs_path);
    if llm_commands::ensure_llm_gate_args(&prefs, &paths).is_ok() {
        let paths_c = Clone::clone(&*paths);
        let view_llm = view.clone();
        let tid_llm = thread_id.clone();
        let llm_out = tauri::async_runtime::spawn_blocking(move || {
            llm_commands::summarize_thread_llm_attempt(&paths_c, &view_llm, tid_llm.as_str())
        })
        .await
        .map_err(|e| format!("summarize_thread llm join: {e}"))?;
        if let Some(s) = llm_out {
            return Ok(s);
        }
    }

    if let Some(thread) =
        rustymail_infrastructure::sqlite_open_thread_by_id(&paths.db_path, &thread_id)
            .map_err(|e| e.to_string())?
    {
        let temp = AppCore::new(vec![thread]);
        return temp
            .summarize_thread(&tid)
            .map_err(|error| error.to_string());
    }
    let core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
    core.summarize_thread(&tid)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn prepare_reply(
    core: State<'_, Mutex<AppCore>>,
    paths: State<'_, AppPaths>,
    thread_id: String,
    message_id: Option<String>,
) -> Result<Draft, String> {
    ipc_guard::validate_optional_message_id(message_id.as_deref())?;
    assert_reply_allowed_for_thread(&paths, &core, &thread_id)?;
    let mid = message_id.as_deref();
    if let Some(thread) =
        rustymail_infrastructure::sqlite_open_thread_by_id(&paths.db_path, &thread_id)
            .map_err(|e| e.to_string())?
    {
        let mut temp = AppCore::new(vec![thread]);
        return temp
            .prepare_reply(&ThreadId(thread_id), mid)
            .map_err(|error| error.to_string());
    }
    let mut core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
    core.prepare_reply(&ThreadId(thread_id), mid)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn prepare_reply_all(
    core: State<'_, Mutex<AppCore>>,
    paths: State<'_, AppPaths>,
    thread_id: String,
) -> Result<Draft, String> {
    assert_reply_allowed_for_thread(&paths, &core, &thread_id)?;
    if let Some(thread) =
        rustymail_infrastructure::sqlite_open_thread_by_id(&paths.db_path, &thread_id)
            .map_err(|e| e.to_string())?
    {
        let mut temp = AppCore::new(vec![thread]);
        return temp
            .prepare_reply_all(&ThreadId(thread_id))
            .map_err(|error| error.to_string());
    }
    let mut core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
    core.prepare_reply_all(&ThreadId(thread_id))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_newsletter_rules(paths: State<'_, AppPaths>) -> Result<Vec<NewsletterRule>, String> {
    rustymail_infrastructure::list_newsletter_rules(&paths.db_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_newsletter_rule(paths: State<'_, AppPaths>, input: String) -> Result<(), String> {
    rustymail_infrastructure::add_newsletter_rule(&paths.db_path, input)
}

#[tauri::command]
fn remove_newsletter_rule(paths: State<'_, AppPaths>, input: String) -> Result<(), String> {
    let rule = rustymail_infrastructure::parse_newsletter_rule_input(&input)?;
    rustymail_infrastructure::remove_newsletter_rule(&paths.db_path, rule.domain, rule.local_part)
}

#[tauri::command]
fn prepare_forward(
    core: State<'_, Mutex<AppCore>>,
    paths: State<'_, AppPaths>,
    thread_id: String,
    message_id: Option<String>,
) -> Result<Draft, String> {
    ipc_guard::validate_thread_id(&thread_id)?;
    ipc_guard::validate_optional_message_id(message_id.as_deref())?;
    let mid = message_id.as_deref();
    if let Some(thread) =
        rustymail_infrastructure::sqlite_open_thread_by_id(&paths.db_path, &thread_id)
            .map_err(|e| e.to_string())?
    {
        let mut temp = AppCore::new(vec![thread]);
        return temp
            .prepare_forward(&ThreadId(thread_id), mid)
            .map_err(|error| error.to_string());
    }
    let mut core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
    core.prepare_forward(&ThreadId(thread_id), mid)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn preview_draft(
    core: State<'_, Mutex<AppCore>>,
    markdown_body: String,
) -> Result<DraftPreview, String> {
    let core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
    Ok(core.preview_draft(markdown_body))
}

const DRAFT_REVISIONS_KEEP_LAST: usize = 200;

#[tauri::command]
fn draft_revision_save(
    paths: State<'_, AppPaths>,
    account_id: String,
    session_id: String,
    draft: Draft,
) -> Result<Option<String>, String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_session_token("sessionId", &session_id)?;
    rustymail_infrastructure::sqlite_draft_revision_save(
        &paths.db_path,
        account_id.trim(),
        session_id.trim(),
        &draft,
        DRAFT_REVISIONS_KEEP_LAST,
    )
}

#[tauri::command]
fn draft_revision_list(
    paths: State<'_, AppPaths>,
    account_id: String,
    session_id: String,
    limit: Option<u32>,
) -> Result<Vec<DraftRevisionListItem>, String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_session_token("sessionId", &session_id)?;
    let lim = limit.unwrap_or(50).max(1).min(200) as usize;
    rustymail_infrastructure::sqlite_draft_revision_list(
        &paths.db_path,
        account_id.trim(),
        session_id.trim(),
        lim,
    )
}

#[tauri::command]
fn draft_revision_restore(
    paths: State<'_, AppPaths>,
    account_id: String,
    revision_id: String,
) -> Result<Option<Draft>, String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_session_token("revisionId", &revision_id)?;
    rustymail_infrastructure::sqlite_draft_revision_get(
        &paths.db_path,
        account_id.trim(),
        revision_id.trim(),
    )
}

const SAVED_DRAFT_LIST_LIMIT_DEFAULT: usize = 200;

#[tauri::command]
fn saved_drafts_count(paths: State<'_, AppPaths>, account_id: String) -> Result<i64, String> {
    ipc_guard::validate_account_id(&account_id)?;
    rustymail_infrastructure::sqlite_saved_drafts_count(&paths.db_path, account_id.trim())
}

#[tauri::command]
fn saved_draft_list(
    paths: State<'_, AppPaths>,
    account_id: String,
    limit: Option<u32>,
) -> Result<Vec<SavedDraftListItem>, String> {
    ipc_guard::validate_account_id(&account_id)?;
    let lim = limit
        .unwrap_or(SAVED_DRAFT_LIST_LIMIT_DEFAULT as u32)
        .max(1)
        .min(500) as usize;
    rustymail_infrastructure::sqlite_saved_draft_list(&paths.db_path, account_id.trim(), lim)
}

#[tauri::command]
fn saved_draft_upsert(
    paths: State<'_, AppPaths>,
    account_id: String,
    session_id: String,
    title: String,
) -> Result<String, String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_session_token("sessionId", &session_id)?;
    rustymail_infrastructure::sqlite_saved_draft_upsert_by_session(
        &paths.db_path,
        account_id.trim(),
        session_id.trim(),
        &title,
    )
}

#[tauri::command]
fn saved_draft_delete(
    paths: State<'_, AppPaths>,
    account_id: String,
    saved_draft_id: String,
) -> Result<(), String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_session_token("savedDraftId", &saved_draft_id)?;
    rustymail_infrastructure::sqlite_saved_draft_delete(
        &paths.db_path,
        account_id.trim(),
        saved_draft_id.trim(),
    )
}

#[tauri::command]
fn saved_draft_open(
    paths: State<'_, AppPaths>,
    account_id: String,
    saved_draft_id: String,
) -> Result<SavedDraftOpenResult, String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_session_token("savedDraftId", &saved_draft_id)?;
    rustymail_infrastructure::sqlite_saved_draft_open(
        &paths.db_path,
        account_id.trim(),
        saved_draft_id.trim(),
    )
}

fn clip_toast_detail(detail: &str, max_chars: usize) -> String {
    let t = detail.trim();
    if t.chars().count() <= max_chars {
        t.to_string()
    } else {
        format!("{}…", t.chars().take(max_chars).collect::<String>())
    }
}

fn send_draft_imap_notice(out: &rustymail_infrastructure::ImapSentCopyOutcome) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(ref e) = out.append_failed {
        parts.push(format!(
            "La copie dans le dossier « Envoyés » sur le serveur (IMAP) n’a pas pu être enregistrée. L’envoi est bien parti. {}",
            clip_toast_detail(e, 140)
        ));
    }
    if let Some(ref e) = out.dedupe_failed {
        parts.push(format!(
            "Impossible de fusionner des doubles dans « Envoyés » (copie serveur + copie cliente). Vous pouvez en supprimer une à la main si besoin. {}",
            clip_toast_detail(e, 120)
        ));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SendDraftOutcome {
    #[serde(skip_serializing_if = "Option::is_none")]
    imap_notice: Option<String>,
}

#[tauri::command]
async fn send_draft(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    draft: Draft,
    send_ack: Option<String>,
) -> Result<SendDraftOutcome, String> {
    ipc_guard::validate_send_draft_ack(send_ack.as_deref())?;
    ipc_guard::validate_draft_for_ipc(&draft)?;
    let to_preview: String = draft
        .to
        .first()
        .map(|r| ipc_guard::audit_email_shadow(&r.email))
        .unwrap_or_default();
    eprintln!(
        "[RustyMail] send_draft: subject_len={} to[0]={} recipients={} pj={}",
        draft.subject.trim().chars().count(),
        to_preview,
        draft.to.len(),
        draft.attachment_paths.len(),
    );
    if draft.attachment_paths.is_empty() {
        eprintln!("[RustyMail] send_draft: attachment_paths liste vide.");
    }
    {
        let core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
        core.send_draft(draft.clone())
            .map_err(|error| error.to_string())?;
    }
    let account = resolve_account_from_paths(&paths, account_id)?;
    eprintln!(
        "[RustyMail] smtp {}:{} → sending…",
        account.smtp.host.trim(),
        account.smtp.port
    );
    let sent = match rustymail_infrastructure::send_draft_via_smtp(&account, &draft).await {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[RustyMail] smtp failed: {e}");
            return Err(e);
        }
    };
    eprintln!("[RustyMail] smtp send ok");
    let imap_copy = rustymail_infrastructure::imap_append_sent_copy(
        &account,
        &sent.rfc822,
        sent.message_id.trim(),
    )
    .await;
    if let Some(ref e) = imap_copy.append_failed {
        eprintln!("[RustyMail] avertissement: copie IMAP Envoyés non enregistrée (envoi OK): {e}");
    }
    if let Some(ref e) = imap_copy.dedupe_failed {
        eprintln!("[RustyMail] avertissement: dédoublonnage Envoyés ignoré (envoi OK): {e}");
    }
    let imap_notice = send_draft_imap_notice(&imap_copy);
    let mid = sent.message_id;
    if let Some(tid) = draft
        .thread_id
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        match rustymail_infrastructure::sqlite_record_sent_message_copy(
            &paths.db_path,
            &account.id.0,
            tid,
            &draft,
            mid.trim(),
            account.display_name.trim(),
            account.email.trim(),
        ) {
            Ok(()) => eprintln!("[RustyMail] local sent message recorded for thread {tid}"),
            Err(e) => eprintln!(
                "[RustyMail] warn: message envoyé mais copie locale SQL échouée (fil {tid}): {e}"
            ),
        }
    } else if matches!(draft.kind, rustymail_domain::DraftKind::New) {
        match rustymail_infrastructure::sqlite_record_sent_starting_thread(
            &paths.db_path,
            &account.id.0,
            &draft,
            mid.trim(),
            account.display_name.trim(),
            account.email.trim(),
        ) {
            Ok(_tid) => eprintln!("[RustyMail] local new thread + sent message recorded"),
            Err(e) => eprintln!(
                "[RustyMail] warn: message envoyé mais fil local (nouveau) non enregistré: {e}"
            ),
        }
    }
    Ok(SendDraftOutcome { imap_notice })
}

/// Calcule un plan de découpage des pièces jointes (tailles lues sur disque).
#[tauri::command]
async fn plan_split_send(draft: Draft) -> Result<rustymail_domain::SplitPlan, String> {
    ipc_guard::validate_draft_for_ipc(&draft)?;
    rustymail_infrastructure::plan_split_draft_attachments(
        &draft.attachment_paths,
        rustymail_infrastructure::DEFAULT_ATTACHMENT_BUDGET_BYTES,
    )
    .await
}

/// Envoie le brouillon en plusieurs mails chaînés (recalcule le plan côté serveur).
#[tauri::command]
async fn execute_split_send_cmd(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    draft: Draft,
    send_ack: Option<String>,
) -> Result<SplitSendResult, String> {
    ipc_guard::validate_send_draft_ack(send_ack.as_deref())?;
    ipc_guard::validate_draft_for_ipc(&draft)?;
    {
        let core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
        core.send_draft(draft.clone()).map_err(|e| e.to_string())?;
    }
    let account = resolve_account_from_paths(&paths, account_id)?;
    Ok(rustymail_infrastructure::execute_split_send(
        &paths.db_path,
        &account,
        &draft,
        rustymail_infrastructure::DEFAULT_ATTACHMENT_BUDGET_BYTES,
    )
    .await)
}

#[tauri::command]
fn download_attachment(
    paths: State<'_, AppPaths>,
    req: DownloadAttachmentInvoke,
) -> Result<String, String> {
    ipc_guard::validate_message_attachment_ids(&req.message_id, &req.attachment_id)?;
    rustymail_infrastructure::save_attachment_to_downloads(
        &paths.db_path,
        req.message_id.trim(),
        req.attachment_id.trim(),
    )
}

#[tauri::command]
fn open_attachment(paths: State<'_, AppPaths>, req: OpenAttachmentInvoke) -> Result<String, String> {
    ipc_guard::validate_message_attachment_ids(&req.message_id, &req.attachment_id)?;
    ipc_guard::validate_open_attachment_ack(req.open_ack.as_deref())?;
    let mid = req.message_id.trim();
    let aid = req.attachment_id.trim();
    let (fname, mime) =
        peek_attachment_identity(&paths.db_path, mid, aid)?;
    if let Some(reason) = attachment_needs_explicit_ack(&fname, &mime) {
        if !req.risk_acknowledged {
            return Err(format!("{PREFIX_RISK_CONFIRM}{reason}"));
        }
    }
    let saved = rustymail_infrastructure::save_attachment_to_downloads(
        &paths.db_path,
        mid,
        aid,
    )?;
    log_attachment_audited("attachment_open_executed", &saved);
    rustymail_infrastructure::open_path_in_os(&saved)?;
    Ok(saved)
}

/// Charge une image (ou autre) référencée par `cid:…` dans le HTML du message.
#[tauri::command]
fn inline_attachment_fetch(
    paths: State<'_, AppPaths>,
    message_id: String,
    cid: String,
) -> Result<Option<rustymail_infrastructure::InlineAttachmentPayload>, String> {
    ipc_guard::validate_message_id(&message_id)?;
    ipc_guard::validate_cid(&cid)?;
    rustymail_infrastructure::inline_attachment_payload_by_content_id(
        &paths.db_path,
        message_id.trim(),
        cid.trim(),
    )
}

#[tauri::command]
fn transcribe_demo(
    core: State<'_, Mutex<AppCore>>,
    current_text: String,
) -> Result<String, String> {
    let core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
    Ok(core.transcribe_demo(current_text))
}

#[tauri::command]
fn get_app_prefs(paths: State<'_, AppPaths>) -> Result<AppPrefs, String> {
    Ok(load_app_prefs(&paths.prefs_path))
}

fn normalize_prefs_before_save(prefs: &mut AppPrefs) {
    rustymail_infrastructure::sync_draft_language_from_mother(prefs);
}

#[tauri::command]
fn set_app_prefs(paths: State<'_, AppPaths>, mut prefs: AppPrefs) -> Result<(), String> {
    normalize_prefs_before_save(&mut prefs);
    save_app_prefs_validated(&paths.prefs_path, &prefs)
}

#[tauri::command]
fn oauth_google_configured() -> bool {
    std::env::var("RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID")
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

#[tauri::command]
fn oauth_microsoft_configured() -> bool {
    std::env::var("RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID")
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

#[tauri::command]
fn llama_server_detect(binary_hint: Option<String>) -> llama_winget::LlamaServerDetectResult {
    llama_winget::detect_llama_server(binary_hint.as_deref().unwrap_or("llama-server"))
}

#[tauri::command]
fn llama_server_winget_install() -> llama_winget::LlamaServerWingetInstallResult {
    llama_winget::install_llama_server_via_winget()
}

#[tauri::command]
fn dictation_api_key_status() -> bool {
    dictation_api_key_present()
}

#[tauri::command]
fn set_dictation_api_key(secret: String) -> Result<(), String> {
    dictation_api_key_set(secret.trim())
}

#[tauri::command]
fn clear_dictation_api_key() -> Result<(), String> {
    dictation_api_key_clear();
    Ok(())
}

#[tauri::command]
fn openrouter_api_key_status() -> bool {
    openrouter_api_key_present()
}

#[tauri::command]
fn set_openrouter_api_key(secret: String) -> Result<(), String> {
    openrouter_api_key_set(secret.trim())
}

#[tauri::command]
fn clear_openrouter_api_key() -> Result<(), String> {
    openrouter_api_key_clear();
    Ok(())
}

#[tauri::command]
fn llama_server_api_key_status() -> bool {
    llama_server_api_key_present()
}

#[tauri::command]
fn set_llama_server_api_key(secret: String) -> Result<(), String> {
    llama_server_api_key_set(secret.trim())
}

#[tauri::command]
fn clear_llama_server_api_key() -> Result<(), String> {
    llama_server_api_key_clear();
    Ok(())
}

#[tauri::command]
async fn transcribe_dictation(
    paths: State<'_, AppPaths>,
    args: TranscribeDictationArgs,
) -> Result<String, String> {
    ipc_guard::validate_dictation_payload(
        &args.audio_base64,
        args.audio_wav_base64.as_deref(),
        &args.file_name,
        &args.mime_type,
    )?;
    let prefs = load_app_prefs(&paths.prefs_path);
    if !prefs.ai.dictation_enabled {
        return Err("Dictée désactivée (Paramètres → IA).".into());
    }
    let backend = prefs.ai.dictation_backend.trim();
    if backend == "demo" {
        return Err("Mode démo : aucun envoi audio.".into());
    }

    let name = if args.file_name.trim().is_empty() {
        "recording.webm".to_string()
    } else {
        args.file_name.trim().to_string()
    };
    let mime = if args.mime_type.trim().is_empty() {
        "audio/webm".to_string()
    } else {
        args.mime_type.trim().to_string()
    };

    if backend == "whisper_cpp" {
        let wav_b64 = args
            .audio_wav_base64
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| {
                "Dictée Whisper : flux WAV 16 kHz mono manquant (rechargement compositeur requis)."
                    .to_string()
            })?;
        let wav = decode_audio_base64(wav_b64)?;
        let ai_prefs = prefs.ai.clone();
        let local_res = tauri::async_runtime::spawn_blocking(move || {
            whisper_dictation::transcribe_whisper_wav_bytes(&wav, &ai_prefs)
        })
        .await
        .map_err(|e| format!("tâche dictée Whisper: {e}"))?;

        let fail_detail: String = match &local_res {
            Ok(t) if !t.trim().is_empty() => return Ok(t.clone()),
            Ok(_) => "transcription locale vide".into(),
            Err(e) => e.clone(),
        };
        if !prefs.ai.whisper_cloud_fallback {
            return Err(format!(
                "{fail_detail} — aucun audio n’a été envoyé au cloud (repli cloud désactivé dans Paramètres → IA)."
            ));
        }
        if !dictation_api_key_present() {
            return Err(format!(
                "Dictée locale : {fail_detail}. Repli cloud impossible : clé API absente."
            ));
        }
        eprintln!(
            "[RustyMail] Repli cloud : dictée Whisper en échec, envoi WebM vers l’API dictée."
        );
        let audio = decode_audio_base64(&args.audio_base64)?;
        return transcribe_and_maybe_translate(&prefs.ai, "cloud", audio, &name, &mime).await;
    }

    if backend == "cloud" && !dictation_api_key_present() {
        return Err("Clé API absente : renseignez-la dans Paramètres → IA.".into());
    }
    if backend == "local_http" && prefs.ai.local_companion_base_url.trim().is_empty() {
        return Err("URL du compagnon local vide (ex. http://127.0.0.1:8787/v1).".into());
    }
    if backend != "cloud" && backend != "local_http" {
        return Err(format!("Backend dictée inconnu: {backend}"));
    }
    let audio = decode_audio_base64(&args.audio_base64)?;
    transcribe_and_maybe_translate(&prefs.ai, backend, audio, &name, &mime).await
}

/// Test dictée locale : valide l'audio WAV (durée/RMS) puis lance Whisper avec les prefs courantes.
#[tauri::command]
async fn dictation_test_run(
    paths: State<'_, AppPaths>,
    audio_wav_base64: String,
) -> Result<DictationTestRunView, String> {
    ipc_guard::validate_dictation_payload("", Some(audio_wav_base64.as_str()), "test.wav", "audio/wav")?;
    let prefs = load_app_prefs(&paths.prefs_path);
    let wav = decode_audio_base64(&audio_wav_base64)?;
    let ai_prefs = prefs.ai.clone();
    let started = std::time::Instant::now();
    let run = tauri::async_runtime::spawn_blocking(move || {
        let (duration_s, rms) =
            whisper_dictation::wav_rms_duration(&wav).unwrap_or((0.0, 0.0));
        match whisper_dictation::transcribe_whisper_wav_bytes_typed(&wav, &ai_prefs) {
            Ok(text) => DictationTestRunView {
                duration_s,
                rms,
                elapsed_ms: started.elapsed().as_millis(),
                text: Some(text),
                error: None,
            },
            Err(e) => DictationTestRunView {
                duration_s,
                rms,
                elapsed_ms: started.elapsed().as_millis(),
                text: None,
                error: Some(e),
            },
        }
    })
    .await
    .map_err(|e| format!("tâche test dictée: {e}"))?;
    Ok(run)
}

/// Télécharge ~90 Mo (`model.onnx`) + `tokenizer.json` depuis Hugging Face si absents.
#[tauri::command]
async fn prefetch_semantic_minilm_model(paths: State<'_, AppPaths>) -> Result<String, String> {
    let dir = paths.models_dir.clone();
    let dir_display = dir.display().to_string();
    tauri::async_runtime::spawn_blocking(move || minilm_download::ensure_minilm_onnx_assets(&dir))
        .await
        .map_err(|e| format!("tâche téléchargement MiniLM: {e}"))??;
    Ok(format!(
        "Modèle all-MiniLM-L6-v2 prêt (ONNX + tokenizer).\n{dir_display}",
    ))
}

/// Télécharge (ou valide le cache) le fichier GGML pour la langue + taille + profil courants.
#[tauri::command]
async fn prefetch_whisper_dictation_model(paths: State<'_, AppPaths>) -> Result<String, String> {
    let prefs = load_app_prefs(&paths.prefs_path);
    let ai = prefs.ai.clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        whisper_dictation::ensure_ggml_weights(
            &ai.whisper_hf_repo_id,
            &ai.whisper_hf_revision,
            &ai.whisper_model_size,
            &ai.whisper_transcription_profile,
            &ai.whisper_cpp_language,
        )
    })
    .await
    .map_err(|e| format!("tâche préchargement Whisper: {e}"))??;
    Ok(format!(
        "Poids GGML prêts (cache Hugging Face).\n{}",
        path.display()
    ))
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmPrefetchProgressEvent {
    percent: u8,
    phase: String,
}

#[tauri::command]
fn llm_status(paths: State<'_, AppPaths>) -> Result<rustymail_infrastructure::LlmStatusPayload, String> {
    let prefs = load_app_prefs(&paths.prefs_path);
    let profile = llm_singleton()
        .lock()
        .map_err(|_| "mutex LLM empoisonné".to_string())?
        .profile
        .clone();
    let mut status = build_llm_status(
        &paths.llm_models_dir,
        &prefs,
        Some(&profile),
    );
    status.llama_server_n_ctx = probe_llama_n_ctx_for_status(&prefs);
    Ok(status)
}

#[tauri::command]
fn llm_status_refresh_hardware(paths: State<'_, AppPaths>) -> Result<rustymail_infrastructure::LlmStatusPayload, String> {
    if let Ok(mut g) = llm_singleton().lock() {
        g.refresh();
        let prefs = load_app_prefs(&paths.prefs_path);
        let p = g.profile.clone();
        let mut status = build_llm_status(
            &paths.llm_models_dir,
            &prefs,
            Some(&p),
        );
        status.llama_server_n_ctx = probe_llama_n_ctx_for_status(&prefs);
        return Ok(status);
    }
    Err("mutex LLM empoisonné".into())
}

fn probe_llama_n_ctx_for_status(prefs: &AppPrefs) -> Option<u32> {
    if !prefs.ai.llama_server_enabled || prefs.ai.llama_server_base_url.trim().is_empty() {
        return None;
    }
    let bearer = rustymail_infrastructure::llama_server_api_key_get()
        .ok()
        .flatten()
        .filter(|k| !k.trim().is_empty());
    let bearer_ref = bearer.as_deref();
    let model = if prefs.ai.llama_server_model.trim().is_empty() {
        crate::llama_server_spawn::probe_first_model_id(
            prefs.ai.llama_server_base_url.trim(),
            bearer_ref,
        )
        .ok()
    } else {
        Some(prefs.ai.llama_server_model.trim().to_string())
    }?;
    crate::llama_server_spawn::cached_or_probe_llama_n_ctx(
        prefs.ai.llama_server_base_url.trim(),
        model.as_str(),
        bearer_ref,
    )
}

/// Fichiers `.gguf` trouvés sous le cache `models/local-llm` (aide saisie « nom modèle » llama-server).
#[tauri::command]
fn list_cached_gguf_models(paths: State<'_, AppPaths>) -> Result<Vec<String>, String> {
    list_cached_gguf_filenames(&paths.llm_models_dir)
}

#[tauri::command]
fn cancel_prefetch_llm_model(app: tauri::AppHandle) -> Result<(), String> {
    llm_gguf_download_cancel_request();
    let _ = app.emit(
        "llm_prefetch_progress",
        LlmPrefetchProgressEvent {
            percent: 0,
            phase: "cancelled".into(),
        },
    );
    Ok(())
}

/// Télécharge le GGUF défini dans `AppPrefs` (ou valide le cache).
#[tauri::command]
async fn prefetch_llm_model(
    app: tauri::AppHandle,
    paths: State<'_, AppPaths>,
) -> Result<String, String> {
    rate_guard::cooldown(
        "prefetch_llm_model",
        std::time::Duration::from_secs(5),
    )?;
    llm_gguf_download_cancel_clear();
    let prefs = load_app_prefs(&paths.prefs_path);
    let ai = prefs.ai.clone();
    let dest_dir = paths.llm_models_dir.clone();
    let h = app.clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        let emit = move |pct: u8| {
            let _ = h.emit(
                "llm_prefetch_progress",
                LlmPrefetchProgressEvent {
                    percent: pct.min(100),
                    phase: "download".into(),
                },
            );
        };
        ensure_local_llm_gguf_download(&dest_dir, &ai, emit)
    })
    .await
    .map_err(|e| format!("join téléchargement LLM: {e}"))??;
    let _ = app.emit(
        "llm_prefetch_progress",
        LlmPrefetchProgressEvent {
            percent: 100,
            phase: "done".into(),
        },
    );
    Ok(format!(
        "GGUF disponible :\n{}",
        path.display()
    ))
}

/// No-op : hook worker / file IA (phase arrière‑plan).
#[tauri::command]
fn ai_user_activity_ping() {}

#[tauri::command]
fn pick_llama_server_binary_path() -> Result<Option<String>, String> {
    #[cfg(test)]
    {
        Ok(None)
    }
    #[cfg(not(test))]
    {
        let file = rfd::FileDialog::new()
            .set_title("Sélectionner llama-server (exécutable)")
            .pick_file();
        Ok(file.map(|p| p.display().to_string()))
    }
}

#[tauri::command]
fn pick_attachment_paths() -> Result<Vec<String>, String> {
    // Avoid pulling native file dialogs into `cargo test` builds.
    // The app runtime (non-test) uses `rfd` for a native multi-file picker.
    #[cfg(test)]
    {
        Ok(Vec::new())
    }
    #[cfg(not(test))]
    {
        let files = rfd::FileDialog::new()
            .set_title("Ajouter des pièces jointes")
            .pick_files();
        Ok(files
            .unwrap_or_default()
            .into_iter()
            .map(|path| path.display().to_string())
            .filter(|p| !p.trim().is_empty())
            .collect())
    }
}

#[tauri::command]
fn list_accounts(paths: State<'_, AppPaths>) -> Result<Vec<Account>, String> {
    rustymail_infrastructure::load_accounts(&paths.db_path)
}

#[tauri::command]
fn save_account(
    app: tauri::AppHandle,
    paths: State<'_, AppPaths>,
    request: SaveAccountRequest,
) -> Result<Account, String> {
    let email_key = request.email.trim().to_ascii_lowercase();
    let account = Account {
        id: AccountId(email_key.clone()),
        display_name: request.display_name.trim().to_string(),
        email: email_key.clone(),
        imap: ServerSettings {
            host: request.imap_host.trim().to_string(),
            port: request.imap_port,
            security: request.imap_security,
            allow_invalid_tls: persist_allow_invalid_tls_from_ui_checkbox(
                request.imap_allow_invalid_tls,
            ),
        },
        smtp: ServerSettings {
            host: request.smtp_host.trim().to_string(),
            port: request.smtp_port,
            security: request.smtp_security,
            allow_invalid_tls: persist_allow_invalid_tls_from_ui_checkbox(
                request.smtp_allow_invalid_tls,
            ),
        },
        auth_kind: request.auth_kind.clone(),
    };

    let prev = request
        .previous_account_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    ipc_guard::validate_optional_account_id(prev)?;
    rustymail_infrastructure::save_account(&paths.db_path, &account, &request.password, prev)?;
    log::info!(
        target: "rustymail::audit",
        "account_saved email={} auth_kind={}",
        ipc_guard::audit_email_shadow(&account.email),
        account.auth_kind.as_db_str()
    );
    if matches!(
        account.auth_kind,
        MailAuthKind::OauthGoogle | MailAuthKind::OauthMicrosoft
    ) {
        if let Err(e) = rustymail_infrastructure::bind_oauth_tokens_for_account(&account) {
            log::warn!(
                target: "rustymail::audit",
                "oauth_bind_before_imap email={} err={e}",
                ipc_guard::audit_email_shadow(&account.email)
            );
        }
    }
    imap_push::refresh_imap_push_accounts(&app, &paths);
    Ok(account)
}

#[tauri::command]
fn delete_account(
    app: tauri::AppHandle,
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
    account_id: String,
    destructive_ack: Option<String>,
) -> Result<(), String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_delete_account_ack(destructive_ack.as_deref())?;
    rustymail_infrastructure::delete_account(&paths.db_path, account_id.trim())?;
    if let Some(coord) = app.try_state::<imap_push::ImapPushHandle>() {
        coord.0.stop_account(account_id.trim());
    }
    let refreshed =
        rustymail_infrastructure::sqlite_app_core(&paths.db_path).map_err(|e| e.to_string())?;
    *core.lock().map_err(|_| "core lock poisoned".to_string())? = refreshed;
    Ok(())
}

#[tauri::command]
fn demo_reset_playground_mailbox(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
) -> Result<String, String> {
    let msg = rustymail_infrastructure::sqlite_reset_demo_playground(&paths.db_path)?;
    let refreshed =
        rustymail_infrastructure::sqlite_app_core(&paths.db_path).map_err(|e| e.to_string())?;
    *core.lock().map_err(|_| "core lock poisoned".to_string())? = refreshed;
    Ok(msg)
}

#[tauri::command]
fn demo_remove_playground_mailbox(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
) -> Result<String, String> {
    let msg = rustymail_infrastructure::sqlite_remove_demo_playground(&paths.db_path)?;
    let refreshed =
        rustymail_infrastructure::sqlite_app_core(&paths.db_path).map_err(|e| e.to_string())?;
    *core.lock().map_err(|_| "core lock poisoned".to_string())? = refreshed;
    Ok(msg)
}

#[tauri::command]
async fn list_imap_mailboxes(
    paths: State<'_, AppPaths>,
    account_id: Option<String>,
) -> Result<Vec<String>, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    let accounts = rustymail_infrastructure::load_accounts(&paths.db_path)?;
    let account = if let Some(id) = account_id.as_ref() {
        let id_norm = id.trim().to_ascii_lowercase();
        accounts
            .into_iter()
            .find(|row| row.id.0 == id_norm)
            .ok_or_else(|| "account not found".to_string())?
    } else {
        accounts
            .into_iter()
            .next()
            .ok_or_else(|| "no account configured".to_string())?
    };
    rustymail_infrastructure::list_mailboxes(&account).await
}

#[tauri::command]
fn mailbox_unread_counts(
    paths: State<'_, AppPaths>,
    account_id: Option<String>,
    mailboxes: Option<Vec<String>>,
) -> Result<Vec<MailboxUnreadCount>, String> {
    let account = resolve_account_from_paths(&paths, account_id)?;
    let rows = if let Some(list) = mailboxes {
        ipc_guard::validate_sync_mailboxes(&list)?;
        rustymail_infrastructure::sqlite_mailbox_sidebar_counts(
            &paths.db_path,
            &account.id.0,
            &list,
        )
        .map_err(|e| e.to_string())?
    } else {
        rustymail_infrastructure::sqlite_mailbox_folder_stats(&paths.db_path, &account.id.0)
            .map_err(|e| e.to_string())?
    };
    Ok(rows
        .into_iter()
        .map(|(mailbox, unread_count, total_threads)| MailboxUnreadCount {
            mailbox,
            unread_count,
            total_threads,
        })
        .collect())
}

#[tauri::command]
fn mailbox_inbox_filter_counts(
    paths: State<'_, AppPaths>,
    account_id: Option<String>,
    mailbox: String,
) -> Result<rustymail_infrastructure::MailboxInboxFilterCounts, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    ipc_guard::validate_mailbox(&mailbox)?;
    let account = resolve_account_from_paths(&paths, account_id)?;
    rustymail_infrastructure::sqlite_mailbox_inbox_filter_counts(
        &paths.db_path,
        &account.id.0,
        &mailbox,
    )
}

#[tauri::command]
async fn sync_inbox(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    mailbox: Option<String>,
    limit: Option<usize>,
) -> Result<ImapSyncResult, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    ipc_guard::validate_optional_mailbox(mailbox.as_deref())?;
    let limit = ipc_guard::normalize_imap_sync_limit(limit)?;
    let accounts = rustymail_infrastructure::load_accounts(&paths.db_path)?;
    let account = if let Some(id) = account_id.as_ref() {
        let id_norm = id.trim().to_ascii_lowercase();
        accounts
            .into_iter()
            .find(|row| row.id.0 == id_norm)
            .ok_or_else(|| "account not found".to_string())?
    } else {
        accounts
            .into_iter()
            .next()
            .ok_or_else(|| "no account configured".to_string())?
    };
    rate_guard::cooldown(
        format!("imap_sync_inbox:{}", account.id.0.trim()),
        std::time::Duration::from_secs(2),
    )?;
    let mailbox = mailbox
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "INBOX".to_string());
    let result =
        rustymail_infrastructure::sync_inbox(&paths.db_path, &account, &mailbox, limit).await?;
    let refreshed =
        rustymail_infrastructure::sqlite_app_core_scoped(&paths.db_path, &account.id.0, &mailbox)
            .map_err(|error| error.to_string())?;
    {
        let mut core = core.lock().map_err(|_| "core lock poisoned".to_string())?;
        *core = refreshed;
    }
    Ok(result)
}

#[tauri::command]
async fn sync_mailboxes(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    mailboxes: Vec<String>,
    focus_mailbox: Option<String>,
    limit_per_mailbox: Option<usize>,
) -> Result<SyncMailboxesOutcome, String> {
    ipc_guard::validate_sync_mailboxes(&mailboxes)?;
    ipc_guard::validate_optional_mailbox(focus_mailbox.as_deref())?;
    let limit_per_mailbox = ipc_guard::normalize_imap_sync_limit(limit_per_mailbox)?;
    let account = resolve_account_from_paths(&paths, account_id)?;
    rate_guard::cooldown(
        format!("imap_sync_mailboxes:{}", account.id.0.trim()),
        std::time::Duration::from_secs(2),
    )?;
    let outcome = rustymail_infrastructure::sync_mailboxes_single_session(
        &paths.db_path,
        &account,
        &mailboxes,
        limit_per_mailbox,
    )
    .await?;
    if let Some(focus) = focus_mailbox.as_deref().filter(|m| !m.trim().is_empty()) {
        let refreshed =
            rustymail_infrastructure::sqlite_app_core_scoped(&paths.db_path, &account.id.0, focus)
                .map_err(|error| error.to_string())?;
        *core.lock().map_err(|_| "core lock poisoned".to_string())? = refreshed;
    }
    Ok(outcome)
}

fn resolve_account_from_paths(
    paths: &AppPaths,
    account_id: Option<String>,
) -> Result<Account, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    let accounts = rustymail_infrastructure::load_accounts(&paths.db_path)?;
    if let Some(id) = account_id.as_ref() {
        let id_norm = id.trim().to_ascii_lowercase();
        accounts
            .into_iter()
            .find(|row| row.id.0 == id_norm)
            .ok_or_else(|| "account not found".to_string())
    } else {
        accounts
            .into_iter()
            .next()
            .ok_or_else(|| "no account configured".to_string())
    }
}

/// Déplace tous les messages IMAP du fil vers la corbeille (dossier auto-détecté : Trash, [Gmail]/Trash, etc.).
#[tauri::command]
async fn move_thread_trash(
    paths: State<'_, AppPaths>,
    _core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    mailbox: String,
    thread_id: String,
) -> Result<String, String> {
    ipc_guard::validate_imap_thread_op(account_id.as_deref(), &mailbox, &thread_id)?;
    let account = resolve_account_from_paths(&paths, account_id)?;
    let mbox = if mailbox.trim().is_empty() {
        "INBOX".to_string()
    } else {
        mailbox.trim().to_string()
    };
    let result =
        rustymail_infrastructure::move_thread_to_trash(&paths.db_path, &account, &mbox, &thread_id)
            .await?;
    // Le MOVE met déjà à jour SQLite + tombstones : pas de resync bloquante.
    // Reset last_uid uniquement sur la destination (corbeille), jamais sur la source.
    rustymail_infrastructure::spawn_post_move_background_sync(
        paths.db_path.clone(),
        account.clone(),
        vec![mbox.clone(), result.dest_mailbox.clone()],
        vec![result.dest_mailbox.clone()],
        vec![thread_id.clone()],
        25,
    );
    Ok(result.message)
}

/// Supprime définitivement tous les messages listés en local dans le dossier corbeille courant (IMAP + SQLite).
#[tauri::command]
async fn empty_trash_mailbox_cmd(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    mailbox: String,
    destructive_ack: Option<String>,
) -> Result<String, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    ipc_guard::validate_mailbox(&mailbox)?;
    ipc_guard::validate_empty_trash_ack(destructive_ack.as_deref())?;
    let account = resolve_account_from_paths(&paths, account_id)?;
    let mbox = if mailbox.trim().is_empty() {
        return Err("Dossier corbeille non précisé.".to_string());
    } else {
        mailbox.trim().to_string()
    };
    let result =
        rustymail_infrastructure::empty_trash_mailbox(&paths.db_path, &account, &mbox).await?;
    let refreshed =
        rustymail_infrastructure::sqlite_app_core_scoped(&paths.db_path, &account.id.0, &mbox)
            .map_err(|e| e.to_string())?;
    *core.lock().map_err(|_| "core lock poisoned".to_string())? = refreshed;
    Ok(result)
}

/// Archive le fil (cible : [Gmail]/All Mail, Archive, etc.).
#[tauri::command]
async fn move_thread_archive(
    paths: State<'_, AppPaths>,
    _core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    mailbox: String,
    thread_id: String,
) -> Result<String, String> {
    ipc_guard::validate_imap_thread_op(account_id.as_deref(), &mailbox, &thread_id)?;
    let account = resolve_account_from_paths(&paths, account_id)?;
    let mbox = if mailbox.trim().is_empty() {
        "INBOX".to_string()
    } else {
        mailbox.trim().to_string()
    };
    let outcome = rustymail_infrastructure::move_thread_to_archive(
        &paths.db_path,
        &account,
        &mbox,
        &thread_id,
    )
    .await?;
    rustymail_infrastructure::spawn_post_move_background_sync(
        paths.db_path.clone(),
        account.clone(),
        vec![mbox.clone(), outcome.dest_mailbox.clone()],
        vec![outcome.dest_mailbox.clone()],
        vec![thread_id.clone()],
        25,
    );
    Ok(outcome.message)
}

/// Déplace un fil vers un dossier IMAP arbitraire (MOVE + fallback).
#[tauri::command]
async fn move_thread_mailbox(
    paths: State<'_, AppPaths>,
    _core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    mailbox: String,
    thread_id: String,
    dest_mailbox: String,
) -> Result<String, String> {
    ipc_guard::validate_imap_thread_move(
        account_id.as_deref(),
        &mailbox,
        &thread_id,
        &dest_mailbox,
    )?;
    let account = resolve_account_from_paths(&paths, account_id)?;
    let source = if mailbox.trim().is_empty() {
        "INBOX".to_string()
    } else {
        mailbox.trim().to_string()
    };
    let dest = dest_mailbox.trim().to_string();
    let result = rustymail_infrastructure::move_thread_to_mailbox(
        &paths.db_path,
        &account,
        &source,
        &thread_id,
        &dest,
    )
    .await?;
    rustymail_infrastructure::spawn_post_move_background_sync(
        paths.db_path.clone(),
        account.clone(),
        vec![source.clone(), result.dest_mailbox.clone()],
        vec![result.dest_mailbox.clone()],
        vec![thread_id.clone()],
        25,
    );
    Ok(result.message)
}

#[tauri::command]
async fn thread_mark_read(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    mailbox: String,
    thread_id: String,
) -> Result<String, String> {
    ipc_guard::validate_imap_thread_op(account_id.as_deref(), &mailbox, &thread_id)?;
    let account = resolve_account_from_paths(&paths, account_id)?;
    let mbox = if mailbox.trim().is_empty() {
        "INBOX".to_string()
    } else {
        mailbox.trim().to_string()
    };
    let result = rustymail_infrastructure::set_thread_seen(
        &paths.db_path,
        &account,
        &mbox,
        &thread_id,
        true,
    )
    .await?;
    let refreshed =
        rustymail_infrastructure::sqlite_app_core_scoped(&paths.db_path, &account.id.0, &mbox)
            .map_err(|e| e.to_string())?;
    *core.lock().map_err(|_| "core lock poisoned".to_string())? = refreshed;
    Ok(result)
}

/// Bascule (ou force) le drapeau « suivi » local d’un fil (table SQLite `threads.is_followed`).
/// Aucun appel IMAP : flag stable face aux resyncs et indépendant des serveurs.
#[tauri::command]
async fn thread_toggle_follow(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    thread_id: String,
    desired: Option<bool>,
) -> Result<bool, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    ipc_guard::validate_thread_id(&thread_id)?;
    let account = resolve_account_from_paths(&paths, account_id)?;
    let next = rustymail_infrastructure::sqlite_thread_set_followed(
        &paths.db_path,
        &account.id.0,
        &thread_id,
        desired,
    )
    .map_err(|e| e.to_string())?;
    let refreshed =
        rustymail_infrastructure::sqlite_app_core(&paths.db_path).map_err(|e| e.to_string())?;
    *core.lock().map_err(|_| "core lock poisoned".to_string())? = refreshed;
    Ok(next)
}

#[tauri::command]
async fn thread_mark_unread(
    paths: State<'_, AppPaths>,
    core: State<'_, Mutex<AppCore>>,
    account_id: Option<String>,
    mailbox: String,
    thread_id: String,
) -> Result<String, String> {
    ipc_guard::validate_imap_thread_op(account_id.as_deref(), &mailbox, &thread_id)?;
    let account = resolve_account_from_paths(&paths, account_id)?;
    let mbox = if mailbox.trim().is_empty() {
        "INBOX".to_string()
    } else {
        mailbox.trim().to_string()
    };
    let result = rustymail_infrastructure::set_thread_seen(
        &paths.db_path,
        &account,
        &mbox,
        &thread_id,
        false,
    )
    .await?;
    let refreshed =
        rustymail_infrastructure::sqlite_app_core_scoped(&paths.db_path, &account.id.0, &mbox)
            .map_err(|e| e.to_string())?;
    *core.lock().map_err(|_| "core lock poisoned".to_string())? = refreshed;
    Ok(result)
}

#[tauri::command]
async fn create_imap_mailbox(
    paths: State<'_, AppPaths>,
    account_id: Option<String>,
    mailbox: String,
) -> Result<String, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    ipc_guard::validate_mailbox(&mailbox)?;
    if mailbox.trim().is_empty() {
        return Err("mailbox: valeur vide.".into());
    }
    let account = resolve_account_from_paths(&paths, account_id)?;
    let mut session = rustymail_infrastructure::login_session_for_account(&account).await?;
    rustymail_infrastructure::ops::imap_create_mailbox(&mut session, mailbox.trim()).await?;
    let _ = session.logout().await;
    rustymail_infrastructure::register_mailbox_local_cache(
        &paths.db_path,
        &account.id.0,
        mailbox.trim(),
    )?;
    Ok(format!("Mailbox créée: {}", mailbox.trim()))
}

#[tauri::command]
async fn rename_imap_mailbox(
    paths: State<'_, AppPaths>,
    account_id: Option<String>,
    from_mailbox: String,
    to_mailbox: String,
) -> Result<String, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    ipc_guard::validate_mailbox(&from_mailbox)?;
    ipc_guard::validate_mailbox(&to_mailbox)?;
    if from_mailbox.trim().is_empty() || to_mailbox.trim().is_empty() {
        return Err("mailbox: valeur vide.".into());
    }
    let account = resolve_account_from_paths(&paths, account_id)?;
    let mut session = rustymail_infrastructure::login_session_for_account(&account).await?;
    rustymail_infrastructure::ops::imap_rename_mailbox(
        &mut session,
        from_mailbox.trim(),
        to_mailbox.trim(),
    )
    .await?;
    let _ = session.logout().await;
    let (cache, affected) = rustymail_infrastructure::rename_mailbox_subtree_local_cache(
        &paths.db_path,
        &account.id.0,
        from_mailbox.trim(),
        to_mailbox.trim(),
    )?;
    let db_path = paths.db_path.clone();
    let account_id = account.id.0.clone();
    let retagged = tauri::async_runtime::spawn_blocking(move || {
        rustymail_infrastructure::retag_threads_in_mailboxes(&db_path, &account_id, &affected)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(format!(
        "Mailbox renommée: {} -> {} (cache local : {} message(s), {} fil(s), {} tag(s) recalculé(s)).",
        from_mailbox.trim(),
        to_mailbox.trim(),
        cache.messages_updated,
        cache.threads_updated,
        retagged,
    ))
}

#[tauri::command]
async fn delete_imap_mailbox(
    paths: State<'_, AppPaths>,
    account_id: Option<String>,
    mailbox: String,
    destructive_ack: Option<String>,
) -> Result<String, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    ipc_guard::validate_mailbox(&mailbox)?;
    ipc_guard::validate_delete_mailbox_ack(destructive_ack.as_deref())?;
    if mailbox.trim().is_empty() {
        return Err("mailbox: valeur vide.".into());
    }
    let account = resolve_account_from_paths(&paths, account_id)?;
    let mut session = rustymail_infrastructure::login_session_for_account(&account).await?;
    let entries =
        rustymail_infrastructure::ops::list_selectable_mailbox_entries(&mut session).await?;
    let names = rustymail_infrastructure::ops::resolve_mailbox_imap_command_names(
        mailbox.trim(),
        &entries,
    );
    rustymail_infrastructure::ops::imap_delete_mailbox_with_fallback(&mut session, &names)
        .await?;
    let _ = session.logout().await;
    let cache = rustymail_infrastructure::purge_mailbox_local_cache(
        &paths.db_path,
        &account.id.0,
        mailbox.trim(),
    )?;
    Ok(format!(
        "Mailbox supprimée: {} (cache local : {} message(s) retiré(s)).",
        mailbox.trim(),
        cache.messages_deleted,
    ))
}

#[tauri::command]
async fn subscribe_imap_mailbox(
    paths: State<'_, AppPaths>,
    account_id: Option<String>,
    mailbox: String,
) -> Result<String, String> {
    ipc_guard::validate_optional_account_id(account_id.as_deref())?;
    ipc_guard::validate_mailbox(&mailbox)?;
    if mailbox.trim().is_empty() {
        return Err("mailbox: valeur vide.".into());
    }
    let account = resolve_account_from_paths(&paths, account_id)?;
    let mut session = rustymail_infrastructure::login_session_for_account(&account).await?;
    rustymail_infrastructure::ops::imap_subscribe(&mut session, mailbox.trim()).await?;
    let _ = session.logout().await;
    Ok(format!("Mailbox abonnée: {}", mailbox.trim()))
}

#[cfg(feature = "embed-dev-oauth")]
mod oauth_embed {
    include!(concat!(env!("OUT_DIR"), "/oauth_embed.rs"));
}

/// Charge `.env` à la racine du dépôt (debug) ou les OAuth embarqués au build (`embed-dev-oauth`, release perso).
fn load_developer_dotenv() {
    #[cfg(debug_assertions)]
    {
        let repo_env = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".env");
        if repo_env.is_file() {
            let _ = dotenvy::from_path_override(&repo_env);
        }
        let _ = dotenvy::dotenv();
    }

    #[cfg(feature = "embed-dev-oauth")]
    oauth_embed::inject_embedded_oauth_env();
}

pub fn run() {
    load_developer_dotenv();
    let _ = env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or(
            "warn,rustymail::audit=info,rustymail_infrastructure=info,html5ever=error",
        ),
    )
    .try_init();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
            std::fs::create_dir_all(&data_dir)
                .map_err(|error| format!("failed to create app data dir: {error}"))?;
            let db_path = data_dir.join("rustymail.sqlite3");
            let prefs_path = prefs_path_from_db_dir(&db_path);
            let models_root = data_dir.join("models");
            let models_dir = models_root.join("all-MiniLM-L6-v2");
            let llm_models_dir = models_root.join("local-llm");
            let _ = std::fs::create_dir_all(&models_dir);
            let _ = std::fs::create_dir_all(&llm_models_dir);
            rustymail_infrastructure::init_semantic_model_dir(models_dir.clone());
            rustymail_infrastructure::init_oauth_tokens_dir(data_dir.join("oauth_tokens"));
            if let Err(e) = rustymail_infrastructure::sqlite_ai_cache_purge_expired(&db_path) {
                eprintln!("[RustyMail] ai_cache purge: {e}");
            }
            if let Err(e) = rustymail_infrastructure::sqlite_ai_cache_backfill_null_expires(&db_path) {
                eprintln!("[RustyMail] ai_cache backfill expires_at: {e}");
            }
            // Ne pas charger tout SQLite en RAM au démarrage (grosse base = IPC bloqué, comptes invisibles).
            // `list_threads` / sync rechargent le cache à la demande via `sqlite_app_core*`.
            let prefs_boot = prefs_path.clone();
            let minilm_boot = models_dir.clone();

            let db_arc = std::sync::Arc::new(db_path.clone());
            app.manage(AppPaths {
                db_path,
                prefs_path,
                models_dir,
                llm_models_dir,
            });
            imap_push::start_imap_push(app.handle(), db_arc.clone());
            imap_push::refresh_imap_push_accounts_db(app.handle(), db_arc.as_path());
            webview_microphone::install_webview_microphone_access(app.handle());
            app.manage(Mutex::new(AppCore::new(Vec::new())));
            app.manage(llm_stream::LlmJobRegistry::new());

            let prefs = load_app_prefs(&prefs_boot);
            if !prefs.general.bootstrap_models_completed {
                if model_bootstrap::bootstrap_models_present(&minilm_boot) {
                    let mut p = prefs;
                    p.general.bootstrap_models_completed = true;
                    let _ = save_app_prefs_validated(&prefs_boot, &p);
                } else {
                let handle = app.handle().clone();
                let minilm_dir = minilm_boot;
                let prefs_path_boot = prefs_boot;
                std::thread::spawn(move || {
                    let report = model_bootstrap::bootstrap_small_models(&minilm_dir, |p| {
                        let _ = handle.emit("model_bootstrap_progress", &p);
                    });
                    if report.minilm_ok && report.whisper_ok {
                        let mut p = load_app_prefs(&prefs_path_boot);
                        p.general.bootstrap_models_completed = true;
                        let _ = save_app_prefs_validated(&prefs_path_boot, &p);
                    }
                    let _ = handle.emit("model_bootstrap_done", &report);
                });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_llama_server_binary_path,
            app_status,
            app_paths,
            semantic_model_available,
            semantic_embedding_counts,
            reindex_semantic_account_cmd,
            reindex_semantic_mailbox_cmd,
            capabilities,
            list_threads,
            search_threads,
            list_search_tags,
            open_thread,
            summarize_thread,
            prepare_reply,
            prepare_reply_all,
            prepare_forward,
            preview_draft,
            draft_revision_save,
            draft_revision_list,
            draft_revision_restore,
            saved_draft_list,
            saved_drafts_count,
            saved_draft_upsert,
            saved_draft_delete,
            saved_draft_open,
            send_draft,
            plan_split_send,
            execute_split_send_cmd,
            download_attachment,
            open_attachment,
            inline_attachment_fetch,
            transcribe_demo,
            get_app_prefs,
            set_app_prefs,
            dictation_api_key_status,
            set_dictation_api_key,
            clear_dictation_api_key,
            openrouter_api_key_status,
            set_openrouter_api_key,
            clear_openrouter_api_key,
            llama_server_api_key_status,
            set_llama_server_api_key,
            clear_llama_server_api_key,
            transcribe_dictation,
            dictation_test_run,
            webview_microphone::reset_webview_microphone_permission,
            prefetch_semantic_minilm_model,
            prefetch_whisper_dictation_model,
            llm_status,
            llm_status_refresh_hardware,
            list_cached_gguf_models,
            prefetch_llm_model,
            cancel_prefetch_llm_model,
            oauth_google_configured,
            oauth_microsoft_configured,
            llama_server_detect,
            llama_server_winget_install,
            llm_commands::llm_translate_message,
            llm_commands::llm_translate_thread,
            llm_commands::llm_rewrite_compose,
            llm_commands::llm_grammar_compose,
            llm_commands::llm_quick_reply_thread,
            llm_commands::llm_quick_reply_compose,
            llm_commands::llm_qa_thread,
            llm_commands::llm_search_nl,
            llm_commands::llm_affiner_flux_cmd,
            llm_commands::llm_inbox_digest,
            llm_commands::llm_security_signals_augment,
            llm_commands::ai_cache_llm_segment,
            llm_commands::list_ai_prompt_catalog,
            llm_commands::ai_cache_get,
            llm_stream::llm_stream_cancel,
            llm_stream::llm_stream_summarize_thread,
            llm_stream::llm_stream_translate_thread,
            llm_stream::llm_stream_qa_thread,
            llm_stream::llm_stream_agent_prepare_draft,
            address_commands::search_address_contacts_cmd,
            address_commands::reindex_address_contacts_cmd,
            address_commands::parse_address_list_cmd,
            address_commands::list_address_contacts_cmd,
            address_commands::list_address_contacts_scoped_cmd,
            address_commands::count_address_contacts_scoped_cmd,
            address_commands::list_sender_emails_for_domain_cmd,
            address_commands::get_address_contact_detail_cmd,
            address_commands::upsert_manual_contact_cmd,
            address_commands::delete_manual_contact_cmd,
            address_commands::export_address_contacts_vcard_cmd,
            address_commands::import_address_contacts_vcard_cmd,
            llm_commands::llm_agent_prepare_reply_step,
            llm_assist::llm_assist_plan,
            llm_assist::llm_assist_thread_phase,
            llm_commands::llm_contact_profile,
            ai_user_activity_ping,
            pick_attachment_paths,
            list_accounts,
            discover_mail_servers,
            oauth_google_desktop_login_cmd,
            oauth_microsoft_desktop_login_cmd,
            save_account,
            delete_account,
            demo_reset_playground_mailbox,
            demo_remove_playground_mailbox,
            list_imap_mailboxes,
            mailbox_unread_counts,
            mailbox_inbox_filter_counts,
            sync_inbox,
            sync_mailboxes,
            move_thread_trash,
            empty_trash_mailbox_cmd,
            move_thread_archive,
            move_thread_mailbox,
            thread_mark_read,
            thread_mark_unread,
            thread_toggle_follow,
            create_imap_mailbox,
            rename_imap_mailbox,
            delete_imap_mailbox,
            subscribe_imap_mailbox,
            org_commands::org_scan_account_cmd,
            org_commands::org_apply_proposal_cmd,
            org_commands::org_retag_account_cmd,
            org_commands::org_retag_threads_cmd,
            org_commands::org_resolve_archive_path_cmd,
            org_commands::org_v2_scan_account_cmd,
            org_commands::org_v2_record_decision_cmd,
            org_commands::org_v2_ignore_mailbox_cmd,
            org_commands::org_v2_unignore_mailbox_cmd,
            folder_commands::list_mailbox_tree_cmd,
            folder_commands::set_mailbox_locked_cmd,
            folder_commands::archive_mailbox_threads_cmd,
            folder_commands::delete_imap_mailbox_with_contents_cmd,
            folder_commands::rename_mailbox_subtree_retag_cmd,
            saved_search_commands::list_saved_searches_cmd,
            saved_search_commands::upsert_saved_search_cmd,
            saved_search_commands::delete_saved_search_cmd,
            saved_search_commands::get_saved_search_cmd,
            saved_search_commands::mark_saved_search_seen_cmd,
            saved_search_commands::apply_saved_search_cmd,
            activity_commands::record_activity_events_cmd,
            activity_commands::list_suggested_saved_views_cmd,
            activity_commands::dismiss_view_suggestion_cmd,
            activity_commands::activity_card_calibration_stats_cmd,
            list_newsletter_rules,
            add_newsletter_rule,
            remove_newsletter_rule
        ])
        .build(tauri::generate_context!())
        .expect("failed to build RustyMail")
        .run(|_app_handle, event| {
            if matches!(
                &event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                llama_server_spawn::stop_managed_llama_server();
            }
        });
}
