//! Citations de discussion (Gmail, Apple Mail) : repliées, pas effacées.
//! Une signature Gmail hors citation rejoint `rm-mail-signature` (masquée à l’affichage).

use std::collections::HashSet;
use std::sync::LazyLock;

use ego_tree::{NodeId, NodeRef};
use regex::Regex;
use scraper::{ElementRef, Html, Node, Selector};

use crate::mail_cleaning::dom::{
    element_visible_mass, escape_html_text, node_outer_html, serialize_fragment, visible_char_count,
};

static RE_WROTE_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(?:on\s+.+?\bwrote:|le\s+.+?\ba\s+écrit\s*:)\s*$").expect("wrote line")
});

static RE_CLASS_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)\sclass\s*=\s*"([^"]*)""#).expect("class attr"));

static RE_TRIMMED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)show trimmed content").expect("trimmed content"));

const QUOTE_CLASS_TOKENS: &[&str] = &["gmail_quote", "gmail_quote_container"];

/// Gmail natif (`gmail_quote`) ou préfixe Outlook (`x_gmail_quote`, `x_x_gmail_quote`, …).
fn is_quote_class_token(token: &str) -> bool {
    QUOTE_CLASS_TOKENS
        .iter()
        .any(|name| token == *name || token.ends_with(&format!("_{name}")))
}

pub fn clean_gmail_noise(doc: &mut Html) {
    let mut html = serialize_fragment(doc);
    for _ in 0..24 {
        let parsed = Html::parse_fragment(&html);
        let full = serialize_fragment(&parsed);
        let Some((outer, replacement)) = next_replacement(&parsed) else {
            break;
        };
        let Some(pos) = full.find(&outer) else {
            break;
        };
        let mut updated = String::with_capacity(full.len() - outer.len() + replacement.len());
        updated.push_str(&full[..pos]);
        updated.push_str(&replacement);
        updated.push_str(&full[pos + outer.len()..]);
        if updated == html {
            break;
        }
        html = updated;
    }
    // Une citation qui EST le message (transfert sans réponse) reste lisible :
    // on retire la classe que le CSS d’affichage masquerait.
    html = strip_quote_class_attrs(&html);
    *doc = Html::parse_fragment(&html);
    remove_trimmed_content_nodes(doc);
}

fn next_replacement(doc: &Html) -> Option<(String, String)> {
    quote_replacement(doc).or_else(|| signature_replacement(doc))
}

fn quote_replacement(doc: &Html) -> Option<(String, String)> {
    let sel = Selector::parse(
        ".gmail_quote, .gmail_quote_container, .x_gmail_quote, .gmail_extra, blockquote, [class*='gmail_quote']",
    )
    .ok()?;
    for el in doc.select(&sel) {
        if !is_quote_container(el) || has_quote_ancestor(el) || inside_preserved_region(el) {
            continue;
        }
        if element_visible_mass(el) == 0 {
            continue;
        }
        if let Some(repl) = replacement_for_quote(doc, el) {
            return Some(repl);
        }
    }
    None
}

fn replacement_for_quote(doc: &Html, el: ElementRef<'_>) -> Option<(String, String)> {
    let parent = el.parent()?;
    let children: Vec<NodeRef<'_, Node>> = parent.children().collect();
    let q_idx = children.iter().position(|n| n.id() == el.id())?;
    let start = prev_pure_wrote_index(&children, q_idx).unwrap_or(q_idx);
    if outside_mass(doc, &children[start..=q_idx]) < 3 {
        return None;
    }
    let outer: String = children[start..=q_idx]
        .iter()
        .map(|n| node_outer_html(*n))
        .collect();
    if outer.is_empty() {
        return None;
    }
    let summary = if start < q_idx {
        collapse_ws(
            &ElementRef::wrap(children[start])?
                .text()
                .collect::<String>(),
        )
    } else {
        summary_for(el)
    };
    let inner: String = el.children().map(node_outer_html).collect();
    Some((outer, details_html(&summary, &inner)))
}

