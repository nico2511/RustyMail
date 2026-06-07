//! Signatures HTML : marqueurs textuels, `#Signature`, tables de fin (Outlook sans classe dédiée).
//! Produit `<div class="rm-mail-signature">` (masqué côté UI).

use std::sync::LazyLock;

use ego_tree::NodeId;
use regex::Regex;
use scraper::{ElementRef, Html, Selector};

use super::dom::{element_visible_mass, node_outer_html, visible_char_count};

const SIGNATURE_MARKERS: &[&str] = &[
    "cordialement",
    "bien cordialement",
    "bien à vous",
    "bien a vous",
    "mes salutations",
    "salutations distinguées",
    "salutations",
    "respectueusement",
    "best regards",
    "kind regards",
    "warm regards",
    "regards,",
    "thanks,",
    "thank you,",
    "sent from my",
    "envoyé depuis",
    "envoyé de mon",
    "get outlook for",
    "cdt,",
    "cdlt,",
];

static MARKER_CANDIDATES: LazyLock<Vec<Selector>> = LazyLock::new(|| {
    [
        "p", "div", "span", "td", "th", "li", "h1", "h2", "h3", "h4", "h5", "h6", "font",
    ]
    .iter()
    .filter_map(|s| Selector::parse(s).ok())
    .collect()
});

static SEL_TABLE: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("table").expect("table selector"));

static RE_PHONE: LazyLock<Regex> = LazyLock::new(|| {
    // Tolérant : +33, (0), espaces/points/tirets, min 8 chiffres au total.
    Regex::new(r"(?x)\b(?:\+?\d[\d\s().-]{7,}\d)\b").expect("phone regex")
});

static RE_POSTAL_CODE_FR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b\d{5}\b").expect("postal code fr"));

/// Enveloppe la queue signature dans `<div class="rm-mail-signature">` (masquée côté UI).
pub fn fold_signature_tail(html: &str) -> String {
    if html.contains("rustymail:amazon-digest") || html.contains("rustymail:deblock-digest") {
        return html.to_string();
    }
    // Signatures explicites (#Signature, x_Signature…) : traitées par outlook_forward (wrap isolé).
    let doc = Html::parse_fragment(html);
    if let Some(split_id) = find_marker_split(&doc) {
        return rebuild_with_signature_wrapper(&doc, split_id, 24)
            .unwrap_or_else(|| html.to_string());
    }
    if let Some(split_id) = find_tail_split(&doc) {
        return rebuild_with_signature_wrapper(&doc, split_id, 24)
            .unwrap_or_else(|| html.to_string());
    }
    html.to_string()
}

fn find_tail_split(doc: &Html) -> Option<NodeId> {
    find_shallow_tail_split(doc).or_else(|| find_trailing_signature_tables_split(doc))
}

fn find_marker_split(doc: &Html) -> Option<NodeId> {
    let total = doc.tree.root().descendants().count().max(1);
    let mut last: Option<NodeId> = None;

    for sel in MARKER_CANDIDATES.iter() {
        for el in doc.select(sel) {
            if is_inside_signature_fold_region(el) {
                continue;
            }
            if !element_looks_like_signature_start(el) {
                continue;
            }
            let split = choose_split_element(el);
            last = Some(split.id());
        }
    }
    let split_id = last?;
    if marker_split_is_plausible(doc, split_id, total) {
        Some(split_id)
    } else {
        None
    }
}

/// Blocs de fin (souvent 1–3 `<table>` Outlook) sans formule de politesse détectée.
fn find_trailing_signature_tables_split(doc: &Html) -> Option<NodeId> {
    let tables: Vec<ElementRef<'_>> = doc
        .select(&SEL_TABLE)
        .filter(|t| !is_inside_signature_fold_region(*t))
        .collect();
    let run = trailing_signature_tables(&tables)?;
    let first = run[0];
    split_at_signature_sibling_cluster(first)
}

