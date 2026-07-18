//! Redaction PII / secrets avant envoi vers un LLM tiers (OpenRouter ou API distante).

use std::sync::OnceLock;

use regex::Regex;

use crate::LlmEngine;

static EMAIL_RE: OnceLock<Regex> = OnceLock::new();
static PHONE_RE: OnceLock<Regex> = OnceLock::new();
static IBAN_RE: OnceLock<Regex> = OnceLock::new();
static CARD_RE: OnceLock<Regex> = OnceLock::new();
static BEARER_RE: OnceLock<Regex> = OnceLock::new();
static JWT_RE: OnceLock<Regex> = OnceLock::new();
static MSG_ID_RE: OnceLock<Regex> = OnceLock::new();

fn email_re() -> &'static Regex {
    EMAIL_RE.get_or_init(|| {
        Regex::new(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b").expect("email re")
    })
}

fn phone_re() -> &'static Regex {
    PHONE_RE.get_or_init(|| {
        Regex::new(
            r"(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4}){0,2}",
        )
        .expect("phone re")
    })
}

fn iban_re() -> &'static Regex {
    IBAN_RE.get_or_init(|| Regex::new(r"(?i)\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b").expect("iban re"))
}

fn card_re() -> &'static Regex {
    CARD_RE.get_or_init(|| {
        Regex::new(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{3,4}\b").expect("card re")
    })
}

fn bearer_re() -> &'static Regex {
    BEARER_RE.get_or_init(|| {
        Regex::new(r"(?i)\b(?:Bearer|token|api[_-]?key|access_token|refresh_token)\s*[=:]\s*\S+")
            .expect("bearer re")
    })
}

fn jwt_re() -> &'static Regex {
    JWT_RE.get_or_init(|| {
        Regex::new(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\b")
            .expect("jwt re")
    })
}

fn msg_id_re() -> &'static Regex {
    MSG_ID_RE.get_or_init(|| Regex::new(r"(?i)\bmessage_id\s*=\s*[^\s\]]+").expect("msg id re"))
}

/// Masque emails, téléphones, IBAN, cartes, jetons et identifiants de message dans un texte destiné à un LLM distant.
pub fn redact_pii_for_exfiltration(input: &str) -> String {
    let mut out = input.to_string();
    out = email_re()
        .replace_all(&out, "[REDACTED_EMAIL]")
        .into_owned();
    out = phone_re()
        .replace_all(&out, "[REDACTED_PHONE]")
        .into_owned();
    out = iban_re().replace_all(&out, "[REDACTED_IBAN]").into_owned();
    out = card_re().replace_all(&out, "[REDACTED_CARD]").into_owned();
    out = bearer_re()
        .replace_all(&out, "[REDACTED_TOKEN]")
        .into_owned();
    out = jwt_re().replace_all(&out, "[REDACTED_JWT]").into_owned();
    out = msg_id_re()
        .replace_all(&out, "message_id=[REDACTED_ID]")
        .into_owned();
    out
}

/// Applique [`redact_pii_for_exfiltration`] seulement si le moteur envoie les prompts hors machine locale de confiance.
pub fn redact_user_content_if_needed(engine: &LlmEngine, content: &str) -> String {
    if engine.exfiltrates_to_third_party() {
        redact_pii_for_exfiltration(content)
    } else {
        content.to_string()
    }
}

impl LlmEngine {
    /// `true` si les prompts utilisateur peuvent quitter la machine (OpenRouter ou API HTTP non loopback).
    pub fn exfiltrates_to_third_party(&self) -> bool {
        #[cfg(feature = "http")]
        {
            match self {
                LlmEngine::Http(e) => e.exfiltrates_to_third_party(),
            }
        }
        #[cfg(not(feature = "http"))]
        {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_email_and_phone() {
        let s = redact_pii_for_exfiltration("Contact me at user@example.com or +33 6 12 34 56 78");
        assert!(s.contains("[REDACTED_EMAIL]"));
        assert!(s.contains("[REDACTED_PHONE]"));
        assert!(!s.contains("user@example.com"));
    }
}
