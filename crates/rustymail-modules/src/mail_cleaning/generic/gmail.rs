use std::sync::LazyLock;

use ego_tree::NodeId;
use regex::Regex;
use scraper::{ElementRef, Html, Selector};

static GMAIL_QUOTE_SELECTORS: LazyLock<Vec<Selector>> = LazyLock::new(|| {
    [
        ".gmail_quote",
        ".gmail_quote_container",
        "blockquote.gmail_quote",
        ".gmail_signature",
        ".gmail_extra",
    ]
    .iter()
    .filter_map(|s| Selector::parse(s).ok())
    .collect()
});

static RE_GMAIL_WROTE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^on\s+.+\bwrote:\s*$").expect("gmail wrote header"));

static RE_TRIMMED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)show trimmed content").expect("trimmed content"));

pub fn clean_gmail_noise(doc: &mut Html) {
    remove_gmail_quote_blocks(doc);
    remove_gmail_wrote_headers(doc);
    remove_trimmed_content_nodes(doc);
}

fn remove_gmail_quote_blocks(doc: &mut Html) {
    let mut ids = Vec::new();
    for sel in GMAIL_QUOTE_SELECTORS.iter() {
        ids.extend(doc.select(sel).map(|e| e.id()));
    }
    ids.sort_unstable();
    ids.dedup();
    super::super::dom::detach_nodes(doc, ids);
}

fn remove_gmail_wrote_headers(doc: &mut Html) {
    let Ok(sel) = Selector::parse("div, p, blockquote, td") else {
        return;
    };
    let ids: Vec<NodeId> = doc
        .select(&sel)
        .filter(|el| block_starts_with_gmail_wrote(*el))
        .map(|el| el.id())
        .collect();
    super::super::dom::detach_nodes(doc, ids);
}

fn block_starts_with_gmail_wrote(el: ElementRef<'_>) -> bool {
    let text = el.text().collect::<String>();
    let first = text
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("");
    RE_GMAIL_WROTE.is_match(first)
}

fn remove_trimmed_content_nodes(doc: &mut Html) {
    let Ok(sel) = Selector::parse("div, span, p, a") else {
        return;
    };
    let ids: Vec<NodeId> = doc
        .select(&sel)
        .filter(|el| {
            let t = el.text().collect::<String>();
            RE_TRIMMED.is_match(&t) && super::super::dom::visible_char_count(&t) < 80
        })
        .map(|el| el.id())
        .collect();
    super::super::dom::detach_nodes(doc, ids);
}