fn signature_replacement(doc: &Html) -> Option<(String, String)> {
    let sel = Selector::parse(".gmail_signature").ok()?;
    for el in doc.select(&sel) {
        if inside_preserved_region(el) || has_quote_ancestor(el) {
            continue;
        }
        if element_visible_mass(el) == 0 {
            continue;
        }
        let outer = el.html();
        if outer.is_empty() {
            continue;
        }
        let inner: String = el.children().map(node_outer_html).collect();
        let wrapped = format!(r#"<div class="rm-mail-signature">{inner}</div>"#);
        return Some((outer, wrapped));
    }
    None
}

fn is_quote_container(el: ElementRef<'_>) -> bool {
    if el
        .attr("class")
        .unwrap_or("")
        .split_whitespace()
        .any(is_quote_class_token)
    {
        return true;
    }
    if has_class(el, "gmail_extra") && quote_signal(el) {
        return true;
    }
    el.value().name() == "blockquote"
        && el
            .attr("type")
            .is_some_and(|t| t.eq_ignore_ascii_case("cite"))
}

fn quote_signal(el: ElementRef<'_>) -> bool {
    if el
        .select(
            &Selector::parse(".gmail_quote, .x_gmail_quote, [class*='gmail_quote'], blockquote")
                .unwrap(),
        )
        .next()
        .is_some()
    {
        return true;
    }
    el.text()
        .collect::<String>()
        .lines()
        .any(|line| is_wrote_line(line.trim()))
}

fn has_quote_ancestor(el: ElementRef<'_>) -> bool {
    el.ancestors()
        .filter_map(ElementRef::wrap)
        .any(is_quote_container)
}

fn inside_preserved_region(el: ElementRef<'_>) -> bool {
    el.ancestors()
        .filter_map(ElementRef::wrap)
        .any(|a| has_class(a, "rm-mail-folded-quote") || has_class(a, "rm-mail-signature"))
}

fn has_class(el: ElementRef<'_>, name: &str) -> bool {
    el.attr("class")
        .unwrap_or("")
        .split_whitespace()
        .any(|c| c == name)
}

fn prev_pure_wrote_index(children: &[NodeRef<'_, Node>], quote_idx: usize) -> Option<usize> {
    let mut i = quote_idx;
    while i > 0 {
        i -= 1;
        match children[i].value() {
            Node::Text(t) if t.trim().is_empty() => continue,
            Node::Element(_) => {
                let el = ElementRef::wrap(children[i])?;
                if is_pure_wrote_element(el) && !is_quote_container(el) {
                    return Some(i);
                }
                return None;
            }
            _ => return None,
        }
    }
    None
}

fn is_pure_wrote_element(el: ElementRef<'_>) -> bool {
    let text = collapse_ws(&el.text().collect::<String>());
    text.len() < 180 && is_wrote_line(&text)
}

fn is_wrote_line(text: &str) -> bool {
    let t = collapse_ws(text);
    !t.is_empty() && RE_WROTE_LINE.is_match(&t)
}

/// Texte hors de la citation, sans compter une signature qui sera masquée.
fn outside_mass(doc: &Html, quoted_nodes: &[NodeRef<'_, Node>]) -> usize {
    let quoted_ids: HashSet<NodeId> = quoted_nodes.iter().map(|n| n.id()).collect();
    let mut mass = 0usize;
    for node in doc.tree.root().descendants() {
        let Node::Text(text) = node.value() else {
            continue;
        };
        if quoted_ids.contains(&node.id()) || node.ancestors().any(|a| quoted_ids.contains(&a.id()))
        {
            continue;
        }
        if node
            .ancestors()
            .filter_map(ElementRef::wrap)
            .any(|a| has_class(a, "gmail_signature") || has_class(a, "rm-mail-signature"))
        {
            continue;
        }
        mass += visible_char_count(text);
    }
    mass
}

fn summary_for(el: ElementRef<'_>) -> String {
    let text = el.text().collect::<String>();
    let first = text
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("");
    if is_wrote_line(first) {
        truncate_chars(first, 160)
    } else {
        "Citation".to_string()
    }
}

fn details_html(summary: &str, inner: &str) -> String {
    let summary = truncate_chars(&collapse_ws(summary), 160);
    let label = if summary.is_empty() {
        "Citation".to_string()
    } else {
        summary
    };
    format!(
        r#"<details class="rm-mail-folded-quote"><summary>{}</summary><div class="rm-mail-quote-body">{}</div></details>"#,
        escape_html_text(&label),
        strip_quote_class_attrs(inner)
    )
}

fn strip_quote_class_attrs(html: &str) -> String {
    RE_CLASS_ATTR
        .replace_all(html, |caps: &regex::Captures| {
            let kept: Vec<&str> = caps
                .get(1)
                .map(|m| m.as_str())
                .unwrap_or("")
                .split_whitespace()
                .filter(|token| !is_quote_class_token(token))
                .collect();
            if kept.is_empty() {
                String::new()
            } else {
                format!(r#" class="{}""#, kept.join(" "))
            }
        })
        .into_owned()
}

fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}

fn remove_trimmed_content_nodes(doc: &mut Html) {
    let Ok(sel) = Selector::parse("div, span, p, a") else {
        return;
    };
    let ids: Vec<_> = doc
        .select(&sel)
        .filter(|el| {
            if inside_preserved_region(*el) {
                return false;
            }
            let t = el.text().collect::<String>();
            RE_TRIMMED.is_match(&t) && visible_char_count(&t) < 80
        })
        .map(|el| el.id())
        .collect();
    super::super::dom::detach_nodes(doc, ids);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_gmail_quote_and_keeps_the_reply() {
        let html = r#"<div><p>Réponse courte du fil.</p><div class="gmail_quote"><div>On Mon, 1 Jan 2024 at 10:00, Alice wrote:</div><blockquote class="gmail_quote">Ancien message long dans le fil.</blockquote></div></div>"#;
        let mut doc = Html::parse_fragment(html);
        clean_gmail_noise(&mut doc);
        let out = serialize_fragment(&doc);
        assert!(out.contains("Réponse courte"));
        assert!(out.contains("rm-mail-folded-quote"));
        assert!(out.contains("Ancien message long"));
        assert!(!out.contains("gmail_quote"));
        let reply = out.find("Réponse courte").unwrap();
        let quoted = out.find("Ancien message long").unwrap();
        assert!(reply < quoted);
    }

    #[test]
    fn sole_gmail_quote_stays_readable() {
        let html = r#"<div class="gmail_quote"><p>Seul contenu du transfert.</p></div>"#;
        let mut doc = Html::parse_fragment(html);
        clean_gmail_noise(&mut doc);
        let out = serialize_fragment(&doc);
        assert!(out.contains("Seul contenu du transfert"));
        assert!(!out.contains("rm-mail-folded-quote"));
        assert!(!out.contains("gmail_quote"));
    }

    #[test]
    fn folds_outlook_prefixed_x_gmail_quote() {
        let html = r#"<div><p>Pouvez-vous me rappeler svp</p><div class="x_gmail_quote"><div>Le 14 septembre 2026, Alice a écrit :</div><blockquote class="x_gmail_quote"><p>Ancien message Outlook.</p></blockquote></div></div>"#;
        let mut doc = Html::parse_fragment(html);
        clean_gmail_noise(&mut doc);
        let out = serialize_fragment(&doc);
        assert!(out.contains("rappeler"));
        assert!(out.contains("rm-mail-folded-quote"));
        assert!(out.contains("Ancien message Outlook"));
        assert!(!out.contains("x_gmail_quote"));
    }
}
