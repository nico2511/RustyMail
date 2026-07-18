//! GitHub notification emails (`github.com` / `githubnoreply.com`) — compact digest.

use std::sync::LazyLock;

use regex::Regex;
use scraper::{Html, Selector};

use crate::mail_cleaning::{
    error::CleanError,
    traits::{ProviderCleaner, ProviderDetector},
    types::{CleaningInput, DetectionConfidence, ProviderId},
};

pub const GITHUB_RULE_SET_VERSION: &str = "1";

static RE_PR_ISSUE_URL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)https://(?:www\.)?github\.com/([^/\s"'#]+)/([^/\s"'#]+)/(?:pull|issues)/\d+"#)
        .expect("github pr/issue url regex")
});

static RE_STRIP_TAGS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<[^>]+>").expect("strip tags regex"));

const FOOTER_NOISE: &[&str] = &[
    "you are receiving this because",
    "unsubscribe",
    "manage notifications",
    "notification preferences",
    "triage notifications",
    "view this email in your browser",
    "reply to this email directly",
];

const NAV_NOISE: &[&str] = &["inbox", "notifications", "your teams", "marketplace"];

pub struct GitHubDetector;

fn sender_domain_is_github(em: &str) -> bool {
    let em = em.trim().to_ascii_lowercase();
    let Some((_local, domain)) = em.rsplit_once('@') else {
        return false;
    };
    let domain = domain.trim_end_matches('.');
    domain == "github.com"
        || domain.ends_with(".github.com")
        || domain == "githubnoreply.com"
        || domain.ends_with(".githubnoreply.com")
}

impl ProviderDetector for GitHubDetector {
    fn detect(&self, ctx: &CleaningInput<'_>) -> DetectionConfidence {
        if sender_domain_is_github(ctx.sender_email) {
            return DetectionConfidence::Strong;
        }
        if ctx.subject.to_ascii_lowercase().contains("github") {
            return DetectionConfidence::Weak;
        }
        if ctx.html_preview.map(html_suggests_github).unwrap_or(false) {
            return DetectionConfidence::Weak;
        }
        DetectionConfidence::None
    }
}

fn html_suggests_github(html: &str) -> bool {
    html.to_ascii_lowercase().contains("github")
}

pub struct GitHubCleaner;

impl ProviderCleaner for GitHubCleaner {
    fn clean(&self, html: &str, ctx: &CleaningInput<'_>) -> Result<String, CleanError> {
        try_github_digest(html, ctx).ok_or(CleanError::NoDigest)
    }

    fn rule_set_version(&self) -> &'static str {
        GITHUB_RULE_SET_VERSION
    }

    fn provider_id(&self) -> ProviderId {
        ProviderId::GitHub
    }
}

fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn esc_html_pcdata(text: &str) -> String {
    let mut out = String::with_capacity(text.len().saturating_add(8));
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

fn esc_html_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('\"', "&quot;")
        .replace('<', "&lt;")
}

fn is_noise_text(text: &str) -> bool {
    let lc = text.to_ascii_lowercase();
    if lc.len() < 2 {
        return true;
    }
    FOOTER_NOISE.iter().any(|k| lc.contains(k))
        || (lc.len() < 40 && NAV_NOISE.iter().any(|k| lc == *k || lc.contains(k)))
}

fn looks_like_heading(text: &str) -> bool {
    let t = text.trim();
    !t.is_empty()
        && t.len() < 220
        && !is_noise_text(t)
        && !t.starts_with("http")
        && !RE_PR_ISSUE_URL.is_match(t)
}

fn try_github_digest(html: &str, ctx: &CleaningInput<'_>) -> Option<String> {
    let doc = Html::parse_fragment(html);
    let action_url = find_action_url(&doc, html);

    let title = extract_title(&doc, ctx.subject);
    if title.is_empty() {
        return None;
    }

    let paragraphs = extract_paragraphs(&doc);
    if paragraphs.is_empty() && action_url.is_none() {
        return None;
    }

    Some(build_github_digest(&title, &paragraphs, action_url.as_deref()))
}

fn find_action_url(doc: &Html, html: &str) -> Option<String> {
    let Ok(sel) = Selector::parse("a[href]") else {
        return RE_PR_ISSUE_URL
            .find(html)
            .map(|m| sanitize_url(m.as_str()));
    };
    for a in doc.select(&sel) {
        let Some(href) = a.attr("href") else {
            continue;
        };
        if RE_PR_ISSUE_URL.is_match(href) {
            return Some(sanitize_url(href));
        }
        let label = collapse_ws(&a.text().collect::<String>()).to_ascii_lowercase();
        if label.contains("view it on github") || label.contains("view on github") {
            if href.contains("github.com/") {
                return Some(sanitize_url(href));
            }
        }
    }
    RE_PR_ISSUE_URL
        .find(html)
        .map(|m| sanitize_url(m.as_str()))
}

fn sanitize_url(href: &str) -> String {
    let mut s = href.trim().to_string();
    while s.ends_with('&') || s.ends_with('?') || s.ends_with('#') {
        s.pop();
    }
    s
}

