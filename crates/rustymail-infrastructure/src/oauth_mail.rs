//! OAuth2 « Modern Auth » pour IMAP/SMTP (Google + Microsoft) avec PKCE et redirect loopback.
//!
//! **Configuration développeur** (obligatoire pour les flux OAuth) :
//! - `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID` — client OAuth Google (type **Application de bureau** recommandé).
//! - `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET` — secret client du **même** identifiant OAuth (obligatoire pour
//!   un client **Application Web** ; en pratique aussi requis pour la plupart des clients **Application de bureau**
//!   actuels). Définir dans `.env` à la racine du dépôt (chargé au démarrage Tauri).
//! - `RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID` — application Azure « Mobile et applications de bureau » avec redirect loopback.
//!
//! Les jetons sont stockés sous `oauth:{email}` (trousseau, éventuellement découpé) ou fichier local
//! si un jeton Microsoft dépasse la limite Windows Credential Manager (~2560 caractères UTF-16).

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use rustymail_domain::MailAuthKind;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

use crate::provider_errors::{oauth_http_error, oauth_redirect_error};
use crate::KEYRING_SERVICE;

const OAUTH_USER_PREFIX: &str = "oauth:";
/// Marge sous la limite Windows « password » du Credential Manager (~2560 UTF-16).
const KEYRING_OAUTH_MAX_CHARS: usize = 2000;
/// Scope max dans le JSON `meta` en trousseau (Microsoft renvoie parfois une liste énorme).
const KEYRING_OAUTH_META_SCOPE_MAX: usize = 400;

static OAUTH_TOKENS_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Répertoire `…/oauth_tokens` (à côté de la base SQLite en prod Tauri).
pub fn init_oauth_tokens_dir(dir: PathBuf) {
    let _ = OAUTH_TOKENS_DIR.set(dir);
}

/// Port loopback par défaut — enregistrer dans Entra (Authentication → Mobile and desktop) :
/// `http://127.0.0.1:52789` (URI **exacte**, avec ce port).
pub const OAUTH_LOOPBACK_DEFAULT_PORT: u16 = 52_789;

fn normalize_oauth_env_value(raw: &str) -> String {
    let t = raw.trim();
    if (t.starts_with('"') && t.ends_with('"') && t.len() >= 2)
        || (t.starts_with('\'') && t.ends_with('\'') && t.len() >= 2)
    {
        t[1..t.len() - 1].trim().to_string()
    } else {
        t.to_string()
    }
}

fn google_oauth_missing_secret_message() -> String {
    "RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET manquant ou vide. \
     Copiez le secret client depuis Google Cloud Console → APIs & Services → Credentials → votre client OAuth \
     (même Client ID que RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID) dans `.env` à la racine du dépôt (voir `.env.example`). \
     Type recommandé : **Application de bureau** ; si le client est **Application Web**, le secret est obligatoire. \
     Redémarrez RustyMail après modification du `.env` (ou supprimez une variable Windows vide du même nom)."
        .to_string()
}

/// Secret Google pour l’endpoint `oauth2/token` (non vide).
fn google_oauth_client_secret_param() -> Result<String, String> {
    let secret = std::env::var("RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET")
        .ok()
        .map(|s| normalize_oauth_env_value(&s))
        .filter(|s| !s.is_empty());
    secret.ok_or_else(google_oauth_missing_secret_message)
}

fn google_token_http_error(operation: &str, status: u16, body: &str) -> String {
    let base = oauth_http_error(operation, status, body);
    if google_error_implies_missing_secret(body) {
        return format!("{base}\n\n{}", google_oauth_missing_secret_message());
    }
    base
}

fn google_error_implies_missing_secret(body: &str) -> bool {
    let lower = body.to_ascii_lowercase();
    lower.contains("client_secret") && lower.contains("missing")
}

fn oauth_account_id_norm(account_id: &str) -> String {
    account_id.trim().to_ascii_lowercase()
}

/// Clés trousseau possibles (Gmail : variantes avec/sans points dans la partie locale).
fn oauth_storage_key_candidates(primary: &str, email_alt: Option<&str>) -> Vec<String> {
    let mut keys = vec![oauth_account_id_norm(primary)];
    if let Some(alt) = email_alt {
        let a = oauth_account_id_norm(alt);
        if !keys.contains(&a) {
            keys.push(a);
        }
    }
    let mut extra = Vec::new();
    for k in &keys {
        extra.extend(gmail_local_part_aliases(k));
    }
    keys.extend(extra);
    keys.sort();
    keys.dedup();
    keys
}

fn gmail_local_part_aliases(email: &str) -> Vec<String> {
    let Some((local, domain)) = email.split_once('@') else {
        return vec![];
    };
    if domain != "gmail.com" && domain != "googlemail.com" {
        return vec![];
    }
    let folded = format!("{}@{}", local.replace('.', ""), domain);
    if folded == email {
        vec![]
    } else {
        vec![folded]
    }
}

/// Après enregistrement SQLite : copie les jetons OAuth vers `account.id` si login les a rangés sous un alias Gmail.
pub fn bind_oauth_tokens_for_account(account: &rustymail_domain::Account) -> Result<(), String> {
    match account.auth_kind {
        MailAuthKind::Password => return Ok(()),
        MailAuthKind::OauthGoogle | MailAuthKind::OauthMicrosoft => {}
    }
    let primary = oauth_account_id_norm(&account.id.0);
    if load_oauth_tokens_at(&primary).is_ok() {
        return Ok(());
    }
    for alt in oauth_storage_key_candidates(&primary, Some(&account.email)) {
        if alt == primary {
            continue;
        }
        if let Ok(tokens) = load_oauth_tokens_at(&alt) {
            log::info!(
                target: "rustymail_infrastructure::oauth",
                "oauth: jetons trouvés sous {alt}, copie vers {primary}"
            );
            return store_oauth_tokens_at(&primary, &tokens);
        }
    }
    load_oauth_tokens_at(&primary).map_err(|_| {
        "Jetons OAuth absents pour ce compte — reconnectez-vous avec Google ou Microsoft avant la synchronisation."
            .to_string()
    })?;
    Ok(())
}

fn oauth_keyring_username(account_id: &str) -> String {
    format!("{OAUTH_USER_PREFIX}{}", oauth_account_id_norm(account_id))
}

fn oauth_keyring_username_part(account_id: &str, part: &str) -> String {
    format!("{}:{part}", oauth_keyring_username(account_id))
}

fn oauth_tokens_dir() -> PathBuf {
    OAUTH_TOKENS_DIR.get().cloned().unwrap_or_else(|| {
        dirs::data_local_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("RustyMail")
            .join("oauth_tokens")
    })
}

