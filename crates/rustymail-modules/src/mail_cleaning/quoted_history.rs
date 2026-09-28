//! Historique cité hors Gmail / Apple (`blockquote`) : replié, pas effacé.
//!
//! Le fil de la capture se présente comme du texte (lignes `De :` / `Envoyé :` /
//! `Objet :`, puis `Le … a écrit :`) sans `.gmail_quote` ni en-tête Outlook dans
//! un seul bloc. On coupe à la première frontière et on met la queue dans
//! `<details class="rm-mail-folded-quote">`, fermé par défaut.
//!
//! Un transfert qui n’a pas de réponse devant reste lisible. Les digests
//! (Amazon, Deblock, GitHub) et le rapport conversationnel ne sont pas réécrits ici.

use scraper::{ElementRef, Html, Node, Selector};

use super::dom::{escape_html_text, node_outer_html, serialize_fragment, visible_char_count};
use crate::quote_collapse::{
    history_fold_label, line_starts_quoted_history, normalize_line, quoted_history_start,
};

const MIN_REPLY_CHARS: usize = 2;

pub fn fold_quoted_history(html: &str) -> String {
    if skip_document(html) {
        return html.to_string();
    }
    let doc = Html::parse_fragment(html);
    let serialized = serialize_fragment(&doc);
    if let Some((outer, replacement)) = sibling_fold(&doc) {
        if let Some(updated) = replace_once(&serialized, &outer, &replacement) {
            return updated;
        }
    }
    if let Some((outer, replacement)) = br_fold(&doc) {
        if let Some(updated) = replace_once(&serialized, &outer, &replacement) {
            return updated;
        }
    }
    html.to_string()
}

fn skip_document(html: &str) -> bool {
    html.contains("rustymail:amazon-digest")
        || html.contains("rustymail:deblock-digest")
        || html.contains("rustymail:github-digest")
        || html.contains("rm-conversation-report")
}

fn sibling_fold(doc: &Html) -> Option<(String, String)> {
    let sel = Selector::parse("p, div, blockquote, pre, li, section, td").ok()?;
    for el in doc.select(&sel) {
        if inside_preserved(el) || !element_starts_history(el) {
            continue;
        }
        if let Some(pair) = wrap_from(el) {
            return Some(pair);
        }
    }
    None
}

fn element_starts_history(el: ElementRef<'_>) -> bool {
    let plain = element_plain(el);
    if visible_char_count(&plain) == 0 || plain.chars().count() > 8000 {
        return false;
    }
    let lines = plain_lines(&plain);
    let refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();
    if line_starts_quoted_history(&refs, 0) {
        return true;
    }
    // `De :` seul dans ce bloc ; `Envoyé :` / `Objet :` sont des frères.
    let first = normalize_line(refs.first().copied().unwrap_or(""));
    if !is_short_from_line(&first) {
        return false;
    }
    sibling_lines_complete_header(el, &refs)
}

fn is_short_from_line(line: &str) -> bool {
    let low = line.to_ascii_lowercase();
    (low.starts_with("de ")
        || low.starts_with("de:")
        || low.starts_with("from ")
        || low.starts_with("from:"))
        && line.chars().count() < 220
}

fn sibling_lines_complete_header(el: ElementRef<'_>, own: &[&str]) -> bool {
    let mut lines: Vec<String> = own.iter().map(|s| (*s).to_string()).collect();
    let mut looked = 0usize;
    for sib in el.next_siblings() {
        let text = node_plain(sib);
        if text.trim().is_empty() {
            continue;
        }
        lines.push(text);
        looked += 1;
        if looked > 8 {
            break;
        }
    }
    let refs: Vec<&str> = lines.iter().map(|s| s.as_str()).collect();
    line_starts_quoted_history(&refs, 0)
}

fn wrap_from(el: ElementRef<'_>) -> Option<(String, String)> {
    let start = climb_history_root(el);
    if visible_before(start) < MIN_REPLY_CHARS {
        return None;
    }
    let parent = start.parent()?;
    let children: Vec<_> = parent.children().collect();
    let mut idx = children.iter().position(|n| n.id() == start.id())?;
    while idx > 0 && is_leading_separator(children[idx - 1]) {
        idx -= 1;
    }
    let outer: String = children[idx..]
        .iter()
        .map(|n| node_outer_html(*n))
        .collect();
    if visible_char_count(&outer) < 4 {
        return None;
    }
    let summary = summary_for(start);
    Some((outer.clone(), details_html(&summary, &outer)))
}

