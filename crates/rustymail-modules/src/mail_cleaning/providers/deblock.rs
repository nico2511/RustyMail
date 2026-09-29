//! Deblock transactional emails (`deblock.com`).
//!
//! The digest itself is the embedded fixture `fixtures/digests/deblock.yaml`.
//! Detection stays here: Strong is the sender domain from that fixture.
//! Weak HTML or subject signals still select the provider, but [`DeblockCleaner`]
//! fails closed unless the sender and the structure both match.

use crate::mail_cleaning::{
    digest_fixtures::{apply_builtin_id, builtin_rule_set_version, builtin_sender_matches},
    error::CleanError,
    traits::{ProviderCleaner, ProviderDetector},
    types::{CleaningInput, DetectionConfidence, ProviderId},
};

pub const DEBLOCK_RULE_SET_VERSION: &str = "1";

pub struct DeblockDetector;

impl ProviderDetector for DeblockDetector {
    fn detect(&self, ctx: &CleaningInput<'_>) -> DetectionConfidence {
        if builtin_sender_matches("deblock", ctx.sender_email) {
            return DetectionConfidence::Strong;
        }
        if ctx.html_preview.map(html_suggests_deblock).unwrap_or(false) {
            return DetectionConfidence::Weak;
        }
        if ctx.subject.to_ascii_lowercase().contains("deblock") {
            return DetectionConfidence::Weak;
        }
        DetectionConfidence::None
    }
}

fn html_suggests_deblock(html: &str) -> bool {
    let lower = html.to_ascii_lowercase();
    lower.contains("cdn1.deblock.com/")
        || lower.contains("deblock.com/emails/")
        || (lower.contains("deblock") && lower.contains("f-fallback"))
}

pub struct DeblockCleaner;

impl ProviderCleaner for DeblockCleaner {
    fn clean(&self, html: &str, ctx: &CleaningInput<'_>) -> Result<String, CleanError> {
        apply_builtin_id("deblock", html, ctx.sender_email).ok_or(CleanError::NoDigest)
    }

    fn rule_set_version(&self) -> &'static str {
        builtin_rule_set_version("deblock").unwrap_or(DEBLOCK_RULE_SET_VERSION)
    }

    fn provider_id(&self) -> ProviderId {
        ProviderId::Deblock
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn digest(html: &str) -> Option<String> {
        apply_builtin_id("deblock", html, "support@deblock.com")
    }

    #[test]
    fn parses_receive_fixture_structure() {
        let html = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/deblock/receive_200eur.html"
        ));
        let out = digest(html).expect("digest");
        assert!(out.contains("rustymail:deblock-digest"));
        assert!(out.contains("rustymail:digest id=\"deblock\""));
        assert!(out.contains("200 EUR"));
        assert!(out.contains("IBAN"));
        assert!(out.contains("Pat DOE"));
        assert!(out.contains("<table>") && out.contains("scope=\"row\""));
        assert!(!out.contains("Marketing footer"));
    }

    #[test]
    fn parses_send_fixture_extra_rows() {
        let html = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/deblock/send_200eur.html"
        ));
        let out = digest(html).expect("digest");
        assert!(out.contains("Montant Envoyé") || out.contains("Destinataire"));
        assert!(out.contains("200 EUR"));
    }

    #[test]
    fn weak_html_without_sender_does_not_cut() {
        let html = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/deblock/receive_200eur.html"
        ));
        let ctx = CleaningInput {
            sender_email: "ami@example.com",
            subject: "deblock",
            html_preview: Some(html),
            plain_body: None,
        };
        assert_eq!(DeblockDetector.detect(&ctx), DetectionConfidence::Weak);
        assert!(DeblockCleaner.clean(html, &ctx).is_err());
    }
}