fn oauth_token_file_path(account_id: &str) -> PathBuf {
    let norm = oauth_account_id_norm(account_id);
    let hash = hex::encode(Sha256::digest(norm.as_bytes()));
    oauth_tokens_dir().join(format!("{hash}.json"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OAuthTokenMetaV2 {
    v: u8,
    expires_at_unix: i64,
    #[serde(default)]
    scope: String,
    #[serde(default)]
    provider: Option<MailOAuthProvider>,
    /// Jetons complets dans `oauth_tokens/<hash>.json` (jetons Microsoft très longs).
    #[serde(default)]
    file: bool,
}

fn keyring_oauth_entry(username: &str) -> Result<keyring_core::Entry, String> {
    keyring::use_native_store(false).map_err(|e| format!("keyring native store failed: {e}"))?;
    keyring_core::Entry::new(KEYRING_SERVICE, username)
        .map_err(|e| format!("keyring oauth entry failed: {e}"))
}

fn keyring_oauth_get(username: &str) -> Result<Option<String>, String> {
    let entry = keyring_oauth_entry(username)?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring oauth read failed: {e}")),
    }
}

fn keyring_error_is_platform_limit(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("2560")
        || lower.contains("longer than the platform limit")
        || lower.contains("password encoded as utf-16")
}

fn keyring_oauth_set(username: &str, value: &str) -> Result<(), String> {
    let n = value.chars().count();
    if n > KEYRING_OAUTH_MAX_CHARS {
        return Err(format!(
            "oauth: valeur trop longue pour le trousseau ({n} caractères, max {KEYRING_OAUTH_MAX_CHARS})"
        ));
    }
    let entry = keyring_oauth_entry(username)?;
    entry.set_password(value).map_err(|e| {
        let msg = format!("keyring oauth write failed: {e}");
        if keyring_error_is_platform_limit(&msg) {
            format!("{msg} (limite Credential Manager Windows — utilisez le stockage fichier)")
        } else {
            msg
        }
    })
}

fn keyring_oauth_delete(username: &str) {
    let Ok(entry) = keyring_oauth_entry(username) else {
        return;
    };
    let _ = entry.delete_credential();
}

fn write_oauth_token_file(path: &Path, json: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("oauth tokens mkdir: {e}"))?;
    }
    std::fs::write(path, json).map_err(|e| format!("oauth tokens file write: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o600);
            let _ = std::fs::set_permissions(path, perms);
        }
    }
    Ok(())
}

fn truncate_to_char_limit(s: &str, max_chars: usize) -> String {
    s.chars().take(max_chars).collect()
}

fn oauth_storage_needs_file(tokens: &StoredMailOAuthTokens) -> bool {
    // Jetons Microsoft (access + refresh) dépassent souvent la limite Windows même séparés.
    if tokens.provider == Some(MailOAuthProvider::Microsoft) {
        return true;
    }
    let access_n = tokens.access_token.chars().count();
    let refresh_n = tokens
        .refresh_token
        .as_ref()
        .map(|r| r.chars().count())
        .unwrap_or(0);
    if access_n > KEYRING_OAUTH_MAX_CHARS || refresh_n > KEYRING_OAUTH_MAX_CHARS {
        return true;
    }
    serde_json::to_string(tokens)
        .map(|j| j.chars().count() > KEYRING_OAUTH_MAX_CHARS)
        .unwrap_or(true)
}

/// Métadonnées compactes pour le trousseau (le scope Microsoft peut faire > 10 000 caractères).
fn meta_json_for_keyring(meta: &OAuthTokenMetaV2) -> Result<String, String> {
    let mut m = meta.clone();
    if m.scope.chars().count() > KEYRING_OAUTH_META_SCOPE_MAX {
        m.scope = truncate_to_char_limit(&m.scope, KEYRING_OAUTH_META_SCOPE_MAX);
    }
    let json = serde_json::to_string(&m).map_err(|e| format!("oauth meta encode: {e}"))?;
    if json.chars().count() > KEYRING_OAUTH_MAX_CHARS {
        m.scope.clear();
        return serde_json::to_string(&m).map_err(|e| format!("oauth meta encode: {e}"));
    }
    Ok(json)
}

fn store_oauth_tokens_in_file(
    id: &str,
    tokens: &StoredMailOAuthTokens,
    meta: OAuthTokenMetaV2,
) -> Result<(), String> {
    let json = serde_json::to_string(tokens).map_err(|e| format!("oauth tokens encode: {e}"))?;
    let path = oauth_token_file_path(id);
    write_oauth_token_file(&path, &json)?;
    let meta_file = OAuthTokenMetaV2 { file: true, ..meta };
    let meta_json = meta_json_for_keyring(&meta_file)?;
    keyring_oauth_set(&oauth_keyring_username_part(id, "meta"), &meta_json)?;
    log::info!(
        target: "rustymail_infrastructure::oauth",
        "oauth: jetons pour {id} → fichier local ({path:?}, limite trousseau Windows)"
    );
    Ok(())
}

fn delete_oauth_token_file(account_id: &str) {
    let path = oauth_token_file_path(account_id);
    let _ = std::fs::remove_file(path);
}

fn purge_oauth_keyring_slots(account_id: &str) {
    keyring_oauth_delete(&oauth_keyring_username(account_id));
    keyring_oauth_delete(&oauth_keyring_username_part(account_id, "meta"));
    keyring_oauth_delete(&oauth_keyring_username_part(account_id, "access"));
    keyring_oauth_delete(&oauth_keyring_username_part(account_id, "refresh"));
}

/// Fournisseur OAuth associé aux jetons (évite un refresh sur le mauvais endpoint).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MailOAuthProvider {
    Google,
    Microsoft,
}

impl MailOAuthProvider {
    pub fn from_auth_kind(kind: &MailAuthKind) -> Option<Self> {
        match kind {
            MailAuthKind::OauthGoogle => Some(Self::Google),
            MailAuthKind::OauthMicrosoft => Some(Self::Microsoft),
            MailAuthKind::Password => None,
        }
    }

