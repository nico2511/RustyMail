//! Erreurs fournisseur HTTP/OAuth normalisées — pas de corps JSON complet ni de secrets dans les messages utilisateur.

const DEFAULT_SNIPPET_CHARS: usize = 120;

/// Message d’échec OAuth/token exchange : code HTTP + éventuel `error` JSON, jamais le corps intégral.
pub fn oauth_http_error(operation: &str, status: u16, body: &str) -> String {
    let oauth_code = parse_oauth_error_field(body);
    let detail = redact_sensitive_snippet(body, DEFAULT_SNIPPET_CHARS);
    match oauth_code {
        Some(code) => format!("{operation}: status={status} oauth_error={code} detail={detail}"),
        None => format!("{operation}: status={status} detail={detail}"),
    }
}

/// Erreur renvoyée dans la query du redirect (`error` / `error_description`).
pub fn oauth_redirect_error(error: &str, description: &str) -> String {
    let err = error.trim();
    let desc = redact_sensitive_snippet(description, 80);
    if desc.is_empty() {
        format!("oauth provider error: {err}")
    } else {
        format!("oauth provider error: {err} ({desc})")
    }
}

fn parse_oauth_error_field(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body.trim()).ok()?;
    v.get("error")
        .and_then(|e| e.as_str())
        .map(|s: &str| s.chars().take(64).collect::<String>())
        .filter(|s: &String| !s.is_empty())
}

/// Aplatit, borne et masque emails / jetons dans un extrait destiné aux logs ou à l’UI.
pub fn redact_sensitive_snippet(raw: &str, max_chars: usize) -> String {
    let flat: String = raw
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let truncated: String = flat.chars().take(max_chars).collect();
    redact_inline_secrets(&truncated)
}

fn redact_inline_secrets(s: &str) -> String {
    let mut out = s.to_string();
    for (pat, repl) in [
        (
            r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
            "[REDACTED_EMAIL]",
        ),
        (
            r"(?i)\b(?:Bearer|token|access_token|refresh_token)\s*[=:]\s*\S+",
            "[REDACTED_TOKEN]",
        ),
        (
            r"(?i)\b(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,})\b",
            "[REDACTED_JWT]",
        ),
    ] {
        if let Ok(re) = regex::Regex::new(pat) {
            out = re.replace_all(&out, repl).into_owned();
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oauth_http_error_uses_error_field_not_full_body() {
        let body = r#"{"error":"invalid_grant","error_description":"Token has been expired or revoked. user@secret.com"}"#;
        let msg = oauth_http_error("google token exchange", 400, body);
        assert!(msg.contains("oauth_error=invalid_grant"));
        assert!(msg.contains("status=400"));
        assert!(!msg.contains("user@secret.com"));
    }

    #[test]
    fn snippet_redacts_email() {
        let s = redact_sensitive_snippet("Contact admin@corp.example for help", 200);
        assert!(s.contains("[REDACTED_EMAIL]"));
        assert!(!s.contains("admin@corp.example"));
    }
}
