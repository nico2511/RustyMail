use async_native_tls::TlsConnector;
use tokio::net::TcpStream;

use async_imap::Authenticator;
use rustymail_domain::{Account, MailAuthKind, SecurityMode};

use crate::oauth_mail;
use crate::tls_policy;

/// Shared session type: TLS/STARTTLS then `LOGIN`.
pub type ImapSession = async_imap::Session<async_native_tls::TlsStream<TcpStream>>;

struct Xoauth2Authenticator {
    user: String,
    access_token: String,
}

impl Authenticator for Xoauth2Authenticator {
    type Response = String;

    fn process(&mut self, _challenge: &[u8]) -> Self::Response {
        format!(
            "user={}\x01auth=Bearer {}\x01\x01",
            self.user, self.access_token
        )
    }
}

fn tls_domain_for_server(host: &str) -> String {
    host.trim().to_ascii_lowercase()
}

pub fn map_imap_error(err: async_imap::error::Error) -> String {
    err.to_string()
}

fn connect_tls(
    host: &str,
    port: u16,
    allow_invalid_tls: bool,
) -> impl std::future::Future<Output = Result<async_native_tls::TlsStream<TcpStream>, String>> + Send
{
    let host = host.to_string();
    async move {
        let tcp = TcpStream::connect((host.as_str(), port))
            .await
            .map_err(|error| error.to_string())?;
        let connector = TlsConnector::new()
            .danger_accept_invalid_certs(allow_invalid_tls)
            .danger_accept_invalid_hostnames(allow_invalid_tls);
        let domain = tls_domain_for_server(&host);
        connector
            .connect(&domain, tcp)
            .await
            .map_err(|error| error.to_string())
    }
}

/// Plain TCP, STARTTLS, then wrap as IMAP `Client` (port 143-style).
async fn connect_starttls(
    host: &str,
    port: u16,
    allow_invalid_tls: bool,
) -> Result<async_imap::Client<async_native_tls::TlsStream<TcpStream>>, String> {
    let host_owned = host.to_string();
    let domain = tls_domain_for_server(host);
    let tcp = TcpStream::connect((host_owned.as_str(), port))
        .await
        .map_err(|error| error.to_string())?;
    let mut client = async_imap::Client::new(tcp);
    let _greeting = client
        .read_response()
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "IMAP: missing server greeting".to_string())?;
    client
        .run_command_and_check_ok("STARTTLS", None)
        .await
        .map_err(map_imap_error)?;
    let plain = client.into_inner();
    let connector = TlsConnector::new()
        .danger_accept_invalid_certs(allow_invalid_tls)
        .danger_accept_invalid_hostnames(allow_invalid_tls);
    let tls = connector
        .connect(&domain, plain)
        .await
        .map_err(|error| error.to_string())?;
    Ok(async_imap::Client::new(tls))
}

/// Implicit TLS (port 993-style).
async fn connect_tls_client(
    host: &str,
    port: u16,
    allow_invalid_tls: bool,
) -> Result<async_imap::Client<async_native_tls::TlsStream<TcpStream>>, String> {
    let tls = connect_tls(host, port, allow_invalid_tls).await?;
    Ok(async_imap::Client::new(tls))
}

pub async fn login_session(account: &Account, password: &str) -> Result<ImapSession, String> {
    let client = match account.imap.security {
        SecurityMode::Tls => {
            connect_tls_client(
                &account.imap.host,
                account.imap.port,
                tls_policy::effective_allow_invalid_tls(account.imap.allow_invalid_tls),
            )
            .await?
        }
        SecurityMode::StartTls => {
            connect_starttls(
                &account.imap.host,
                account.imap.port,
                tls_policy::effective_allow_invalid_tls(account.imap.allow_invalid_tls),
            )
            .await?
        }
    };
    let mut client = client;
    if matches!(account.imap.security, SecurityMode::Tls) {
        let _greeting = client
            .read_response()
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "IMAP: missing server greeting".to_string())?;
    }
    let session = match client.login(&account.email, password).await {
        Ok(session) => session,
        Err((err, _)) => return Err(err.to_string()),
    };
    Ok(session)
}

/// Connexion IMAP avec SASL XOAUTH2 (jeton d’accès OAuth2).
pub async fn login_session_xoauth2(
    account: &Account,
    access_token: &str,
) -> Result<ImapSession, String> {
    let client = match account.imap.security {
        SecurityMode::Tls => {
            connect_tls_client(
                &account.imap.host,
                account.imap.port,
                tls_policy::effective_allow_invalid_tls(account.imap.allow_invalid_tls),
            )
            .await?
        }
        SecurityMode::StartTls => {
            connect_starttls(
                &account.imap.host,
                account.imap.port,
                tls_policy::effective_allow_invalid_tls(account.imap.allow_invalid_tls),
            )
            .await?
        }
    };
    let mut client = client;
    if matches!(account.imap.security, SecurityMode::Tls) {
        let _greeting = client
            .read_response()
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "IMAP: missing server greeting".to_string())?;
    }
    let imap_user = oauth_mail::oauth_imap_username(account);
    let auth = Xoauth2Authenticator {
        user: imap_user,
        access_token: access_token.trim().to_string(),
    };
    match client.authenticate("XOAUTH2", auth).await {
        Ok(session) => Ok(session),
        Err((err, _)) => {
            let msg = err.to_string();
            if msg.contains("AUTHENTICATIONFAILED") || msg.contains("Invalid credentials") {
                return Err(format!(
                    "{msg}\n\nConnexion IMAP OAuth refusée — reconnectez le compte (Google / Microsoft), \
                     vérifiez que l’IMAP est activé dans Gmail (Paramètres → Transfert et POP/IMAP), \
                     et que l’e-mail du compte correspond à celui utilisé lors de la connexion OAuth."
                ));
            }
            Err(msg)
        }
    }
}

/// Connexion IMAP : mot de passe (`LOGIN`) ou jeton OAuth2 (`AUTHENTICATE XOAUTH2`).
pub async fn login_session_for_account(account: &Account) -> Result<ImapSession, String> {
    log::debug!(
        target: "rustymail::audit",
        "imap_login account={} auth_kind={}",
        account.id.0,
        account.auth_kind.as_db_str()
    );
    match &account.auth_kind {
        MailAuthKind::Password => {
            let pw = crate::get_account_password(&account.id.0)?;
            login_session(account, &pw).await
        }
        MailAuthKind::OauthGoogle | MailAuthKind::OauthMicrosoft => {
            let _ = oauth_mail::bind_oauth_tokens_for_account(account);
            let tok =
                oauth_mail::ensure_valid_access_token(&account.id.0, &account.auth_kind).await?;
            login_session_xoauth2(account, &tok).await
        }
    }
}