    pub fn matches_auth_kind(self, kind: &MailAuthKind) -> bool {
        Self::from_auth_kind(kind) == Some(self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredMailOAuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at_unix: i64,
    #[serde(default)]
    pub scope: String,
    /// Absent sur d’anciens trousseaux : renseigné au prochain refresh ou login.
    #[serde(default)]
    pub provider: Option<MailOAuthProvider>,
    /// E-mail utilisé pour `user=` en XOAUTH2 (fournisseur au login). Peut différer de l’affichage SQLite.
    #[serde(default)]
    pub login_email: Option<String>,
}

fn sanitize_stored_tokens(tokens: &mut StoredMailOAuthTokens) {
    tokens.access_token = tokens.access_token.trim().to_string();
    if let Some(r) = tokens.refresh_token.as_mut() {
        *r = r.trim().to_string();
        if r.is_empty() {
            tokens.refresh_token = None;
        }
    }
    if let Some(e) = tokens.login_email.as_mut() {
        *e = e.trim().to_ascii_lowercase();
        if e.is_empty() || !e.contains('@') {
            tokens.login_email = None;
        }
    }
}

/// Adresse `user=` pour SASL XOAUTH2 (doit correspondre au compte du jeton).
pub fn oauth_imap_username(account: &rustymail_domain::Account) -> String {
    if let Ok(tokens) = load_oauth_tokens(&account.id.0) {
        if let Some(e) = tokens.login_email.filter(|s| s.contains('@')) {
            return e;
        }
    }
    account.email.trim().to_ascii_lowercase()
}

pub fn google_scope_allows_imap(scope: &str) -> bool {
    let s = scope.to_ascii_lowercase();
    s.contains("mail.google.com")
        || s.contains("/auth/gmail")
        || s.contains("https://gmail.googleapis.com/")
}

fn json_field_i64(v: &serde_json::Value, key: &str, default: i64) -> i64 {
    v.get(key)
        .and_then(|x| {
            x.as_i64()
                .or_else(|| x.as_str().and_then(|s| s.trim().parse().ok()))
        })
        .unwrap_or(default)
}

fn oauth_provider_mismatch_message(stored: MailOAuthProvider, kind: &MailAuthKind) -> String {
    let expected = match stored {
        MailOAuthProvider::Google => "Google",
        MailOAuthProvider::Microsoft => "Microsoft",
    };
    let configured = match kind {
        MailAuthKind::OauthGoogle => "Google",
        MailAuthKind::OauthMicrosoft => "Microsoft",
        MailAuthKind::Password => "mot de passe",
    };
    format!(
        "oauth: jetons enregistrés pour {expected} mais le compte est configuré en {configured} — reconnectez le compte"
    )
}

pub fn ensure_oauth_tokens_match_auth_kind(
    tokens: &StoredMailOAuthTokens,
    kind: &MailAuthKind,
) -> Result<(), String> {
    if let Some(stored) = tokens.provider {
        if !stored.matches_auth_kind(kind) {
            return Err(oauth_provider_mismatch_message(stored, kind));
        }
    }
    Ok(())
}

pub fn load_oauth_tokens(account_id: &str) -> Result<StoredMailOAuthTokens, String> {
    let id = oauth_account_id_norm(account_id);
    for key in oauth_storage_key_candidates(&id, None) {
        if let Ok(tokens) = load_oauth_tokens_at(&key) {
            if key != id {
                log::info!(
                    target: "rustymail_infrastructure::oauth",
                    "oauth: jetons chargés depuis {key} pour compte {id}"
                );
            }
            return Ok(tokens);
        }
    }
    Err("oauth: aucun jeton enregistré — reconnectez le compte (Google / Microsoft).".into())
}

fn try_load_legacy_monolithic_oauth(id: &str) -> Result<StoredMailOAuthTokens, String> {
    let raw = keyring_oauth_get(&oauth_keyring_username(id))?
        .ok_or_else(|| "legacy absent".to_string())?;
    let mut tokens = serde_json::from_str::<StoredMailOAuthTokens>(&raw)
        .map_err(|e| format!("legacy oauth JSON: {e}"))?;
    if tokens.login_email.is_none() {
        tokens.login_email = Some(id.to_string());
    }
    sanitize_stored_tokens(&mut tokens);
    if tokens.access_token.is_empty() {
        return Err("legacy oauth: access_token vide".into());
    }
    Ok(tokens)
}

fn load_oauth_tokens_at(id: &str) -> Result<StoredMailOAuthTokens, String> {
    let meta_present = keyring_oauth_get(&oauth_keyring_username_part(id, "meta"))?.is_some();
    if !meta_present {
        if let Ok(tokens) = try_load_legacy_monolithic_oauth(id) {
            log::info!(
                target: "rustymail_infrastructure::oauth",
                "oauth: migration ancien format trousseau → fichier pour {id}"
            );
            let _ = store_oauth_tokens_at(id, &tokens);
            keyring_oauth_delete(&oauth_keyring_username(id));
            return Ok(tokens);
        }
    }

    let meta_raw = keyring_oauth_get(&oauth_keyring_username_part(id, "meta"))?
        .ok_or_else(|| "oauth: aucun jeton enregistré — reconnectez le compte".to_string())?;
    let meta: OAuthTokenMetaV2 =
        serde_json::from_str(&meta_raw).map_err(|e| format!("oauth meta JSON: {e}"))?;

    if meta.file {
        let path = oauth_token_file_path(&id);
        let raw = std::fs::read_to_string(&path)
            .map_err(|e| format!("oauth tokens file read ({path:?}): {e}"))?;
        let mut tokens: StoredMailOAuthTokens =
            serde_json::from_str(&raw).map_err(|e| format!("oauth tokens file JSON: {e}"))?;
        if tokens.login_email.is_none() {
            tokens.login_email = Some(id.to_string());
        }
        sanitize_stored_tokens(&mut tokens);
        if tokens.access_token.is_empty() {
            return Err(
                "oauth: jeton d’accès vide dans le fichier local — reconnectez le compte.".into(),
            );
        }
        return Ok(tokens);
    }

    let access = keyring_oauth_get(&oauth_keyring_username_part(id, "access"))?
        .ok_or_else(|| "oauth: access_token absent — reconnectez le compte".to_string())?;
    let refresh = keyring_oauth_get(&oauth_keyring_username_part(id, "refresh"))?;

    let mut tokens = StoredMailOAuthTokens {
        access_token: access,
        refresh_token: refresh,
        expires_at_unix: meta.expires_at_unix,
        scope: meta.scope,
        provider: meta.provider,
        login_email: Some(id.to_string()),
    };
    sanitize_stored_tokens(&mut tokens);
    if tokens.access_token.is_empty() {
        return Err(
            "oauth: jeton d’accès vide — reconnectez le compte (Google / Microsoft).".into(),
        );
    }
    Ok(tokens)
}

pub fn store_oauth_tokens(account_id: &str, tokens: &StoredMailOAuthTokens) -> Result<(), String> {
    let id = oauth_account_id_norm(account_id);
    let mut tokens = tokens.clone();
    if tokens.login_email.is_none() {
        tokens.login_email = Some(id.clone());
    }
    sanitize_stored_tokens(&mut tokens);
    if tokens.access_token.is_empty() {
        return Err("oauth: jeton d’accès vide — impossible d’enregistrer.".into());
    }
    let keys = oauth_storage_key_candidates(&id, tokens.login_email.as_deref());
    let primary = keys.first().cloned().unwrap_or_else(|| id.clone());
    store_oauth_tokens_at(&primary, &tokens)?;
    for key in keys.into_iter().skip(1) {
        if key == primary {
            continue;
        }
        if let Err(e) = store_oauth_tokens_at(&key, &tokens) {
            log::warn!(
                target: "rustymail_infrastructure::oauth",
                "oauth: copie jetons vers alias {key}: {e}"
            );
        }
    }
    Ok(())
}

fn store_oauth_tokens_at(account_id: &str, tokens: &StoredMailOAuthTokens) -> Result<(), String> {
    let id = oauth_account_id_norm(account_id);
    purge_oauth_keyring_slots(&id);
    delete_oauth_token_file(&id);

    let meta = OAuthTokenMetaV2 {
        v: 2,
        expires_at_unix: tokens.expires_at_unix,
        scope: tokens.scope.clone(),
        provider: tokens.provider,
        file: false,
    };

    if oauth_storage_needs_file(tokens) {
        return store_oauth_tokens_in_file(&id, tokens, meta);
    }

    let meta_json = meta_json_for_keyring(&meta)?;
    if let Err(e) = keyring_oauth_set(&oauth_keyring_username_part(&id, "meta"), &meta_json) {
        if keyring_error_is_platform_limit(&e) {
            return store_oauth_tokens_in_file(&id, tokens, meta);
        }
        return Err(e);
    }

    if let Err(e) = keyring_oauth_set(
        &oauth_keyring_username_part(&id, "access"),
        &tokens.access_token,
    ) {
        if keyring_error_is_platform_limit(&e) {
            return store_oauth_tokens_in_file(&id, tokens, meta);
        }
        return Err(e);
    }
    if let Some(r) = &tokens.refresh_token {
        if let Err(e) = keyring_oauth_set(&oauth_keyring_username_part(&id, "refresh"), r) {
            if keyring_error_is_platform_limit(&e) {
                return store_oauth_tokens_in_file(&id, tokens, meta);
            }
            return Err(e);
        }
    }
    Ok(())
}

pub fn forget_oauth_tokens(account_id: &str) {
    for key in oauth_storage_key_candidates(account_id, None) {
        purge_oauth_keyring_slots(&key);
        delete_oauth_token_file(&key);
    }
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn random_urlsafe(len: usize) -> String {
    let mut bytes = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hash)
}

/// Écouteur loopback partagé pour le port par défaut (une seule instance par processus).
static SHARED_DEFAULT_LOOPBACK: OnceLock<Mutex<Option<Arc<TcpListener>>>> = OnceLock::new();

const OAUTH_BIND_RETRIES: u32 = 10;
const OAUTH_BIND_RETRY_DELAY: Duration = Duration::from_millis(200);

fn oauth_allow_ephemeral_port() -> bool {
    std::env::var("RUSTYMAIL_OAUTH_ALLOW_EPHEMERAL_PORT")
        .ok()
        .map(|s| {
            let t = s.trim();
            t == "1" || t.eq_ignore_ascii_case("true") || t.eq_ignore_ascii_case("yes")
        })
        .unwrap_or(false)
}

fn configured_loopback_port() -> u16 {
    std::env::var("RUSTYMAIL_OAUTH_LOOPBACK_PORT")
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok())
        .unwrap_or(OAUTH_LOOPBACK_DEFAULT_PORT)
}

fn std_listener_reuseaddr(addr: SocketAddr) -> std::io::Result<std::net::TcpListener> {
    use socket2::{Domain, SockAddr, Socket, Type};

    let domain = if addr.is_ipv6() {
        Domain::IPV6
    } else {
        Domain::IPV4
    };
    let socket = Socket::new(domain, Type::STREAM, None)?;
    socket.set_reuse_address(true)?;
    #[cfg(all(unix, not(target_os = "solaris"), not(target_os = "illumos")))]
    {
        let _ = socket.set_reuse_port(true);
    }
    socket.set_nonblocking(true)?;
    socket.bind(&SockAddr::from(addr))?;
    socket.listen(128)?;
    Ok(socket.into())
}

async fn tcp_listener_reuseaddr(addr: SocketAddr) -> Result<TcpListener, String> {
    let std_listener = std_listener_reuseaddr(addr).map_err(|e| format!("bind {addr}: {e}"))?;
    TcpListener::from_std(std_listener).map_err(|e| format!("tokio from_std {addr}: {e}"))
}

/// Indice lisible sur le processus qui occupe le port loopback (Windows : netstat + tasklist).
pub fn describe_loopback_port_blocker(port: u16) -> String {
    let mut parts = Vec::new();
    parts.push(format!(
        "Le port {port} est déjà pris sur 127.0.0.1 — la connexion OAuth exige \
         `http://127.0.0.1:{port}` (identique à Entra)."
    ));

    #[cfg(windows)]
    {
        if let Some(detail) = windows_loopback_port_holder_detail(port) {
            parts.push(detail);
        } else {
            parts.push(
                "Cause fréquente : une autre fenêtre RustyMail encore ouverte, ou une connexion OAuth \
                 interrompue. Fermez les autres instances, attendez quelques secondes, puis réessayez. \
                 Diagnostic : `netstat -ano | findstr :{port}` puis `tasklist /FI \"PID eq …\"`."
                    .replace("{port}", &port.to_string()),
            );
        }
    }

    #[cfg(not(windows))]
    {
        parts.push(format!(
            "Diagnostic : `ss -ltnp 'sport = :{port}'` ou `lsof -iTCP:{port} -sTCP:LISTEN`."
        ));
    }

    parts.join(" ")
}

#[cfg(windows)]
fn windows_loopback_port_holder_detail(port: u16) -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let needle = format!(":{port}");
    let netstat = std::process::Command::new("cmd")
        .args(["/C", &format!("netstat -ano | findstr {needle}")])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !netstat.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&netstat.stdout);
    let self_pid = std::process::id();
    let mut listen_pid: Option<u32> = None;
    for line in text.lines() {
        let upper = line.to_ascii_uppercase();
        if !upper.contains("LISTENING") && !upper.contains("LISTEN") {
            continue;
        }
        if !line.contains(&needle) && !line.contains(&format!("127.0.0.1:{port}")) {
            continue;
        }
        if let Some(pid) = line
            .split_whitespace()
            .last()
            .and_then(|s| s.parse::<u32>().ok())
        {
            listen_pid = Some(pid);
            break;
        }
    }
    let pid = listen_pid?;
    let mut msg = format!("Processus détecté : PID {pid}");
    if pid == self_pid {
        msg.push_str(
            " (cette instance RustyMail — une autre connexion OAuth est peut‑être déjà en cours ; \
             attendez la fin ou relancez l’app).",
        );
    } else {
        let tasklist = std::process::Command::new("cmd")
            .args(["/C", &format!("tasklist /FI \"PID eq {pid}\" /FO CSV /NH")])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        let tasks = String::from_utf8_lossy(&tasklist.stdout);
        let image = tasks
            .lines()
            .next()
            .and_then(|line| line.split(',').nth(0))
            .map(|s| s.trim_matches('"').to_string())
            .filter(|s| !s.is_empty());
        if let Some(img) = image {
            msg.push_str(&format!(" ({img})"));
            let lower = img.to_ascii_lowercase();
            if lower.contains("rustymail") {
                msg.push_str(" — fermez l’autre instance RustyMail.");
            }
        } else {
            msg.push_str(" — fermez le programme qui écoute ce port.");
        }
    }
    Some(msg)
}

