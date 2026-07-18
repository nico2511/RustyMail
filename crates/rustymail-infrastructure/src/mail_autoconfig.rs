//! Découverte des paramètres IMAP/SMTP (Mozilla ISPDB, `.well-known`, sous-domaine autoconfig).
//!
//! **SYNC-PRESETS** : la carte `builtin_presets()` doit rester alignée avec `domainPresets` dans
//! `src/accountSetup.ts` (mêmes domaines, hôtes et ports).

use std::collections::HashMap;
use std::time::Duration;

use reqwest::redirect::Policy;
use rustymail_domain::{SecurityMode, ServerSettings};
use serde::Deserialize;

const FETCH_TIMEOUT: Duration = Duration::from_secs(7);

/// Préréglages alignés sur `src/accountSetup.ts` (`domainPresets`).
fn builtin_presets() -> HashMap<&'static str, (ServerSettings, ServerSettings)> {
    let mut m: HashMap<&'static str, (ServerSettings, ServerSettings)> = HashMap::new();
    let gmail = (
        ServerSettings {
            host: "imap.gmail.com".into(),
            port: 993,
            security: SecurityMode::Tls,
            allow_invalid_tls: false,
        },
        ServerSettings {
            host: "smtp.gmail.com".into(),
            port: 587,
            security: SecurityMode::StartTls,
            allow_invalid_tls: false,
        },
    );
    m.insert("gmail.com", gmail.clone());
    m.insert("googlemail.com", gmail);

    let office365 = (
        ServerSettings {
            host: "outlook.office365.com".into(),
            port: 993,
            security: SecurityMode::Tls,
            allow_invalid_tls: false,
        },
        ServerSettings {
            host: "smtp.office365.com".into(),
            port: 587,
            security: SecurityMode::StartTls,
            allow_invalid_tls: false,
        },
    );
    for d in [
        "outlook.com",
        "hotmail.com",
        "hotmail.fr",
        "hotmail.co.uk",
        "live.com",
        "live.fr",
        "msn.com",
        "office365.com",
        "outlook.fr",
    ] {
        m.insert(d, office365.clone());
    }

    let icloud = (
        ServerSettings {
            host: "imap.mail.me.com".into(),
            port: 993,
            security: SecurityMode::Tls,
            allow_invalid_tls: false,
        },
        ServerSettings {
            host: "smtp.mail.me.com".into(),
            port: 587,
            security: SecurityMode::StartTls,
            allow_invalid_tls: false,
        },
    );
    for d in ["icloud.com", "me.com", "mac.com"] {
        m.insert(d, icloud.clone());
    }

    let yahoo = (
        ServerSettings {
            host: "imap.mail.yahoo.com".into(),
            port: 993,
            security: SecurityMode::Tls,
            allow_invalid_tls: false,
        },
        ServerSettings {
            host: "smtp.mail.yahoo.com".into(),
            port: 587,
            security: SecurityMode::StartTls,
            allow_invalid_tls: false,
        },
    );
    for d in ["yahoo.com", "yahoo.fr", "ymail.com", "yahoo.co.uk"] {
        m.insert(d, yahoo.clone());
    }

    m
}

pub fn extract_domain(email: &str) -> Option<String> {
    let email = email.trim();
    let at = email.rfind('@')?;
    let dom = email[at + 1..].trim().to_ascii_lowercase();
    if dom.is_empty() {
        None
    } else {
        Some(dom)
    }
}

#[derive(Debug, Clone)]
pub struct DiscoveredMailServers {
    pub imap: ServerSettings,
    pub smtp: ServerSettings,
    /// Libellé affiché : `builtin`, `mozilla_ispdb`, `well_known`, `autoconfig_subdomain`
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename = "clientConfig")]
struct AutoconfigRoot {
    #[serde(rename = "emailProvider")]
    email_provider: EmailProvider,
}

#[derive(Debug, Deserialize)]
struct EmailProvider {
    #[serde(rename = "incomingServer", default)]
    incoming: Vec<IncomingServer>,
    #[serde(rename = "outgoingServer", default)]
    outgoing: Vec<OutgoingServer>,
}