fn trailing_signature_tables<'a>(tables: &'a [ElementRef<'a>]) -> Option<Vec<ElementRef<'a>>> {
    let mut run: Vec<ElementRef<'_>> = Vec::new();
    for table in tables.iter().rev() {
        if table_looks_like_signature_tail_block(*table) {
            run.push(*table);
        } else if !run.is_empty() {
            break;
        }
    }
    run.reverse();
    if run.is_empty() || run.len() > 4 {
        return None;
    }
    Some(run)
}

/// Cherche le premier nœud « frère » dont la queue (lui + suivants) ressemble à une signature.
fn find_shallow_tail_split(doc: &Html) -> Option<NodeId> {
    for container in content_containers(doc) {
        if let Some(id) = tail_split_among_children(container) {
            return Some(id);
        }
    }
    None
}

fn content_containers(doc: &Html) -> Vec<ElementRef<'_>> {
    let mut out = Vec::new();
    for child in doc.tree.root().children() {
        if let Some(el) = ElementRef::wrap(child) {
            out.push(el);
            if element_tag_name(el) == "div" {
                for grand in el.children().filter_map(ElementRef::wrap) {
                    if element_tag_name(grand) == "div" {
                        out.push(grand);
                    }
                }
            }
        }
    }
    if out.is_empty() {
        if let Ok(sel) = Selector::parse("div") {
            doc.select(&sel).take(3).for_each(|el| out.push(el));
        }
    }
    out
}

fn tail_split_among_children(container: ElementRef<'_>) -> Option<NodeId> {
    let children: Vec<ElementRef<'_>> = container.children().filter_map(ElementRef::wrap).collect();
    if children.len() < 2 {
        return None;
    }
    for i in 1..children.len() {
        let before_mass: usize = children[..i].iter().map(|c| element_visible_mass(*c)).sum();
        if before_mass < 24 {
            continue;
        }
        if children[i..]
            .iter()
            .all(|c| node_looks_like_signature_tail(*c))
        {
            return Some(children[i].id());
        }
    }
    None
}

fn split_at_signature_sibling_cluster(start: ElementRef<'_>) -> Option<NodeId> {
    let mut cur = start;
    loop {
        if let Some(split) = tail_split_among_children(cur) {
            return Some(split);
        }
        if let Some(parent) = cur.parent().and_then(ElementRef::wrap) {
            if element_tag_name(parent) == "div" {
                let sibs: Vec<_> = parent.children().filter_map(ElementRef::wrap).collect();
                if sibs.len() == 1 {
                    cur = parent;
                    continue;
                }
            }
            return tail_split_among_children(parent).or(Some(start.id()));
        }
        return Some(start.id());
    }
}

fn marker_split_is_plausible(doc: &Html, split_id: NodeId, total_nodes: usize) -> bool {
    let order = document_order(doc, split_id);
    if order * 100 / total_nodes.max(1) >= 42 {
        return true;
    }
    tail_looks_like_signature_block(doc, split_id)
}

fn tail_looks_like_signature_block(doc: &Html, split_id: NodeId) -> bool {
    let Some(node) = doc.tree.get(split_id) else {
        return false;
    };
    let Some(split) = ElementRef::wrap(node) else {
        return false;
    };
    let Some(parent) = split.parent().and_then(ElementRef::wrap) else {
        return false;
    };
    let child_ids: Vec<NodeId> = parent.children().map(|c| c.id()).collect();
    let Some(pos) = child_ids.iter().position(|&id| id == split_id) else {
        return false;
    };
    let tail = html_from_sibling_range(doc, parent.id(), pos, child_ids.len());
    let low = tail.to_ascii_lowercase();
    if low.contains("mailto:") || low.contains("tel:") {
        return true;
    }
    if let Some(table) = split
        .next_siblings()
        .filter_map(ElementRef::wrap)
        .find(|s| element_tag_name(*s) == "table")
    {
        return table_looks_like_signature_tail_block(table);
    }
    element_tag_name(split) == "table" && table_looks_like_signature_tail_block(split)
}

fn element_tag_name(el: ElementRef<'_>) -> &str {
    el.value().name.local.as_ref()
}

/// Déjà plié par outlook_forward ou bloc explicite Outlook (#Signature, divRplyFwdMsg…).
fn is_inside_signature_fold_region(el: ElementRef<'_>) -> bool {
    el.ancestors()
        .filter_map(ElementRef::wrap)
        .any(|a| {
            if let Some(class) = a.value().attr("class") {
                if class.split_whitespace().any(|c| {
                    c == "rm-mail-signature"
                        || c == "rm-mail-forward-header"
                        || c == "rm-mail-outlook-quote-header"
                }) {
                    return true;
                }
            }
            if let Some(id) = a.value().attr("id") {
                let id = id.to_ascii_lowercase();
                if id.contains("signature") || id.contains("rplyfwdmsg") {
                    return true;
                }
            }
            false
        })
}