async fn bind_loopback_with_reuse_retry(port: u16) -> Result<TcpListener, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut last = String::new();
    for attempt in 0..OAUTH_BIND_RETRIES {
        if attempt > 0 {
            tokio::time::sleep(OAUTH_BIND_RETRY_DELAY).await;
        }
        match tcp_listener_reuseaddr(addr).await {
            Ok(listener) => return Ok(listener),
            Err(e) => last = e,
        }
    }
    Err(last)
}

async fn shared_default_loopback_listener(port: u16) -> Result<Arc<TcpListener>, String> {
    let lock = SHARED_DEFAULT_LOOPBACK.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().await;
    if let Some(ref listener) = *guard {
        return Ok(listener.clone());
    }
    let listener = bind_loopback_with_reuse_retry(port).await?;
    let arc = Arc::new(listener);
    *guard = Some(arc.clone());
    Ok(arc)
}

/// Message d’aide quand Entra refuse `redirect_uri` (à afficher côté UI / logs).
pub fn oauth_loopback_registration_hint(redirect_uri: &str) -> String {
    format!(
        "Enregistrez l’URI de redirection **exacte** dans Entra ID → App registrations → Rustymail → \
         Authentication → **Mobile and desktop applications** (pas « Web » / SPA) : \
         `{redirect_uri}`. Activez aussi « Allow public client flows » (Flux clients publics). \
         Port par défaut RustyMail : `http://127.0.0.1:{OAUTH_LOOPBACK_DEFAULT_PORT}` \
         (variable `RUSTYMAIL_OAUTH_LOOPBACK_PORT` ou `RUSTYMAIL_OAUTH_REDIRECT_URI`)."
    )
}

