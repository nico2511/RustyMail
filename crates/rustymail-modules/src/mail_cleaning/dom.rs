//! Utilitaires DOM partagés par le nettoyage HTML générique.

use ego_tree::NodeId;
use scraper::{ElementRef, Html, Node};

pub fn detach_nodes(doc: &mut Html, ids: Vec<NodeId>) {
    for id in ids {
        if let Some(mut n) = doc.tree.get_mut(id) {
            let _ = n.detach();
        }
    }
}

pub fn node_depth(tree: &ego_tree::Tree<Node>, id: NodeId) -> usize {
    let mut depth = 0usize;
    let mut cur = tree.get(id);
    while let Some(node) = cur {
        if let Some(parent) = node.parent() {
            depth += 1;
            cur = tree.get(parent.id());
        } else {
            break;
        }
    }
    depth
}

pub fn element_visible_mass(el: ElementRef<'_>) -> usize {
    visible_char_count(&el.text().collect::<String>())
}

pub fn visible_char_count(t: &str) -> usize {
    t.chars().filter(|c| !is_invisible_mail_char(*c)).count()
}

pub fn is_invisible_mail_char(c: char) -> bool {
    c.is_whitespace()
        || matches!(
            c,
            '\u{00a0}' | '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{feff}' | '\u{2060}' | '\u{ad}'
        )
}

pub fn node_outer_html(node: ego_tree::NodeRef<'_, Node>) -> String {
    match node.value() {
        Node::Text(t) => escape_html_text(t),
        Node::Element(_) => ElementRef::wrap(node)
            .map(|e| e.html())
            .unwrap_or_default(),
        _ => String::new(),
    }
}

pub fn escape_html_text(raw: &str) -> String {
    let mut s = String::with_capacity(raw.len());
    for c in raw.chars() {
        match c {
            '&' => s.push_str("&amp;"),
            '<' => s.push_str("&lt;"),
            '>' => s.push_str("&gt;"),
            _ => s.push(c),
        }
    }
    s
}