fn extract_title(doc: &Html, subject: &str) -> String {
    for sel_str in ["h1", "h2", "h3"] {
        let Ok(sel) = Selector::parse(sel_str) else {
            continue;
        };
        for el in doc.select(&sel) {
            let t = collapse_ws(&el.text().collect::<String>());
            if looks_like_heading(&t) {
                return t;
            }
        }
    }
    let sub = collapse_ws(subject);
    if looks_like_heading(&sub) {
        return sub;
    }
    String::new()
}

fn extract_paragraphs(doc: &Html) -> Vec<String> {
    let Ok(sel) = Selector::parse("p") else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for p in doc.select(&sel) {
        let raw = p.inner_html();
        let text = collapse_ws(&RE_STRIP_TAGS.replace_all(raw.trim(), " "));
        if text.len() < 8 || is_noise_text(&text) {
            continue;
        }
        // Skip pure link labels that are chrome.
        let lc = text.to_ascii_lowercase();
        if lc == "view it on github" || lc == "view on github" || lc.starts_with("unsubscribe") {
            continue;
        }
        if out.iter().any(|existing: &String| existing == &text) {
            continue;
        }
        out.push(text);
        if out.len() >= 4 {
            break;
        }
    }
    out
}

fn build_github_digest(title: &str, paragraphs: &[String], action_url: Option<&str>) -> String {
    let mut s = String::from("<!-- rustymail:github-digest -->\n");
    s.push_str("<article class=\"rm-github-digest\">\n");
    s.push_str("  <h2>");
    s.push_str(&esc_html_pcdata(title));
    s.push_str("</h2>\n");
    for p in paragraphs {
        s.push_str("  <p>");
        s.push_str(&esc_html_pcdata(p));
        s.push_str("</p>\n");
    }
    if let Some(url) = action_url {
        s.push_str("  <p><a href=\"");
        s.push_str(&esc_html_attr(url));
        s.push_str("\" rel=\"noopener noreferrer\" target=\"_blank\">View on GitHub</a></p>\n");
    }
    s.push_str("</article>\n");
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_html() -> &'static str {
        r#"<html><body>
<table><tr><td>
  <a href="https://github.com">GitHub</a>
  <a href="https://github.com/notifications">Inbox</a>
</td></tr></table>
<table><tr><td>
  <p><a href="https://github.com/acme/widget">acme/widget</a></p>
  <h2>New comment on pull request #42: Fix login timeout</h2>
  <p>Alice commented:</p>
  <p>Looks good to me — please merge when CI is green.</p>
  <p><a href="https://github.com/acme/widget/pull/42">View it on GitHub</a></p>
</td></tr></table>
<table><tr><td>
  <p>You are receiving this because you are subscribed to this thread.</p>
  <p><a href="https://github.com/notifications/unsubscribe-auth/ABC">Unsubscribe</a> from this thread</p>
  <p><a href="https://github.com/settings/emails">Manage notifications</a> for this repository.</p>
</td></tr></table>
</body></html>"#
    }

    #[test]
    fn detector_strong_on_github_domains() {
        let d = GitHubDetector;
        for email in [
            "notifications@github.com",
            "noreply@github.com",
            "bot@users.noreply.github.com",
            "ci@githubnoreply.com",
        ] {
            let ctx = CleaningInput {
                sender_email: email,
                subject: "Re: [acme/widget] Fix (#42)",
                html_preview: None,
                plain_body: None,
            };
            assert_eq!(
                d.detect(&ctx),
                DetectionConfidence::Strong,
                "expected strong for {email}"
            );
        }
    }

    #[test]
    fn detector_weak_on_subject_or_html() {
        let d = GitHubDetector;
        let ctx = CleaningInput {
            sender_email: "someone@example.com",
            subject: "GitHub Actions failed",
            html_preview: None,
            plain_body: None,
        };
        assert_eq!(d.detect(&ctx), DetectionConfidence::Weak);

        let ctx = CleaningInput {
            sender_email: "someone@example.com",
            subject: "Build",
            html_preview: Some("<p>See github.com/acme/widget</p>"),
            plain_body: None,
        };
        assert_eq!(d.detect(&ctx), DetectionConfidence::Weak);
    }

    #[test]
    fn parses_notification_fixture() {
        let ctx = CleaningInput {
            sender_email: "notifications@github.com",
            subject: "[acme/widget] Fix login timeout (#42)",
            html_preview: Some(fixture_html()),
            plain_body: None,
        };
        let out = try_github_digest(fixture_html(), &ctx).expect("digest");
        assert!(out.contains("rustymail:github-digest"));
        assert!(out.contains("rm-github-digest"));
        assert!(out.contains("New comment on pull request #42"));
        assert!(out.contains("Looks good to me"));
        assert!(out.contains("github.com/acme/widget/pull/42"));
        assert!(!out.contains("You are receiving this because"));
        assert!(!out.contains("Unsubscribe"));
    }

    #[test]
    fn no_digest_on_unrelated_html() {
        let ctx = CleaningInput {
            sender_email: "notifications@github.com",
            subject: "",
            html_preview: None,
            plain_body: None,
        };
        assert!(try_github_digest("<p>hi</p>", &ctx).is_none());
    }
}