/// Résultat de la réservation du redirect loopback (`redirect_uri` + indicateur éphémère).
pub struct OAuthLoopbackBind {
    pub listener: Arc<TcpListener>,
    pub redirect_uri: String,
    pub ephemeral_redirect: bool,
}

async fn bind_oauth_loopback_listener() -> Result<OAuthLoopbackBind, String> {
    if let Ok(custom) = std::env::var("RUSTYMAIL_OAUTH_REDIRECT_URI") {
        let custom = custom.trim();
        if !custom.is_empty() {
            let (listener, redirect_uri) = bind_oauth_loopback_listener_for_uri(custom).await?;
            log::info!(
                target: "rustymail_infrastructure::oauth",
                "oauth loopback redirect_uri={redirect_uri} (env)"
            );
            return Ok(OAuthLoopbackBind {
                listener: Arc::new(listener),
                redirect_uri,
                ephemeral_redirect: false,
            });
        }
    }

    let port = configured_loopback_port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    match shared_default_loopback_listener(port).await {
        Ok(listener) => {
            log::info!(
                target: "rustymail_infrastructure::oauth",
                "oauth loopback redirect_uri={redirect_uri} (port {port}, écoute partagée processus)"
            );
            return Ok(OAuthLoopbackBind {
                listener,
                redirect_uri,
                ephemeral_redirect: false,
            });
        }
        Err(bind_err) => {
            let blocker = describe_loopback_port_blocker(port);
            log::warn!(
                target: "rustymail_infrastructure::oauth",
                "port {port} indisponible après {OAUTH_BIND_RETRIES} tentatives (SO_REUSEADDR) : {bind_err}. {blocker}"
            );

            if oauth_allow_ephemeral_port() {
                let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
                    .await
                    .map_err(|e| {
                        format!(
                            "oauth : port {port} occupé et port éphémère impossible : {e}. {blocker}"
                        )
                    })?;
                let ephemeral = listener.local_addr().map_err(|e| e.to_string())?.port();
                let ephemeral_uri = format!("http://127.0.0.1:{ephemeral}");
                log::warn!(
                    target: "rustymail_infrastructure::oauth",
                    "RUSTYMAIL_OAUTH_ALLOW_EPHEMERAL_PORT actif — redirect_uri éphémère {ephemeral_uri}. \
                     Ajoutez cette URI dans Entra ou libérez le port {port}."
                );
                return Ok(OAuthLoopbackBind {
                    listener: Arc::new(listener),
                    redirect_uri: ephemeral_uri,
                    ephemeral_redirect: true,
                });
            }

            return Err(format!(
                "OAuth : impossible d’écouter `http://127.0.0.1:{port}` ({bind_err}).\n\n{blocker}\n\n\
                 Fermez les autres instances RustyMail, libérez le port, puis réessayez. \
                 (Échappement dev uniquement : `RUSTYMAIL_OAUTH_ALLOW_EPHEMERAL_PORT=1`.)"
            ));
        }
    }
}

async fn bind_oauth_loopback_listener_for_uri(uri: &str) -> Result<(TcpListener, String), String> {
    let parsed = url::Url::parse(uri.trim())
        .map_err(|e| format!("RUSTYMAIL_OAUTH_REDIRECT_URI invalide: {e}"))?;
    if parsed.scheme() != "http" {
        return Err("RUSTYMAIL_OAUTH_REDIRECT_URI : seul http://127.0.0.1:… est supporté".into());
    }
    let host = parsed.host_str().unwrap_or("");
    if host != "127.0.0.1" && host != "localhost" {
        return Err(format!(
            "RUSTYMAIL_OAUTH_REDIRECT_URI : hôte {host} non supporté (127.0.0.1 attendu)"
        ));
    }
    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| "RUSTYMAIL_OAUTH_REDIRECT_URI : port manquant".to_string())?;
    let listener = bind_loopback_with_reuse_retry(port).await.map_err(|e| {
        let blocker = describe_loopback_port_blocker(port);
        format!("oauth bind {uri}: {e}. {blocker}")
    })?;
    let redirect_uri = uri.trim().to_string();
    Ok((listener, redirect_uri))
}

fn parse_query_params(query: &str) -> HashMap<String, String> {
    let mut m = HashMap::new();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            m.insert(
                k.to_string(),
                urlencoding::decode(v)
                    .map(|c| c.into_owned())
                    .unwrap_or_else(|_| v.to_string()),
            );
        }
    }
    m
}

async fn read_http_request_query(mut socket: tokio::net::TcpStream) -> Result<String, String> {
    let mut buf = vec![0u8; 16384];
    let n = socket
        .read(&mut buf)
        .await
        .map_err(|e| format!("oauth redirect read: {e}"))?;
    if n == 0 {
        return Err("oauth redirect: connexion vide".into());
    }
    let req = String::from_utf8_lossy(&buf[..n]);
    let first = req
        .lines()
        .next()
        .ok_or_else(|| "oauth redirect: requête vide".to_string())?;
    let path = first
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "oauth redirect: ligne HTTP invalide".to_string())?;
    let q = path.split_once('?').map(|(_, q)| q).unwrap_or("");
    let body = "<!doctype html><html><head><meta charset=\"utf-8\"><title>RustyMail</title></head><body><p>Authentification reçue. Vous pouvez fermer cet onglet et revenir à RustyMail.</p></body></html>";
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = socket.write_all(resp.as_bytes()).await;
    Ok(q.to_string())
}

/// Résultat d’analyse d’une requête loopback (hors I/O).
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum OAuthRedirectDisposition {
    Accept(HashMap<String, String>),
    /// Requête parasite / scan local : ignorer et attendre la suivante.
    Ignore,
    /// Erreur OAuth renvoyée par le fournisseur (refus utilisateur, etc.).
    ProviderError(String),
}

pub(crate) fn classify_oauth_redirect_query(
    query: &str,
    expected_state: &str,
) -> OAuthRedirectDisposition {
    let params = parse_query_params(query);
    if let Some(err) = params.get("error") {
        let desc = params.get("error_description").cloned().unwrap_or_default();
        return OAuthRedirectDisposition::ProviderError(oauth_redirect_error(err, &desc));
    }
    let state = match params.get("state") {
        Some(s) if s == expected_state => s.as_str(),
        _ => return OAuthRedirectDisposition::Ignore,
    };
    let _ = state;
    let code = match params.get("code") {
        Some(c) if !c.is_empty() => c,
        _ => return OAuthRedirectDisposition::Ignore,
    };
    let _ = code;
    OAuthRedirectDisposition::Accept(params)
}