fn climb_history_root(el: ElementRef<'_>) -> ElementRef<'_> {
    let mut cur = el;
    while let Some(parent) = cur.parent().and_then(ElementRef::wrap) {
        let name = parent.value().name();
        if name == "body" || name == "html" {
            break;
        }
        if visible_char_count_before_child(parent, cur.id()) >= MIN_REPLY_CHARS {
            break;
        }
        cur = parent;
    }
    cur
}

fn br_fold(doc: &Html) -> Option<(String, String)> {
    let sel = Selector::parse("body, p, div, blockquote, pre, li, td").ok()?;
    for el in doc.select(&sel) {
        if inside_preserved(el) || has_block_child(el) {
            continue;
        }
        if let Some(pair) = split_leaf(doc, el) {
            return Some(pair);
        }
    }
    None
}

fn split_leaf(doc: &Html, el: ElementRef<'_>) -> Option<(String, String)> {
    let children: Vec<_> = el.children().collect();
    if children.is_empty() {
        return None;
    }
    let mut segments: Vec<String> = vec![String::new()];
    let mut texts: Vec<String> = vec![String::new()];
    for child in &children {
        if is_br(*child) || is_hr(*child) {
            segments.push(String::new());
            texts.push(String::new());
            continue;
        }
        segments.last_mut()?.push_str(&node_outer_html(*child));
        texts.last_mut()?.push_str(&node_plain(*child));
    }
    let refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    let idx = quoted_history_start(&refs)?;
    let after = join_segments(&segments[idx..]);
    if visible_char_count(&after) < 4 {
        return None;
    }
    let before = join_segments(&segments[..idx]);
    let label_line = texts[idx..]
        .iter()
        .map(|s| normalize_line(s))
        .find(|s| !s.is_empty())
        .unwrap_or_default();
    let folded = details_html(&history_fold_label(&label_line), &after);
    let replacement = format!("{before}{folded}");
    let outer = if el.value().name() == "body" {
        serialize_fragment(doc)
    } else {
        el.html()
    };
    if outer.is_empty() || outer == replacement {
        return None;
    }
    Some((outer, replacement))
}

fn join_segments(segments: &[String]) -> String {
    segments.join("<br>")
}

fn details_html(summary: &str, inner: &str) -> String {
    let label = if summary.trim().is_empty() {
        "Historique".to_string()
    } else {
        summary.trim().to_string()
    };
    format!(
        r#"<details class="rm-mail-folded-quote"><summary>{}</summary><div class="rm-mail-quote-body">{}</div></details>"#,
        escape_html_text(&label),
        inner
    )
}

fn summary_for(el: ElementRef<'_>) -> String {
    let plain = element_plain(el);
    let first = plain
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("");
    history_fold_label(first)
}

fn element_plain(el: ElementRef<'_>) -> String {
    let mut buf = String::new();
    for child in el.children() {
        append_plain(child, &mut buf);
    }
    buf
}

fn node_plain(node: ego_tree::NodeRef<'_, Node>) -> String {
    let mut buf = String::new();
    append_plain(node, &mut buf);
    buf
}

fn append_plain(node: ego_tree::NodeRef<'_, Node>, out: &mut String) {
    match node.value() {
        Node::Text(t) => out.push_str(t),
        Node::Element(el) if el.name() == "br" || el.name() == "hr" => {
            if !out.ends_with('\n') {
                out.push('\n');
            }
        }
        Node::Element(_) => {
            let block = ElementRef::wrap(node).is_some_and(|e| {
                matches!(
                    e.value().name(),
                    "p" | "div" | "blockquote" | "li" | "tr" | "h1" | "h2" | "h3" | "pre"
                )
            });
            if block && !out.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
            for child in node.children() {
                append_plain(child, out);
            }
            if block && !out.ends_with('\n') {
                out.push('\n');
            }
        }
        _ => {
            for child in node.children() {
                append_plain(child, out);
            }
        }
    }
}

fn plain_lines(plain: &str) -> Vec<String> {
    plain.lines().map(|l| l.to_string()).collect()
}

fn has_block_child(el: ElementRef<'_>) -> bool {
    el.children().any(|n| {
        ElementRef::wrap(n).is_some_and(|child| {
            matches!(
                child.value().name(),
                "p" | "div" | "blockquote" | "table" | "ul" | "ol" | "pre" | "section" | "article"
            )
        })
    })
}

fn is_br(node: ego_tree::NodeRef<'_, Node>) -> bool {
    ElementRef::wrap(node).is_some_and(|el| el.value().name() == "br")
}

fn is_hr(node: ego_tree::NodeRef<'_, Node>) -> bool {
    ElementRef::wrap(node).is_some_and(|el| el.value().name() == "hr")
}

fn is_leading_separator(node: ego_tree::NodeRef<'_, Node>) -> bool {
    if let Some(el) = ElementRef::wrap(node) {
        return el.value().name() == "hr"
            && visible_char_count(&el.text().collect::<String>()) == 0;
    }
    if let Node::Text(t) = node.value() {
        return t.trim().is_empty();
    }
    false
}

fn inside_preserved(el: ElementRef<'_>) -> bool {
    el.ancestors().filter_map(ElementRef::wrap).any(|a| {
        let class = a.attr("class").unwrap_or("");
        class.split_whitespace().any(|c| {
            c == "rm-mail-folded-quote"
                || c == "rm-mail-signature"
                || c == "rm-conversation-report"
                || c == "rm-amazon-digest"
                || c == "rm-deblock-digest"
                || c == "rm-github-digest"
        })
    })
}

fn visible_before(el: ElementRef<'_>) -> usize {
    let mut mass = 0usize;
    let mut cur = el;
    while let Some(parent) = cur.parent() {
        mass += visible_char_count_before_child_node(&parent, cur.id());
        let Some(parent_el) = ElementRef::wrap(parent) else {
            break;
        };
        let name = parent_el.value().name();
        if name == "body" || name == "html" {
            break;
        }
        cur = parent_el;
    }
    mass
}

fn visible_char_count_before_child(parent: ElementRef<'_>, child_id: ego_tree::NodeId) -> usize {
    visible_char_count_before_child_node(&parent, child_id)
}

fn visible_char_count_before_child_node(
    parent: &ego_tree::NodeRef<'_, Node>,
    child_id: ego_tree::NodeId,
) -> usize {
    let mut mass = 0usize;
    for sib in parent.children() {
        if sib.id() == child_id {
            break;
        }
        mass += node_visible_mass(sib);
    }
    mass
}

fn node_visible_mass(node: ego_tree::NodeRef<'_, Node>) -> usize {
    if let Some(el) = ElementRef::wrap(node) {
        if inside_preserved(el) || has_class(el, "rm-mail-folded-quote") {
            return 0;
        }
        return visible_char_count(&el.text().collect::<String>());
    }
    if let Node::Text(t) = node.value() {
        return visible_char_count(t);
    }
    0
}

fn has_class(el: ElementRef<'_>, name: &str) -> bool {
    el.attr("class")
        .unwrap_or("")
        .split_whitespace()
        .any(|c| c == name)
}

fn replace_once(haystack: &str, outer: &str, replacement: &str) -> Option<String> {
    if outer.is_empty() {
        return None;
    }
    let pos = haystack.find(outer)?;
    let mut updated = String::with_capacity(haystack.len() - outer.len() + replacement.len());
    updated.push_str(&haystack[..pos]);
    updated.push_str(replacement);
    updated.push_str(&haystack[pos + outer.len()..]);
    Some(updated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_split_outlook_lines_and_keeps_the_reply() {
        let html = r#"<div>
<p>Bonjour Mr LECHOPIER,</p>
<p>Pouvez-vous me rappeler svp</p>
<p>Merci</p>
<hr>
<p>De : Nicolas Lechopier</p>
<p>Envoyé : mercredi 16 septembre 2026 11:44</p>
<p>À : secretariat@drcourty.fr</p>
<p>Objet : RE: Demande de rendez-vous</p>
<p>Bonjour,</p>
<p>Le 14 septembre 2026 13:21:22 GMT+02:00, Nicolas Lechopier a écrit :</p>
<p>Voici le document demandé.</p>
</div>"#;
        let out = fold_quoted_history(html);
        assert!(out.contains("rm-mail-folded-quote"));
        assert!(out.contains("Pouvez-vous me rappeler"));
        assert!(out.contains("document demandé"));
        let reply = out.find("Pouvez-vous me rappeler").unwrap();
        let fold = out.find("rm-mail-folded-quote").unwrap();
        let quoted = out.find("document demandé").unwrap();
        assert!(reply < fold);
        assert!(fold < quoted);
        assert!(!out.contains("rustymail:"));
    }

    #[test]
    fn folds_br_separated_history_inside_one_block() {
        let html = "<div>Bonjour Mr LECHOPIER,<br><br>Pouvez-vous me rappeler svp<br><br>De : Nicolas Lechopier<br>Envoyé : mercredi 16 septembre 2026 11:44<br>À : secretariat@drcourty.fr<br>Objet : RE: Demande de rendez-vous<br><br>Voici le document demandé.</div>";
        let out = fold_quoted_history(html);
        assert!(out.contains("rm-mail-folded-quote"));
        assert!(out.find("rappeler").unwrap() < out.find("rm-mail-folded-quote").unwrap());
        assert!(out.contains("document demandé"));
    }

    #[test]
    fn folds_wrote_line_without_blockquote() {
        let html = r#"<div><p>Oui, je confirme le créneau de jeudi.</p><p>Le 14 septembre 2026 13:21:22 GMT+02:00, Nicolas Lechopier a écrit :</p><p>Peux-tu relire le paragraphe 2 ?</p></div>"#;
        let out = fold_quoted_history(html);
        assert!(out.contains("rm-mail-folded-quote"));
        assert!(out.contains("créneau"));
        assert!(out.contains("paragraphe 2"));
        assert!(out.find("créneau").unwrap() < out.find("paragraphe 2").unwrap());
    }

    #[test]
    fn leaves_a_bare_forward_readable() {
        let html = r#"<div><p>De : Alice</p><p>Envoyé : lundi</p><p>Objet : TR: brief</p><p>Bonjour, voici le brief logistique.</p></div>"#;
        let out = fold_quoted_history(html);
        assert!(!out.contains("rm-mail-folded-quote"));
        assert!(out.contains("brief logistique"));
    }
}
