//! Transferts / réponses Outlook : signatures tierces, en-têtes De/Envoyé, bruit compose.

use std::sync::LazyLock;

use ego_tree::NodeId;
use regex::Regex;
use scraper::{ElementRef, Html, Selector};

use super::dom::{detach_nodes, element_visible_mass, visible_char_count};

static SEL_SIGNATURE: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("#Signature, #signature, #x_Signature, #x_signature")
        .expect("outlook signature selector")
});

static SEL_FWD_HEADER: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("#divRplyFwdMsg, #x_divRplyFwdMsg")
        .expect("outlook forward header selector")
});

static SEL_INLINE_QUOTE_BLOCKS: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("div, p, blockquote").expect("inline quote blocks selector")
});

static SEL_HR: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("hr").expect("hr selector"));

static SEL_COMPOSE_JUNK: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse(
        "#appendonsend, [id*='appendonsend'], [id*='LSI_marker'], .elementToProof",
    )
    .expect("outlook compose junk selector")
});

static RE_OUTLOOK_INLINE_QUOTE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?is)(?:de\s*:|from\s*:|-----original message-----).*?(?:envoy[ée]\s*:|sent\s*:).*?(?:objet\s*:|subject\s*:)",
    )
    .expect("outlook inline quote header regex")
});

/// Retire le bruit typique des transferts Outlook (sans nesting conversationnel complet).
pub fn fold_outlook_forward_noise(html: &str) -> String {
    if html.contains("rustymail:amazon-digest") || html.contains("rustymail:deblock-digest") {
        return html.to_string();
    }
    let mut doc = Html::parse_fragment(html);
    remove_compose_junk(&mut doc);
    remove_orphan_hrs_before_forward_headers(&mut doc);
    detach_outlook_signatures(&mut doc);
    detach_outlook_forward_headers(&mut doc);
    detach_outlook_inline_quote_headers(&mut doc);
    doc.html()
}

fn remove_compose_junk(doc: &mut Html) {
    let mut ids: Vec<NodeId> = doc
        .select(&SEL_COMPOSE_JUNK)
        .filter(|el| {
            let id = el.value().attr("id").unwrap_or("");
            if id.contains("LSI_marker") {
                return true;
            }
            element_is_empty_or_junk(*el)
        })
        .map(|el| el.id())
        .collect();
    ids.sort_unstable();
    ids.dedup();
    detach_nodes(doc, ids);
}

fn element_is_empty_or_junk(el: ElementRef<'_>) -> bool {
    let tag = el.value().name.local.as_ref();
    if tag == "hr" {
        return false;
    }
    if matches!(tag, "div" | "span" | "p") && element_visible_mass(el) == 0 {
        return true;
    }
    element_visible_mass(el) < 4
}

fn remove_orphan_hrs_before_forward_headers(doc: &mut Html) {
    let fwd_ids: std::collections::HashSet<NodeId> =
        doc.select(&SEL_FWD_HEADER).map(|e| e.id()).collect();
    let hr_ids: Vec<NodeId> = doc
        .select(&SEL_HR)
        .filter(|hr| {
            hr.next_siblings()
                .filter_map(ElementRef::wrap)
                .any(|s| fwd_ids.contains(&s.id()))
        })
        .map(|hr| hr.id())
        .collect();
    detach_nodes(doc, hr_ids);
}

fn detach_outlook_signatures(doc: &mut Html) {
    let ids: Vec<NodeId> = doc.select(&SEL_SIGNATURE).map(|e| e.id()).collect();
    detach_nodes(doc, ids);
}

fn detach_outlook_forward_headers(doc: &mut Html) {
    let ids: Vec<NodeId> = doc.select(&SEL_FWD_HEADER).map(|e| e.id()).collect();
    detach_nodes(doc, ids);
}

fn detach_outlook_inline_quote_headers(doc: &mut Html) {
    for _ in 0..32 {
        let candidates: Vec<(usize, NodeId)> = doc
            .select(&SEL_INLINE_QUOTE_BLOCKS)
            .filter(|el| block_looks_like_outlook_inline_quote_header(*el))
            .map(|el| {
                let mass = visible_char_count(&el.text().collect::<String>());
                (mass, el.id())
            })
            .collect();
        let Some((_, id)) = candidates.into_iter().min_by_key(|(mass, _)| *mass) else {
            break;
        };
        detach_nodes(doc, vec![id]);
    }
}

fn block_looks_like_outlook_inline_quote_header(el: ElementRef<'_>) -> bool {
    let text = normalize_outlook_quote_probe(&el.text().collect::<String>());
    let mass = visible_char_count(&text);
    if mass == 0 || mass > 5000 {
        return false;
    }
    RE_OUTLOOK_INLINE_QUOTE.is_match(&text)
}