async fn capture_redirect(
    listener: &TcpListener,
    expected_state: &str,
    redirect_uri: &str,
) -> Result<HashMap<String, String>, String> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(600);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err("oauth: délai dépassé (aucune réponse du navigateur)".into());
        }
        let (socket, _) = tokio::time::timeout(remaining, listener.accept())
            .await
            .map_err(|_| "oauth: délai dépassé (aucune réponse du navigateur)".to_string())?
            .map_err(|e| format!("oauth accept: {e}"))?;

        let q = read_http_request_query(socket).await?;
        match classify_oauth_redirect_query(&q, expected_state) {
            OAuthRedirectDisposition::Accept(params) => return Ok(params),
            OAuthRedirectDisposition::Ignore => continue,
            OAuthRedirectDisposition::ProviderError(msg) => {
                let hint = oauth_loopback_registration_hint(redirect_uri);
                return Err(format!("{msg}\n\n{hint}"));
            }
        }
    }
}

fn open_browser(url: &str) -> Result<(), String> {
    open::that(url).map_err(|e| format!("impossible d’ouvrir le navigateur: {e}"))
}

async fn exchange_google_code(
    client: &reqwest::Client,
    client_id: &str,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<serde_json::Value, String> {
    let secret = google_oauth_client_secret_param()?;
    // Corps explicite : Google rejette l’absence de `client_secret` (et une valeur vide pour les clients « Web »).
    let body = format!(
        "code={}&client_id={}&redirect_uri={}&grant_type=authorization_code&code_verifier={}&client_secret={}",
        urlencoding::encode(code),
        urlencoding::encode(client_id),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(code_verifier),
        urlencoding::encode(&secret),
    );
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("google token http: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let t = resp.text().await.unwrap_or_default();
        return Err(google_token_http_error("google token exchange", status, &t));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("google token json: {e}"))
}

async fn exchange_microsoft_code(
    client: &reqwest::Client,
    client_id: &str,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<serde_json::Value, String> {
    let body = [
        ("code", code),
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
        ("code_verifier", code_verifier),
    ];
    let resp = client
        .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
        .form(&body)
        .send()
        .await
        .map_err(|e| format!("microsoft token http: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let t = resp.text().await.unwrap_or_default();
        return Err(oauth_http_error("microsoft token exchange", status, &t));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("microsoft token json: {e}"))
}

async fn google_user_email(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<(String, Option<String>), String> {
    let resp = client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| format!("google userinfo: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let t = resp.text().await.unwrap_or_default();
        return Err(oauth_http_error("google userinfo", status, &t));
    }
    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("userinfo json: {e}"))?;
    let email = v
        .get("email")
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "google userinfo: email absent".to_string())?;
    let name = v
        .get("name")
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    Ok((email, name))
}

/// Décode le payload d’un segment JWT (base64url, sans vérifier la signature — réponse token HTTPS).
fn decode_jwt_payload_segment(segment: &str) -> Result<serde_json::Value, String> {
    let segment = segment.trim();
    if segment.is_empty() {
        return Err("jwt: segment payload vide".into());
    }
    let pad = (4 - segment.len() % 4) % 4;
    let padded = format!("{segment}{}", "=".repeat(pad));
    use base64::engine::general_purpose::URL_SAFE;
    let bytes = URL_SAFE
        .decode(padded.as_bytes())
        .map_err(|e| format!("jwt: payload base64: {e}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("jwt: payload json: {e}"))
}

/// Identité depuis `id_token` (scopes `openid email profile` du flux bureau).
fn microsoft_identity_from_id_token(id_token: &str) -> Result<(String, Option<String>), String> {
    let payload = id_token
        .split('.')
        .nth(1)
        .ok_or_else(|| "id_token: JWT mal formé (pas de payload)".to_string())?;
    let v = decode_jwt_payload_segment(payload)?;
    let email = v
        .get("preferred_username")
        .or_else(|| v.get("email"))
        .or_else(|| v.get("upn"))
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty() && s.contains('@'))
        .ok_or_else(|| "id_token: e-mail absent (preferred_username / email / upn)".to_string())?;
    let name = v
        .get("name")
        .or_else(|| v.get("displayName"))
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    Ok((email, name))
}

async fn microsoft_user_email_graph(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<(String, Option<String>), String> {
    if !access_token.contains('.') {
        return Err(
            "graph /me: le jeton d’accès Outlook (IMAP/SMTP) n’est pas un JWT Graph — utilisez id_token"
                .into(),
        );
    }
    let resp = client
        .get("https://graph.microsoft.com/v1.0/me")
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| format!("graph /me: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let t = resp.text().await.unwrap_or_default();
        return Err(oauth_http_error("microsoft graph /me", status, &t));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| format!("graph json: {e}"))?;
    let email = v
        .get("mail")
        .or_else(|| v.get("userPrincipalName"))
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "graph /me: mail ou UPN absent".to_string())?;
    let name = v
        .get("displayName")
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    Ok((email, name))
}

/// E-mail / nom après login Microsoft : `id_token` d’abord (jeton IMAP Outlook est opaque, pas Graph).
async fn microsoft_user_identity(
    client: &reqwest::Client,
    token_json: &serde_json::Value,
    access_token: &str,
) -> Result<(String, Option<String>), String> {
    if let Some(id) = token_json.get("id_token").and_then(|x| x.as_str()) {
        match microsoft_identity_from_id_token(id) {
            Ok(identity) => return Ok(identity),
            Err(e) => log::warn!(target: "rustymail_infrastructure::oauth", "id_token: {e}"),
        }
    }
    microsoft_user_email_graph(client, access_token).await
}

fn token_from_json(v: &serde_json::Value) -> Result<(String, Option<String>, i64, String), String> {
    let access = v
        .get("access_token")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "token: access_token manquant".to_string())?
        .to_string();
    let refresh = v
        .get("refresh_token")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let expires_in = json_field_i64(v, "expires_in", 3600);
    let expires_at = now_unix() + expires_in;
    let scope = v
        .get("scope")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    Ok((access, refresh, expires_at, scope))
}

async fn refresh_google(
    client: &reqwest::Client,
    client_id: &str,
    refresh: &str,
) -> Result<serde_json::Value, String> {
    let secret = google_oauth_client_secret_param()?;
    let scope = "openid email profile https://mail.google.com/";
    let body = format!(
        "client_id={}&grant_type=refresh_token&refresh_token={}&client_secret={}&scope={}",
        urlencoding::encode(client_id),
        urlencoding::encode(refresh),
        urlencoding::encode(&secret),
        urlencoding::encode(scope),
    );
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("google refresh http: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let t = resp.text().await.unwrap_or_default();
        return Err(google_token_http_error("google token refresh", status, &t));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("google refresh json: {e}"))
}

async fn refresh_microsoft(
    client: &reqwest::Client,
    client_id: &str,
    refresh: &str,
) -> Result<serde_json::Value, String> {
    let body = [
        ("client_id", client_id),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh),
        ("scope", "offline_access openid email profile https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send"),
    ];
    let resp = client
        .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
        .form(&body)
        .send()
        .await
        .map_err(|e| format!("microsoft refresh http: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let t = resp.text().await.unwrap_or_default();
        return Err(oauth_http_error("microsoft token refresh", status, &t));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("microsoft refresh json: {e}"))
}

/// Retourne un jeton d’accès valide (rafraîchit si nécessaire) pour IMAP/SMTP XOAUTH2.
pub async fn ensure_valid_access_token(
    account_id: &str,
    kind: &MailAuthKind,
) -> Result<String, String> {
    let client_id = match kind {
        MailAuthKind::OauthGoogle => {
            std::env::var("RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID").map_err(|_| {
                "variable d’environnement RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID manquante".to_string()
            })?
        }
        MailAuthKind::OauthMicrosoft => std::env::var("RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID")
            .map_err(|_| {
                "variable d’environnement RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID manquante".to_string()
            })?,
        MailAuthKind::Password => {
            return Err("ensure_valid_access_token: compte en mot de passe".into());
        }
    };

    let mut stored = load_oauth_tokens(account_id)?;
    ensure_oauth_tokens_match_auth_kind(&stored, kind)?;
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("reqwest: {e}"))?;

    let force_refresh_for_google =
        matches!(kind, MailAuthKind::OauthGoogle) && !google_scope_allows_imap(&stored.scope);

    if force_refresh_for_google {
        log::warn!(
            target: "rustymail_infrastructure::oauth",
            "google oauth: scope IMAP absent ({}) — tentative de refresh",
            stored.scope
        );
    }

    // Google : préférer un refresh avant IMAP (évite jetons sans scope mail ou cache trop agressif).
    let use_cached_access = matches!(kind, MailAuthKind::OauthMicrosoft)
        && !force_refresh_for_google
        && now_unix() < stored.expires_at_unix.saturating_sub(120);

    if use_cached_access {
        return Ok(stored.access_token);
    }

    if matches!(kind, MailAuthKind::OauthGoogle) && stored.refresh_token.is_none() {
        if !google_scope_allows_imap(&stored.scope) {
            return Err(
                "oauth Google : le jeton n’inclut pas l’accès IMAP (scope mail.google.com). \
                 Reconnectez le compte via « Connexion Google »."
                    .into(),
            );
        }
        if now_unix() < stored.expires_at_unix.saturating_sub(120) {
            return Ok(stored.access_token);
        }
    }

    let refresh = stored
        .refresh_token
        .as_deref()
        .ok_or_else(|| "oauth: refresh_token absent — reconnectez le compte".to_string())?;

    let json = match kind {
        MailAuthKind::OauthGoogle => refresh_google(&http, &client_id, refresh).await?,
        MailAuthKind::OauthMicrosoft => refresh_microsoft(&http, &client_id, refresh).await?,
        MailAuthKind::Password => unreachable!(),
    };

    let (new_access, new_refresh, exp, scope) = token_from_json(&json)?;
    if let Some(nr) = new_refresh {
        stored.refresh_token = Some(nr);
    }
    stored.access_token = new_access.clone();
    stored.expires_at_unix = exp;
    stored.scope = scope;
    if stored.provider.is_none() {
        stored.provider = MailOAuthProvider::from_auth_kind(kind);
    }
    if stored.login_email.is_none() {
        stored.login_email = Some(oauth_account_id_norm(account_id));
    }
    if matches!(kind, MailAuthKind::OauthGoogle) && !google_scope_allows_imap(&stored.scope) {
        return Err(
            "oauth Google : après refresh, l’accès IMAP (https://mail.google.com/) est toujours absent. \
             Reconnectez le compte et acceptez les autorisations Gmail."
                .into(),
        );
    }
    store_oauth_tokens(account_id, &stored)?;
    Ok(new_access)
}

/// Résultat du flux bureau Google : e-mail + nom ; jetons déjà stockés sous `oauth:{email}`.
#[derive(Debug, Clone, Serialize)]
pub struct OAuthDesktopLoginOutcome {
    pub email: String,
    pub display_name: Option<String>,
    /// URI de redirection réellement utilisée (à aligner avec Entra / Google).
    pub redirect_uri: String,
    /// `true` si un port éphémère a été utilisé (`RUSTYMAIL_OAUTH_ALLOW_EPHEMERAL_PORT`) — alerte UI.
    pub ephemeral_redirect: bool,
}

pub async fn oauth_google_desktop_login(
    client_id: &str,
) -> Result<OAuthDesktopLoginOutcome, String> {
    if client_id.trim().is_empty() {
        return Err("client_id Google vide".into());
    }
    google_oauth_client_secret_param()?;
    let loopback = bind_oauth_loopback_listener().await?;
    let redirect_uri = loopback.redirect_uri.clone();
    let ephemeral_redirect = loopback.ephemeral_redirect;
    let state = random_urlsafe(24);
    let code_verifier = random_urlsafe(48);
    let challenge = pkce_challenge(&code_verifier);
    let scope = "openid email profile https://mail.google.com/";
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        urlencoding::encode(client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(scope),
        urlencoding::encode(&state),
        urlencoding::encode(&challenge),
    );

    open_browser(&auth_url)?;

    let params = capture_redirect(loopback.listener.as_ref(), &state, &redirect_uri).await?;
    let code = params
        .get("code")
        .ok_or_else(|| "code manquant".to_string())?;

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("reqwest: {e}"))?;
    let token_json =
        exchange_google_code(&http, client_id, code, &redirect_uri, &code_verifier).await?;
    let (access, refresh, exp, sc) = token_from_json(&token_json)?;
    if !google_scope_allows_imap(&sc) {
        return Err(
            "Google n’a pas accordé l’accès IMAP (scope https://mail.google.com/). \
             Reconnectez-vous via « Connexion Google » et acceptez l’accès Gmail."
                .into(),
        );
    }
    let (email, display_name) = google_user_email(&http, &access).await?;

    let tokens = StoredMailOAuthTokens {
        access_token: access,
        refresh_token: refresh,
        expires_at_unix: exp,
        scope: sc,
        provider: Some(MailOAuthProvider::Google),
        login_email: Some(email.clone()),
    };
    store_oauth_tokens(&email, &tokens)?;

    Ok(OAuthDesktopLoginOutcome {
        email,
        display_name,
        redirect_uri,
        ephemeral_redirect,
    })
}