#[derive(Debug, Deserialize)]
struct IncomingServer {
    #[serde(rename = "@type", default)]
    server_type: String,
    hostname: Option<String>,
    port: Option<String>,
    #[serde(rename = "socketType", default)]
    socket_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OutgoingServer {
    #[serde(rename = "@type", default)]
    server_type: String,
    hostname: Option<String>,
    port: Option<String>,
    #[serde(rename = "socketType", default)]
    socket_type: Option<String>,
}

fn socket_to_security(socket: &str) -> Option<SecurityMode> {
    match socket.trim().to_ascii_uppercase().as_str() {
        "SSL" | "TLS" => Some(SecurityMode::Tls),
        "STARTTLS" => Some(SecurityMode::StartTls),
        _ => None,
    }
}

fn partial_to_settings(
    host: Option<String>,
    port: Option<String>,
    socket: Option<String>,
) -> Option<ServerSettings> {
    let host = host?.trim().to_string();
    if host.is_empty() {
        return None;
    }
    let port: u16 = port.as_deref().unwrap_or("993").trim().parse().ok()?;
    let sec = socket_to_security(socket.as_deref().unwrap_or("SSL"))?;
    Some(ServerSettings {
        host,
        port,
        security: sec,
        allow_invalid_tls: false,
    })
}

fn parse_client_config_xml(xml: &str) -> Option<(ServerSettings, ServerSettings)> {
    let root: AutoconfigRoot = quick_xml::de::from_str(xml).ok()?;
    let ep = root.email_provider;

    let imap = ep
        .incoming
        .into_iter()
        .find(|s| s.server_type.eq_ignore_ascii_case("imap"))
        .and_then(|s| partial_to_settings(s.hostname, s.port, s.socket_type))?;

    let smtp = ep
        .outgoing
        .into_iter()
        .find(|s| s.server_type.eq_ignore_ascii_case("smtp"))
        .and_then(|s| partial_to_settings(s.hostname, s.port, s.socket_type))?;

    Some((imap, smtp))
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .connect_timeout(Duration::from_secs(5))
        .redirect(Policy::limited(8))
        .user_agent("RustyMail/1.0 (mail autoconfig)")
        .build()
        .map_err(|e| format!("client HTTP: {e}"))
}

async fn fetch_text(client: &reqwest::Client, url: &str) -> Option<String> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.text().await.ok()
}

/// Tente la chaîne Mozilla / domaine et retourne la première configuration utilisable.
pub async fn discover_mail_servers(email: &str) -> Result<DiscoveredMailServers, String> {
    let domain = extract_domain(email).ok_or_else(|| "Adresse e-mail invalide.".to_string())?;

    let presets = builtin_presets();
    if let Some((imap, smtp)) = presets.get(domain.as_str()) {
        return Ok(DiscoveredMailServers {
            imap: imap.clone(),
            smtp: smtp.clone(),
            source: "builtin",
        });
    }

    let client = http_client()?;

    let ispdb = format!("https://autoconfig.thunderbird.net/v1.1/{domain}");
    if let Some(body) = fetch_text(&client, &ispdb).await {
        if let Some((imap, smtp)) = parse_client_config_xml(&body) {
            return Ok(DiscoveredMailServers {
                imap,
                smtp,
                source: "mozilla_ispdb",
            });
        }
    }

    let well_known = format!("https://{domain}/.well-known/autoconfig/mail/config-v1.1.xml");
    if let Some(body) = fetch_text(&client, &well_known).await {
        if let Some((imap, smtp)) = parse_client_config_xml(&body) {
            return Ok(DiscoveredMailServers {
                imap,
                smtp,
                source: "well_known",
            });
        }
    }

    let enc = urlencoding::encode(email.trim());
    let auto = format!(
        "https://autoconfig.{}/mail/config-v1.1.xml?emailaddress={enc}",
        domain
    );
    if let Some(body) = fetch_text(&client, &auto).await {
        if let Some((imap, smtp)) = parse_client_config_xml(&body) {
            return Ok(DiscoveredMailServers {
                imap,
                smtp,
                source: "autoconfig_subdomain",
            });
        }
    }

    Err("Aucune configuration IMAP/SMTP trouvée pour ce domaine. Saisissez les serveurs manuellement.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_GMAIL: &str = r#"<?xml version="1.0"?>
<clientConfig version="1.1">
  <emailProvider id="googlemail.com">
    <domain>gmail.com</domain>
    <incomingServer type="imap">
      <hostname>imap.googlemail.com</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.googlemail.com</hostname>
      <port>587</port>
      <socketType>STARTTLS</socketType>
    </outgoingServer>
  </emailProvider>
</clientConfig>"#;

    #[test]
    fn parses_mozilla_sample() {
        let (i, s) = parse_client_config_xml(SAMPLE_GMAIL).expect("parse");
        assert_eq!(i.host, "imap.googlemail.com");
        assert_eq!(i.port, 993);
        assert_eq!(i.security, SecurityMode::Tls);
        assert_eq!(s.host, "smtp.googlemail.com");
        assert_eq!(s.port, 587);
        assert_eq!(s.security, SecurityMode::StartTls);
    }
}
