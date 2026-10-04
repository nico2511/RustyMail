//! Lecture locale d'un `.eml` pour l'éditeur de découpe. N'écrit rien, n'envoie rien.

use base64::{engine::general_purpose::STANDARD, Engine};
use mailparse::{parse_mail, MailHeaderMap, ParsedMail};

const MAX_EML_BASE64: usize = 2_000_000;
const MAX_EML_BYTES: usize = 1_500_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmlCutSource {
    pub subject: String,
    pub sender_email: String,
    pub html: String,
}

pub fn parse_eml_base64(b64: &str) -> Result<EmlCutSource, String> {
    let compact: String = b64.chars().filter(|c| !c.is_whitespace()).collect();
    if compact.is_empty() {
        return Err("fichier .eml vide".to_string());
    }
    if compact.len() > MAX_EML_BASE64 {
        return Err("fichier .eml trop long".to_string());
    }
    let bytes = STANDARD
        .decode(compact)
        .map_err(|_| "fichier .eml illisible".to_string())?;
    parse_eml_bytes(&bytes)
}

pub fn parse_eml_bytes(raw: &[u8]) -> Result<EmlCutSource, String> {
    if raw.len() > MAX_EML_BYTES {
        return Err("fichier .eml trop long".to_string());
    }
    if raw.contains(&0) {
        return Err("fichier .eml invalide".to_string());
    }
    let mail = parse_mail(raw).map_err(|error| format!("fichier .eml illisible : {error}"))?;
    let subject = header_value(&mail, "Subject");
    let from = header_value(&mail, "From");
    let sender_email = email_from_header(&from);
    if !sender_email.contains('@') {
        return Err("expéditeur introuvable dans le .eml".to_string());
    }
    let html = find_html(&mail).ok_or_else(|| "Ce message n'a pas de partie HTML.".to_string())?;
    if html.len() > MAX_EML_BYTES {
        return Err("HTML trop long".to_string());
    }
    Ok(EmlCutSource {
        subject,
        sender_email,
        html,
    })
}

fn header_value(mail: &ParsedMail<'_>, name: &str) -> String {
    mail.headers
        .get_first_value(name)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn email_from_header(value: &str) -> String {
    if let Some(start) = value.rfind('<') {
        if let Some(end) = value[start + 1..].find('>') {
            let email = value[start + 1..start + 1 + end].trim();
            if email.contains('@') {
                return email.to_string();
            }
        }
    }
    value
        .split_whitespace()
        .find(|part| part.contains('@'))
        .unwrap_or("")
        .trim_matches(|c| c == '"' || c == ',' || c == ';')
        .to_string()
}

fn find_html(mail: &ParsedMail<'_>) -> Option<String> {
    let mime = mail.ctype.mimetype.to_ascii_lowercase();
    if mime.starts_with("text/html") {
        return mail.get_body().ok().filter(|body| !body.trim().is_empty());
    }
    for part in &mail.subparts {
        if let Some(html) = find_html(part) {
            return Some(html);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::parse_eml_bytes;

    #[test]
    fn html_part_keeps_sender_subject_and_body() {
        let raw = b"From: Notes <notes@exemple.fr>\r\nSubject: Commande\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<div class=\"letter\"><h1>Votre commande</h1><p>Demain.</p></div>\r\n";
        let parsed = parse_eml_bytes(raw).expect("eml");
        assert_eq!(parsed.sender_email, "notes@exemple.fr");
        assert_eq!(parsed.subject, "Commande");
        assert!(parsed.html.contains("Votre commande"));
        assert!(parsed.html.contains("Demain."));
    }

    #[test]
    fn plain_only_eml_is_refused() {
        let raw = b"From: Notes <notes@exemple.fr>\r\nSubject: Texte\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nBonjour\r\n";
        let error = parse_eml_bytes(raw).expect_err("plain");
        assert!(error.contains("HTML"));
    }
}
