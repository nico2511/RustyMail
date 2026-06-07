//! Nettoyage HTML générique (Outlook, Gmail, trackers, prune, lisibilité).

mod attrs;
mod gmail;
mod images;
mod outlook;
mod prune;
mod readability;

use std::ops::Deref;

use scraper::{Html, Selector};

use crate::mail_cleaning::dom::detach_nodes;

pub use attrs::strip_presentation_attrs;
pub use images::is_outlook_noise_img;
pub use prune::prune_empty_boilerplate;

pub const GENERIC_RULE_SET_VERSION: &str = "9";

const REMOVABLE_TAGS: &[&str] = &[
    "script", "noscript", "iframe", "object", "embed", "style", "form", "input", "button",
    "select", "textarea", "meta", "link",
];

/// Structural cleanup before provider-specific passes (safe for Markdown conversion).
pub fn generic_html_clean(html: &str) -> String {
    let html = outlook::strip_mso_conditional_comments(html);
    let mut doc = Html::parse_fragment(&html);
    outlook::clean_outlook_noise(&mut doc);
    gmail::clean_gmail_noise(&mut doc);
    for tag in REMOVABLE_TAGS {
        let Ok(sel) = Selector::parse(tag) else {
            continue;
        };
        remove_all_matches(&mut doc, &sel);
    }
    if let Ok(img_sel) = Selector::parse("img") {
        let ids: Vec<_> = doc
            .select(&img_sel)
            .filter(|el| images::is_tracking_or_hidden_img(*el))
            .map(|el| el.deref().id())
            .collect();
        detach_nodes(&mut doc, ids);
    }
    doc.html()
}

fn remove_all_matches(doc: &mut Html, selector: &Selector) {
    let ids: Vec<_> = doc.select(selector).map(|e| e.deref().id()).collect();
    detach_nodes(doc, ids);
}

/// Résultat du passage finalize (HTML affichage + texte conversationnel optionnel).
pub struct FinalizeResult {
    pub html: String,
    pub conversation_text: Option<String>,
}

/// Dernier passage générique avant affichage / conversion Markdown.
pub fn finalize_html_for_display(html: &str) -> FinalizeResult {
    let pruned = prune_empty_boilerplate(html);
    let stripped = strip_presentation_attrs(&pruned);

    if let Some(report) = super::outlook_conversation::try_build_report(&stripped) {
        return FinalizeResult {
            html: readability::postprocess_readability(&report.html),
            conversation_text: Some(report.plain_text),
        };
    }

    let forwarded = super::outlook_forward::fold_outlook_forward_noise(&stripped);
    let folded = super::signature_html::fold_signature_tail(&forwarded);
    FinalizeResult {
        html: readability::postprocess_readability(&folded),
        conversation_text: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_script_and_1x1_tracker() {
        let html = r#"<div><script>x</script><img src="https://track.example/o.gif" width="1" height="1" role="presentation"/><p>Hi</p></div>"#;
        let out = generic_html_clean(html);
        assert!(!out.to_ascii_lowercase().contains("<script"));
        assert!(!out.contains("o.gif"));
        assert!(out.contains("Hi"));
    }

    #[test]
    fn prunes_outlook_empty_msonormal_paragraph() {
        let html = r#"<div><p class="MsoNormal"><span style="font-size:12.0pt">&nbsp;</span></p><p class="MsoNormal">Hello world</p></div>"#;
        let out = finalize_html_for_display(html).html;
        assert!(out.contains("Hello world"));
        assert!(!out.contains("MsoNormal"));
        assert!(!out.contains("style="));
    }

    #[test]
    fn finalize_builds_conversation_report_for_forward_chain() {
        let html = r#"<div><p>Message transféré.</p><div id="x_divRplyFwdMsg"><b>De :</b> Alice<br><b>Envoyé :</b> lundi<br><b>Objet :</b> TR: test</div><p>Corps visible.</p></div>"#;
        let out = finalize_html_for_display(html).html;
        assert!(out.contains("Message transféré"));
        assert!(out.contains("Corps visible"));
        assert!(out.contains("rm-conversation-report"));
        assert!(!out.contains("divRplyFwdMsg"));
    }

    #[test]
    fn finalize_keeps_x_signature_marker_for_css_hide() {
        let html = r#"<div><p>Corps visible.</p><div id="x_Signature"><table><tr><td><p>Jean Exemple</p><p>01 23 45 67 89</p><p>jean@example.com</p></td></tr></table></div></div>"#;
        let out = finalize_html_for_display(html).html;
        assert!(out.contains("Corps visible"));
        assert!(!out.contains("id=\"x_Signature\""));
        assert!(!out.contains("jean@example.com"));
    }

    #[test]
    fn keeps_small_logo_image() {
        let html = r#"<p>Hi</p><img src="https://cdn.example/logo.png" width="40" height="40" alt="Co"/>"#;
        let out = generic_html_clean(html);
        assert!(out.contains("logo.png"));
    }
}
