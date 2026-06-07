//! Deblock transactional emails (`deblock.com`) — compact digest (title, amount block, labelled rows).

use std::sync::LazyLock;

use regex::Regex;
use scraper::{ElementRef, Html, Selector};

use crate::mail_cleaning::{
    error::CleanError,
    traits::{ProviderCleaner, ProviderDetector},
    types::{CleaningInput, DetectionConfidence, ProviderId},
};

pub const DEBLOCK_RULE_SET_VERSION: &str = "1";

static RE_P_ROW: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<(?:b|strong)>([^<]+)</(?:b|strong)>\s*(?:<br\s*/?>)\s*([\s\S]+?)\s*$")
        .expect("deblock p-row regex")
});

static RE_STRIP_TAGS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<[^>]+>").expect("strip tags regex"));

pub struct DeblockDetector;

fn sender_domain_is_deblock(em: &str) -> bool {
    let em = em.trim().to_ascii_lowercase();
    let Some((_local, domain)) = em.rsplit_once('@') else {
        return false;
    };
    domain == "deblock.com" || domain.ends_with(".deblock.com")
}

impl ProviderDetector for DeblockDetector {
    fn detect(&self, ctx: &CleaningInput<'_>) -> DetectionConfidence {
        if sender_domain_is_deblock(ctx.sender_email) {
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
    fn clean(&self, html: &str, _ctx: &CleaningInput<'_>) -> Result<String, CleanError> {
        try_deblock_digest(html).ok_or(CleanError::NoDigest)
    }

    fn rule_set_version(&self) -> &'static str {
        DEBLOCK_RULE_SET_VERSION
    }

    fn provider_id(&self) -> ProviderId {
        ProviderId::Deblock
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

fn p_row_label_value(p: ElementRef<'_>) -> Option<(String, String)> {
    let inner = p.inner_html();
    let cap = RE_P_ROW.captures(inner.trim())?;
    let label = collapse_ws(cap.get(1)?.as_str());
    let value_raw = cap.get(2)?.as_str();
    let value = collapse_ws(&RE_STRIP_TAGS.replace_all(value_raw.trim(), ""));
    (!label.is_empty() && !value.is_empty()).then_some((label, value))
}

fn amount_block_text(div: ElementRef<'_>) -> String {
    collapse_ws(&div.text().collect::<Vec<_>>().join(" "))
}

fn is_details_heading(text: &str) -> bool {
    let t = text.to_lowercase();
    t.contains("détails") || t.contains("details") || text.contains('👇')
}

fn try_deblock_digest(html: &str) -> Option<String> {
    let doc = Html::parse_fragment(html);
    let sel_fb = Selector::parse("div.f-fallback").ok()?;
    let fb = doc.select(&sel_fb).next()?;

    let kids: Vec<ElementRef<'_>> = fb.children().filter_map(ElementRef::wrap).collect();
    if kids.len() < 3 {
        return None;
    }

    let title_el = kids.first()?;
    if title_el.value().name() != "h3" {
        return None;
    }
    let title = collapse_ws(&title_el.text().collect::<Vec<_>>().join(""));
    if title.is_empty() {
        return None;
    }

    let amt_el = kids.get(1)?;
    if amt_el.value().name() != "div" {
        return None;
    }
    let amt_class = amt_el.attr("class").unwrap_or("");
    if !amt_class.contains("code") {
        return None;
    }
    let amount = amount_block_text(*amt_el);
    if amount.is_empty() {
        return None;
    }

    let details_h = kids.get(2)?;
    if details_h.value().name() != "h3" {
        return None;
    }
    let dh_text = collapse_ws(&details_h.text().collect::<Vec<_>>().join(""));
    if !is_details_heading(&dh_text) {
        return None;
    }

    let mut rows: Vec<(String, String)> = Vec::new();
    for k in kids.iter().skip(3) {
        match k.value().name() {
            "p" => {
                if let Some(row) = p_row_label_value(*k) {
                    rows.push(row);
                }
            }
            "div" => {
                let cls = k.attr("class").unwrap_or("");
                if cls.contains("warning") {
                    break;
                }
            }
            "h3" => break,
            _ => {}
        }
    }

    if rows.is_empty() {
        return None;
    }

    Some(build_deblock_digest(&title, &amount, &rows))
}

fn build_deblock_digest(title: &str, amount: &str, rows: &[(String, String)]) -> String {
    let mut s = String::from("<!-- rustymail:deblock-digest -->\n");
    s.push_str("<article class=\"rm-deblock-digest\">\n");
    s.push_str("  <h2>");
    s.push_str(&esc_html_pcdata(title));
    s.push_str("</h2>\n");
    s.push_str("  <p><strong>");
    s.push_str(&esc_html_pcdata(amount));
    s.push_str("</strong></p>\n");
    s.push_str("  <h3>Détails</h3>\n");
    s.push_str("  <table>\n    <tbody>\n");
    for (k, v) in rows {
        s.push_str("      <tr><th scope=\"row\">");
        s.push_str(&esc_html_pcdata(k));
        s.push_str("</th><td>");
        s.push_str(&esc_html_pcdata(v));
        s.push_str("</td></tr>\n");
    }
    s.push_str("    </tbody>\n  </table>\n");
    s.push_str("</article>\n");
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_receive_fixture_structure() {
        let html = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/deblock/receive_200eur.html"
        ));
        let out = try_deblock_digest(html).expect("digest");
        assert!(out.contains("rustymail:deblock-digest"));
        assert!(out.contains("200 EUR"));
        assert!(out.contains("IBAN"));
        assert!(out.contains("Pat DOE"));
        assert!(out.contains("<table>") && out.contains("scope=\"row\""));
    }

    #[test]
    fn parses_send_fixture_extra_rows() {
        let html = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/deblock/send_200eur.html"
        ));
        let out = try_deblock_digest(html).expect("digest");
        assert!(out.contains("Montant Envoyé") || out.contains("Destinataire"));
        assert!(out.contains("200 EUR"));
    }
}
