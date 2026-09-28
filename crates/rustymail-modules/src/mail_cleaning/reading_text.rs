//! Texte de lecture aligné sur le HTML nettoyé affiché.
//!
//! On omet ce que la vue discussion ne montre pas tant qu’on ne l’ouvre pas :
//! citations repliées (`.rm-mail-folded-quote`) et signatures masquées
//! (`.rm-mail-signature`, en-têtes de transfert Outlook déjà hors du corps).

use scraper::{ElementRef, Html, Node};

const SKIP_CLASSES: &[&str] = &[
    "rm-mail-folded-quote",
    "rm-mail-signature",
    "rm-mail-forward-header",
    "rm-mail-outlook-quote-header",
];

/// Extrait le texte visible du HTML de lecture. Les citations repliées et les
/// signatures masquées ne font pas partie de la substance affichée.
pub fn reading_text_from_cleaned_html(html: &str) -> String {
    let doc = Html::parse_fragment(html);
    let mut buf = String::new();
    walk(doc.tree.root(), &mut buf);
    normalize_reading(&buf)
}

fn walk(node: ego_tree::NodeRef<'_, Node>, out: &mut String) {
    if let Some(el) = ElementRef::wrap(node) {
        if skip_element(el) {
            return;
        }
        let name = el.value().name();
        if name == "br" || name == "hr" {
            push_break(out);
            return;
        }
        let block = is_block(name);
        if block {
            push_break(out);
        }
        if name == "li" {
            out.push_str("- ");
        }
        for child in node.children() {
            walk(child, out);
        }
        if matches!(name, "td" | "th") {
            out.push(' ');
        }
        if block {
            push_break(out);
        }
        return;
    }
    if let Node::Text(text) = node.value() {
        out.push_str(text);
        return;
    }
    for child in node.children() {
        walk(child, out);
    }
}

fn skip_element(el: ElementRef<'_>) -> bool {
    let class = el.attr("class").unwrap_or("");
    class
        .split_whitespace()
        .any(|token| SKIP_CLASSES.contains(&token))
}

fn is_block(name: &str) -> bool {
    matches!(
        name,
        "p" | "div"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "li"
            | "tr"
            | "blockquote"
            | "pre"
            | "article"
            | "section"
            | "table"
            | "ul"
            | "ol"
            | "details"
    )
}

fn push_break(out: &mut String) {
    if out.is_empty() || out.ends_with('\n') {
        return;
    }
    out.push('\n');
}

fn normalize_reading(raw: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for line in raw.lines() {
        let collapsed = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if collapsed.is_empty() {
            if lines.last().is_some_and(|l| !l.is_empty()) {
                lines.push(String::new());
            }
        } else {
            lines.push(collapsed);
        }
    }
    while lines.last().is_some_and(|l| l.is_empty()) {
        lines.pop();
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_folded_quote_and_hidden_signature() {
        let html = r#"<p>Je suis d'accord pour jeudi.</p><details class="rm-mail-folded-quote"><summary>Citation</summary><p>Ancien pavé cité.</p></details><div class="rm-mail-signature"><p>Jean — 01 23 45 67 89</p></div>"#;
        let text = reading_text_from_cleaned_html(html);
        assert!(text.contains("d'accord pour jeudi"));
        assert!(!text.contains("Ancien pavé"));
        assert!(!text.contains("01 23"));
        assert!(!text.contains("Citation"));
    }
}