fn choose_split_element(marker: ElementRef<'_>) -> ElementRef<'_> {
    let tag = element_tag_name(marker);
    if matches!(tag, "td" | "th") {
        if let Some(table) = marker
            .ancestors()
            .filter_map(ElementRef::wrap)
            .find(|a| element_tag_name(*a) == "table")
        {
            return first_table_in_trailing_cluster(table);
        }
    }
    if tag == "p" || tag == "div" {
        if marker
            .next_siblings()
            .filter_map(ElementRef::wrap)
            .any(|s| matches!(element_tag_name(s), "table" | "div"))
        {
            return marker;
        }
    }
    if tag == "table" {
        return first_table_in_trailing_cluster(marker);
    }
    marker
}

fn first_table_in_trailing_cluster(table: ElementRef<'_>) -> ElementRef<'_> {
    if let Some(parent) = table.parent().and_then(ElementRef::wrap) {
        let tables: Vec<_> = parent
            .children()
            .filter_map(ElementRef::wrap)
            .filter(|s| element_tag_name(*s) == "table")
            .collect();
        if let Some(pos) = tables.iter().position(|t| t.id() == table.id()) {
            let trailing = &tables[pos..];
            if !trailing.is_empty()
                && trailing
                    .iter()
                    .all(|t| table_looks_like_signature_tail_block(*t))
            {
                return trailing[0];
            }
        }
    }
    table
}

fn table_looks_like_signature_block(table: ElementRef<'_>) -> bool {
    let text = table.text().collect::<String>();
    let mass = visible_char_count(&text);
    if mass > 2500 {
        return false;
    }
    if table.select(&Selector::parse("tr").unwrap()).count() > 12 {
        return false;
    }
    has_signature_contact_signals(table) || mass < 900
}

fn table_looks_like_signature_tail_block(table: ElementRef<'_>) -> bool {
    if !table_looks_like_signature_block(table) {
        return false;
    }
    has_signature_contact_signals(table)
        || table
            .select(&Selector::parse("img").unwrap())
            .next()
            .is_some()
}

fn has_signature_contact_signals(el: ElementRef<'_>) -> bool {
    if el
        .select(&Selector::parse("a[href^='mailto:'], a[href^='tel:']").unwrap())
        .next()
        .is_some()
    {
        return true;
    }
    let low = el.text().collect::<String>().to_ascii_lowercase();
    low.contains('@')
        || low.contains("www.")
        || low.contains("http://")
        || low.contains("https://")
        || low.contains("linkedin")
        || low.contains("twitter.com")
        || looks_like_phone_or_address(&low)
}

fn looks_like_phone_or_address(low: &str) -> bool {
    if RE_PHONE.is_match(low) {
        return true;
    }
    // Mots-clés typiques signatures + code postal FR (évite faux positifs).
    if !RE_POSTAL_CODE_FR.is_match(low) {
        return false;
    }
    low.contains("adresse")
        || low.contains("rue ")
        || low.contains("avenue")
        || low.contains("bd ")
        || low.contains("boulevard")
        || low.contains("chemin")
        || low.contains("impasse")
        || low.contains("allée")
        || low.contains("allee")
        || low.contains("bp ")
        || low.contains("b.p")
        || low.contains("cedex")
        || low.contains("france")
}

fn node_looks_like_signature_tail(el: ElementRef<'_>) -> bool {
    match element_tag_name(el) {
        "table" => table_looks_like_signature_tail_block(el),
        "p" | "div" | "span" | "font" | "center" => {
            let mass = element_visible_mass(el);
            if mass == 0 {
                return true;
            }
            if element_looks_like_signature_start(el) {
                return true;
            }
            mass < 220 && has_signature_contact_signals(el)
        }
        "br" | "hr" => true,
        _ => false,
    }
}

fn element_looks_like_signature_start(el: ElementRef<'_>) -> bool {
    let text = el.text().collect::<String>();
    let compact: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.len() > 140 {
        return false;
    }
    text_starts_signature_marker(&compact)
}

fn text_starts_signature_marker(text: &str) -> bool {
    let t = normalize_signature_text(text.trim());
    if t.is_empty() {
        return false;
    }
    if t.starts_with("-- ") || t == "--" {
        return true;
    }
    let low = t.to_ascii_lowercase();
    SIGNATURE_MARKERS.iter().any(|m| low.starts_with(m))
}

fn normalize_signature_text(s: &str) -> String {
    s.replace('\u{2019}', "'")
        .replace('\u{2018}', "'")
        .replace('\u{00a0}', " ")
}

fn document_order(doc: &Html, id: NodeId) -> usize {
    doc.tree
        .root()
        .descendants()
        .enumerate()
        .find_map(|(i, n)| (n.id() == id).then_some(i))
        .unwrap_or(0)
}

fn rebuild_with_signature_wrapper(
    doc: &Html,
    split_id: NodeId,
    min_before_chars: usize,
) -> Option<String> {
    let split = ElementRef::wrap(doc.tree.get(split_id)?)?;
    let parent = split.parent().and_then(ElementRef::wrap)?;
    let parent_id = parent.id();

    let child_ids: Vec<NodeId> = parent.children().map(|c| c.id()).collect();
    let pos = child_ids.iter().position(|&id| id == split_id)?;

    let before = html_from_sibling_range(doc, parent_id, 0, pos);
    let tail = html_from_sibling_range(doc, parent_id, pos, child_ids.len());
    if visible_char_count(&tail) < 6 {
        return None;
    }
    if visible_char_count(&before) < min_before_chars {
        return None;
    }

    Some(format!(
        r#"{before}<div class="rm-mail-signature">{tail}</div>"#
    ))
}

fn html_from_sibling_range(doc: &Html, parent_id: NodeId, start: usize, end: usize) -> String {
    let Some(parent) = doc.tree.get(parent_id) else {
        return String::new();
    };
    let children: Vec<_> = parent.children().collect();
    let mut out = String::new();
    for child in &children[start..end.min(children.len())] {
        out.push_str(&node_outer_html(*child));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_cordialement_and_following_tables() {
        let html = r#"<div><p>Corps du message avec du contenu utile ici.</p><p>Cordialement,</p><table><tr><td>Jean Exemple</td></tr></table><table><tr><td><a href="mailto:jean.exemple@example.com">jean.exemple@example.com</a></td></tr></table></div>"#;
        let out = fold_signature_tail(html);
        assert!(out.contains("Corps du message"));
        assert!(out.contains("rm-mail-signature"));
        let (visible, _) = out.split_once("rm-mail-signature").expect("signature wrapper");
        assert!(!visible.contains("Jean Exemple"));
    }

    #[test]
    fn folds_tables_only_signature_without_marker() {
        let html = r#"<div><p>Message principal avec assez de texte pour valider le masquage.</p><table><tr><td><b>Jean Exemple</b></td></tr><tr><td><a href="mailto:j@example.com">j@example.com</a></td></tr></table><table><tr><td><img src="https://cdn.example/logo.png" alt="logo" width="80" height="40"/></td></tr></table></div>"#;
        let out = fold_signature_tail(html);
        assert!(out.contains("rm-mail-signature"));
        assert!(out.contains("Message principal"));
        let (visible, _) = out.split_once("rm-mail-signature").expect("wrapper");
        assert!(!visible.contains("j@example.com"));
    }

    #[test]
    fn folds_tables_only_signature_with_phone_and_postal_address() {
        let html = r#"<div><p>Message principal avec du contenu utile.</p><table><tr><td>Service Exemple</td></tr><tr><td>Tél : +33 6 12 34 56 78</td></tr><tr><td>12 rue de la Paix</td></tr><tr><td>75002 Paris</td></tr><tr><td>contact@example.com</td></tr></table></div>"#;
        let out = fold_signature_tail(html);
        assert!(out.contains("rm-mail-signature"));
        let (visible, _) = out.split_once("rm-mail-signature").expect("wrapper");
        assert!(visible.contains("Message principal"));
        assert!(!visible.to_ascii_lowercase().contains("tél"));
        assert!(!visible.contains("75002"));
    }

    #[test]
    fn folds_marker_inside_table_cell_plus_sibling_tables() {
        let html = r#"<div><p>Corps utile du message professionnel ici.</p><table><tr><td>Cordialement,</td></tr></table><table><tr><td>Service Support</td></tr></table><table><tr><td><a href="mailto:s@example.com">s@example.com</a></td></tr></table></div>"#;
        let out = fold_signature_tail(html);
        assert!(out.contains("rm-mail-signature"));
        let (visible, _) = out.split_once("rm-mail-signature").expect("wrapper");
        assert!(visible.contains("Corps utile"));
        assert!(!visible.contains("Service Support"));
    }

    #[test]
    fn leaves_explicit_signature_id_to_outlook_forward() {
        // #Signature / x_Signature wrapping lives in outlook_forward (wrap isolé).
        let html = r#"<div><p>Hello</p><div id="Signature"><table><tr><td>Logo</td></tr></table></div></div>"#;
        let out = fold_signature_tail(html);
        assert!(!out.contains("rm-mail-signature"));
        assert!(out.contains(r#"id="Signature""#));
    }

    #[test]
    fn ignores_early_cordialement_in_thread() {
        let html = r#"<div><p>Cordialement, voici la réponse.</p><p>Suite du fil.</p><p>Fin.</p></div>"#;
        let out = fold_signature_tail(html);
        assert!(!out.contains("rm-mail-signature"));
    }
}