pub async fn oauth_microsoft_desktop_login(
    client_id: &str,
) -> Result<OAuthDesktopLoginOutcome, String> {
    if client_id.trim().is_empty() {
        return Err("client_id Microsoft vide".into());
    }
    let loopback = bind_oauth_loopback_listener().await?;
    let redirect_uri = loopback.redirect_uri.clone();
    let ephemeral_redirect = loopback.ephemeral_redirect;
    let state = random_urlsafe(24);
    let code_verifier = random_urlsafe(48);
    let challenge = pkce_challenge(&code_verifier);
    let scope = "offline_access openid email profile https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send";
    let auth_url = format!(
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id={}&response_type=code&redirect_uri={}&response_mode=query&scope={}&state={}&code_challenge={}&code_challenge_method=S256&prompt=select_account",
        urlencoding::encode(client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(scope),
        urlencoding::encode(&state),
        urlencoding::encode(&challenge),
    );

    log::info!(
        target: "rustymail_infrastructure::oauth",
        "Microsoft OAuth redirect_uri={redirect_uri} — {}",
        oauth_loopback_registration_hint(&redirect_uri)
    );
    open_browser(&auth_url)?;

    let params = capture_redirect(loopback.listener.as_ref(), &state, &redirect_uri).await?;
    let code = params
        .get("code")
        .ok_or_else(|| "code manquant".to_string())?;

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("reqwest: {e}"))?;
    let token_json =
        exchange_microsoft_code(&http, client_id, code, &redirect_uri, &code_verifier).await?;
    let (access, refresh, exp, sc) = token_from_json(&token_json)?;
    let (email, display_name) = microsoft_user_identity(&http, &token_json, &access).await?;

    let tokens = StoredMailOAuthTokens {
        access_token: access,
        refresh_token: refresh,
        expires_at_unix: exp,
        scope: sc,
        provider: Some(MailOAuthProvider::Microsoft),
        login_email: Some(email.clone()),
    };
    store_oauth_tokens(&email, &tokens)?;

    Ok(OAuthDesktopLoginOutcome {
        email,
        display_name,
        redirect_uri,
        ephemeral_redirect,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::MailAuthKind;

    #[test]
    fn pkce_challenge_stable_length() {
        let v = "testverifier";
        let c = pkce_challenge(v);
        assert!(!c.is_empty());
    }

    #[test]
    fn oauth_provider_matches_auth_kind() {
        assert!(MailOAuthProvider::Google.matches_auth_kind(&MailAuthKind::OauthGoogle));
        assert!(!MailOAuthProvider::Google.matches_auth_kind(&MailAuthKind::OauthMicrosoft));
    }

    #[test]
    fn ensure_oauth_tokens_rejects_provider_mismatch() {
        let tokens = StoredMailOAuthTokens {
            access_token: "a".into(),
            refresh_token: None,
            expires_at_unix: 0,
            scope: String::new(),
            provider: Some(MailOAuthProvider::Google),
            login_email: None,
        };
        assert!(
            ensure_oauth_tokens_match_auth_kind(&tokens, &MailAuthKind::OauthMicrosoft).is_err()
        );
    }

    #[test]
    fn redirect_ignores_wrong_state_until_valid() {
        let state = "expected-state";
        let bad = classify_oauth_redirect_query("state=other&code=abc", state);
        assert_eq!(bad, OAuthRedirectDisposition::Ignore);
        let good = classify_oauth_redirect_query(&format!("state={state}&code=auth-code"), state);
        match good {
            OAuthRedirectDisposition::Accept(p) => {
                assert_eq!(p.get("code").map(String::as_str), Some("auth-code"))
            }
            _ => panic!("expected accept"),
        }
    }

    #[test]
    fn redirect_provider_error_is_fatal() {
        let r = classify_oauth_redirect_query("error=access_denied&state=x", "x");
        assert!(matches!(r, OAuthRedirectDisposition::ProviderError(_)));
    }

    #[test]
    fn normalize_oauth_env_value_strips_quotes() {
        assert_eq!(
            super::normalize_oauth_env_value("  \"abc-secret\"  "),
            "abc-secret"
        );
        assert_eq!(super::normalize_oauth_env_value("'x'"), "x");
    }

    #[test]
    fn google_error_implies_missing_secret_detects_api_message() {
        let body = r#"{"error":"invalid_request","error_description":"client_secret is missing."}"#;
        assert!(super::google_error_implies_missing_secret(body));
    }

    #[test]
    fn microsoft_id_token_extracts_email() {
        let payload = r#"{"preferred_username":"user@outlook.fr","name":"Test User"}"#;
        let b64 = URL_SAFE_NO_PAD.encode(payload.as_bytes());
        let id_token = format!("hdr.{b64}.sig");
        let (email, name) = microsoft_identity_from_id_token(&id_token).expect("parse");
        assert_eq!(email, "user@outlook.fr");
        assert_eq!(name.as_deref(), Some("Test User"));
    }

    #[test]
    fn graph_rejects_opaque_outlook_access_token() {
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let client = reqwest::Client::new();
        let err = rt
            .block_on(microsoft_user_email_graph(
                &client,
                "opaque-outlook-token-no-dots",
            ))
            .expect_err("opaque token");
        assert!(err.contains("pas un JWT Graph"));
    }

    #[test]
    fn gmail_local_part_aliases_maps_dotted_address() {
        let aliases = super::gmail_local_part_aliases("j.exemple.test@gmail.com");
        assert_eq!(aliases, vec!["jexempletest@gmail.com".to_string()]);
    }

    #[test]
    fn google_scope_allows_imap_detects_mail_scope() {
        assert!(super::google_scope_allows_imap(
            "openid email https://mail.google.com/"
        ));
        assert!(!super::google_scope_allows_imap("openid email profile"));
    }

    #[test]
    fn microsoft_tokens_always_use_file_storage() {
        let tokens = StoredMailOAuthTokens {
            access_token: "a".into(),
            refresh_token: Some("r".into()),
            expires_at_unix: 0,
            scope: "s".into(),
            provider: Some(MailOAuthProvider::Microsoft),
            login_email: None,
        };
        assert!(super::oauth_storage_needs_file(&tokens));
    }

    #[test]
    fn meta_json_for_keyring_truncates_huge_scope() {
        let huge_scope = "https://outlook.office.com/scope ".repeat(200);
        let meta = super::OAuthTokenMetaV2 {
            v: 2,
            expires_at_unix: 1,
            scope: huge_scope,
            provider: Some(MailOAuthProvider::Microsoft),
            file: true,
        };
        let json = super::meta_json_for_keyring(&meta).expect("meta");
        assert!(json.chars().count() < super::KEYRING_OAUTH_MAX_CHARS);
    }

    #[test]
    fn oauth_storage_needs_file_when_payload_exceeds_keyring_limit() {
        let long = "x".repeat(KEYRING_OAUTH_MAX_CHARS + 1);
        let tokens = StoredMailOAuthTokens {
            access_token: long.clone(),
            refresh_token: Some("r".into()),
            expires_at_unix: 0,
            scope: String::new(),
            provider: Some(MailOAuthProvider::Microsoft),
            login_email: None,
        };
        assert!(super::oauth_storage_needs_file(&tokens));
        let compact = StoredMailOAuthTokens {
            access_token: "short".into(),
            refresh_token: Some("refresh".into()),
            expires_at_unix: 0,
            scope: "s".into(),
            provider: Some(MailOAuthProvider::Google),
            login_email: None,
        };
        assert!(!super::oauth_storage_needs_file(&compact));
    }
}
