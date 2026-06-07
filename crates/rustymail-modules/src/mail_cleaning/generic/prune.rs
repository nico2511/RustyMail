use std::sync::LazyLock;

use ego_tree::NodeId;
use regex::Regex;
use scraper::{ElementRef, Html, Selector};

use crate::mail_cleaning::dom::{detach_nodes, element_visible_mass, node_depth, visible_char_count};

static PRUNE_EMPTY_SELECTORS: LazyLock<Vec<Selector>> = LazyLock::new(|| {
    [
        "span", "font", "i", "b", "em", "strong", "u", "p", "div", "center", "li", "h1", "h2",
        "h3", "h4", "h5", "h6", "td", "th", "section", "article",
    ]
    .iter()
    .filter_map(|s| Selector::parse(s).ok())
    .collect()
});

static MEANINGFUL_DESCENDANT: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse(
        "img, picture, video, audio, svg, a[href], pre, code, blockquote, table, hr, ul, ol, br",
    )
    .expect("meaningful descendant selector")
});

static RE_OTP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b\d{4,8}\b").expect("otp regex"));

pub fn prune_empty_boilerplate(html: &str) -> String {
    let mut doc = Html::parse_fragment(html);
    for _ in 0..24 {
        if !prune_empty_boilerplate_pass(&mut doc) {
            break;
        }
    }
    doc.html()
}

fn prune_empty_boilerplate_pass(doc: &mut Html) -> bool {
    let mut ids: Vec<(usize, NodeId)> = Vec::new();
    for sel in PRUNE_EMPTY_SELECTORS.iter() {
        for el in doc.select(sel) {
            let id = el.id();
            if should_prune_element(el) {
                ids.push((node_depth(&doc.tree, id), id));
            }
        }
    }
    if ids.is_empty() {
        return false;
    }
    ids.sort_by(|a, b| b.0.cmp(&a.0));
    ids.dedup_by(|a, b| a.1 == b.1);
    detach_nodes(doc, ids.into_iter().map(|(_, id)| id).collect());
    true
}

fn should_prune_element(el: ElementRef<'_>) -> bool {
    if el.select(&MEANINGFUL_DESCENDANT).next().is_some() {
        return false;
    }
    if preserve_short_informative_block(el) || preserve_single_cta(el) {
        return false;
    }
    element_visible_mass(el) == 0
}

fn preserve_short_informative_block(el: ElementRef<'_>) -> bool {
    let text = el.text().collect::<String>();
    let mass = visible_char_count(&text);
    if mass == 0 || mass > 220 {
        return false;
    }
    RE_OTP.is_match(&text)
        || text.to_ascii_lowercase().contains("code de vérification")
        || text.to_ascii_lowercase().contains("verification code")
        || text.to_ascii_lowercase().contains("montant")
        || text.to_ascii_lowercase().contains("expire")
}

fn preserve_single_cta(el: ElementRef<'_>) -> bool {
    let links: Vec<_> = el.select(&Selector::parse("a[href]").unwrap()).collect();
    if links.len() != 1 {
        return false;
    }
    let mass = element_visible_mass(el);
    mass > 0 && mass < 180
}