fn normalize_outlook_quote_probe(s: &str) -> String {
    s.replace('\u{00a0}', " ")
        .replace("&nbsp;", " ")
        .replace('\u{2019}', "'")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_signature_and_forward_header_without_hiding_body() {
        let html = r#"<div>
<p>Message transféré court pour test.</p>
<div id="Signature"><table><tr><td>Nom Exemple</td></tr><tr><td>01 23 45 67 89</td></tr></table></div>
<div id="appendonsend"></div>
<hr>
<div id="divRplyFwdMsg"><b>De :</b> Alice &lt;a@example.com&gt;<br><b>Envoyé :</b> jeudi<br><b>À :</b> Bob<br><b>Objet :</b> TR: Sujet</div>
<div><p>Bonjour, voici le brief logistique demandé.</p></div>
</div>"#;
        let out = fold_outlook_forward_noise(html);
        assert!(out.contains("Message transféré"));
        assert!(out.contains("brief logistique"));
        assert!(!out.contains("id=\"Signature\""));
        assert!(!out.contains("divRplyFwdMsg"));
        assert!(!out.contains("Nom Exemple"));
    }

    #[test]
    fn removes_letsignit_x_signature_with_contact_table() {
        let html = r#"<div>
<p>Corps transféré visible.</p>
<div id="x_Signature"><table><tbody><tr><td><table><tbody><tr><td><p><b>Nicolas Exemple</b></p><p>01 23 45 67 89</p><p>nicolas.exemple@example.com</p><p>12345 Example City FRANCE</p></td></tr></tbody></table></td></tr></tbody></table><table><tbody><tr><td><div id="x_x_LSI_marker"><div>&nbsp;</div></div></td></tr></tbody></table></div>
</div>"#;
        let out = super::super::generic::finalize_html_for_display(html).html;
        assert!(out.contains("Corps transféré visible"));
        assert!(!out.contains("id=\"x_Signature\""));
        assert!(!out.contains("letsignit"));
        assert!(!out.contains("95670"));
    }

    #[test]
    fn removes_both_top_signature_and_nested_x_signature() {
        let html = r#"<div>
<div id="Signature"><table><tr><td>Signature transfert</td></tr></table></div>
<p>Commentaire transfert.</p>
<div id="x_Signature"><table><tr><td>01 23 45 67 89</td></tr><tr><td>contact@example.com</td></tr></table></div>
<div id="x_divRplyFwdMsg"><b>De :</b> Alice<br><b>Objet :</b> TR: test</div>
<p>Corps cité.</p>
</div>"#;
        let out = fold_outlook_forward_noise(html);
        assert!(!out.contains("Signature transfert"));
        assert!(!out.contains("id=\"Signature\""));
        assert!(!out.contains("id=\"x_Signature\""));
        assert!(!out.contains("x_divRplyFwdMsg"));
        assert!(out.contains("Commentaire transfert"));
        assert!(out.contains("Corps cité"));
    }

    #[test]
    fn removes_nested_x_signature_and_inline_quote_header() {
        let html = r#"<div>
<p>Intro transfert.</p>
<div id="x_Signature"><table><tr><td>contact@example.com</td></tr></table></div>
<hr><div id="x_divRplyFwdMsg"><b>De :</b> Coline Exemple &lt;coline.exemple@example.fr&gt;</div>
<div class="WordSection1">
<p>Bonjour à tous,</p>
<div style="border-top:solid"><p><b>De&nbsp;:</b> Coline Exemple<br><b>Envoyé&nbsp;:</b> mercredi<br><b>À&nbsp;:</b> Jean Exemple<br><b>Objet&nbsp;:</b> RE: Brief</p></div>
<p>Contenu historique plus ancien.</p>
</div>
</div>"#;
        let out = fold_outlook_forward_noise(html);
        assert!(out.contains("Intro transfert"));
        assert!(out.contains("Bonjour à tous"));
        assert!(out.contains("Contenu historique"));
        assert!(!out.contains("id=\"x_Signature\""));
        assert!(!out.contains("x_divRplyFwdMsg"));
        assert!(!out.contains("Coline Exemple<br"));
    }

    #[test]
    fn removes_long_inline_quote_with_many_recipients() {
        let html = r#"<div>
<p>Corps récent.</p>
<div><p><b>De :</b> Coline Exemple &lt;c.exemple@example.fr&gt;<br>
<b>Envoyé :</b> mercredi 3 juin 2026 16:29<br>
<b>À :</b> Alice &lt;a@example.fr&gt;; Bob &lt;b@example.fr&gt;; Carol &lt;c@example.fr&gt;; Dave &lt;d@example.fr&gt;; Eve &lt;e@example.fr&gt;; Frank &lt;f@example.fr&gt;<br>
<b>Cc :</b> One &lt;1@example.fr&gt;; Two &lt;2@example.fr&gt;; Three &lt;3@example.fr&gt;<br>
<b>Objet :</b> RE: Brief Logistique</p></div>
<p>Ancien corps visible.</p>
</div>"#;
        let out = fold_outlook_forward_noise(html);
        assert!(out.contains("Corps récent"));
        assert!(out.contains("Ancien corps visible"));
        assert!(!out.contains("Coline Exemple"));
    }
}
