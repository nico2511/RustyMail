//! Applique une fixture déjà validée à un HTML.
//!
//! Échec fermé : domaine non reconnu, racine absente, ou ancres header/body
//! qui ne tiennent pas → `None`. Le footer masqué est un stop, pas une ancre
//! obligatoire (l'envoi Deblock n'a pas de `div.warning`).

use std::sync::LazyLock;

use regex::Regex;
use scraper::{ElementRef, Html, Selector};

use super::model::{
    Anchor, AnchorRole, DigestFixture, DomainRule, RowSpec, StopWhen, ZoneAction, ZonePresentation,
    ZoneSpec,
};

static RE_P_ROW: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<(?:b|strong)>([^<]+)</(?:b|strong)>\s*(?:<br\s*/?>)\s*([\s\S]+?)\s*$")
        .expect("digest p-row regex")
});

static RE_STRIP_TAGS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<[^>]+>").expect("digest strip tags regex"));

/// Du plus spécifique au moins spécifique. Si la structure ne tient pas, on
/// essaie la fixture suivante. À score égal, l'`id` départage.
pub fn apply_fixtures(
    fixtures: &[DigestFixture],
    html: &str,
    sender_email: &str,
) -> Option<String> {
    let mut ranked: Vec<(u32, &DigestFixture)> = fixtures
        .iter()
        .filter_map(|fixture| {
            sender_specificity(sender_email, fixture).map(|score| (score, fixture))
        })
        .collect();
    ranked.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.id.cmp(&b.1.id)));
    for (_, fixture) in ranked {
        if let Some(rendered) = apply_one(fixture, html) {
            return Some(rendered);
        }
    }
    None
}

pub fn sender_specificity(email: &str, fixture: &DigestFixture) -> Option<u32> {
    let domain = email_domain(email)?;
    let mut best: Option<u32> = None;
    for rule in fixture.sender_rules() {
        if let Some(score) = domain_rule_score(&domain, rule) {
            best = Some(best.map_or(score, |prev| prev.max(score)));
        }
    }
    best
}

fn domain_rule_score(domain: &str, rule: &DomainRule) -> Option<u32> {
    if let Some(exact) = rule.exact.as_deref() {
        let exact = exact.trim().to_ascii_lowercase();
        if !exact.is_empty() && domain == exact {
            return Some(1_000_000 + exact.len() as u32);
        }
    }
    if let Some(suffix) = rule.suffix.as_deref() {
        let suffix = normalize_suffix(suffix);
        if !suffix.is_empty() && suffix != "." && domain.ends_with(&suffix) {
            return Some(suffix.len() as u32);
        }
    }
    None
}

fn normalize_suffix(suffix: &str) -> String {
    let suffix = suffix.trim().to_ascii_lowercase();
    if suffix.is_empty() || suffix.starts_with('.') {
        suffix
    } else {
        format!(".{suffix}")
    }
}

fn email_domain(email: &str) -> Option<String> {
    let email = email.trim().to_ascii_lowercase();
    let (_, domain) = email.rsplit_once('@')?;
    if domain.is_empty() {
        return None;
    }
    Some(domain.to_string())
}

fn apply_one(fixture: &DigestFixture, html: &str) -> Option<String> {
    let doc = Html::parse_fragment(html);
    let children = root_children(&doc, fixture)?;
    let header = render_zone(&fixture.zones.header, &children, ZoneKind::Header)?;
    let body = render_zone(&fixture.zones.body, &children, ZoneKind::Body)?;
    let footer = render_zone(&fixture.zones.footer, &children, ZoneKind::Footer)?;
    if header.is_empty() && body.is_empty() {
        return None;
    }
    Some(render_article(fixture, &header, &body, &footer))
}

#[derive(Clone, Copy)]
enum ZoneKind {
    Header,
    Body,
    Footer,
}

fn root_children<'a>(doc: &'a Html, fixture: &DigestFixture) -> Option<Vec<ElementRef<'a>>> {
    let structure = &fixture.match_.structure;
    let selector = Selector::parse(&structure.root).ok()?;
    let root = doc.select(&selector).next()?;
    let children = child_elements(root);
    if let Some(min) = structure.min_children {
        if children.len() < min {
            return None;
        }
    }
    Some(children)
}

/// Blocs enfants d'une racine. Pour un `table`, on traverse `thead/tbody/tfoot`
/// (le parseur HTML en insère toujours un) : les blocs sont alors les `tr`.
pub(super) fn child_elements(root: ElementRef<'_>) -> Vec<ElementRef<'_>> {
    let is_table = root.value().name() == "table";
    let mut out = Vec::new();
    for child in root.children().filter_map(ElementRef::wrap) {
        if is_table && matches!(child.value().name(), "thead" | "tbody" | "tfoot") {
            out.extend(child.children().filter_map(ElementRef::wrap));
        } else {
            out.push(child);
        }
    }
    out
}

fn render_zone(zone: &ZoneSpec, children: &[ElementRef<'_>], kind: ZoneKind) -> Option<String> {
    let action = zone.resolved_action();
    if action == ZoneAction::Hide {
        return Some(String::new());
    }
    let presentation = zone.presentation.unwrap_or(ZonePresentation::AsIs);
    let inner = match (kind, presentation) {
        (_, ZonePresentation::Prominent) => render_prominent(zone, children)?,
        (ZoneKind::Body, ZonePresentation::KeyValue) => render_key_value(zone, children)?,
        (_, ZonePresentation::KeyValue) => return None,
        (_, ZonePresentation::AsIs) => render_as_is(zone, children)?,
    };
    Some(wrap_action(action, &inner))
}

fn wrap_action(action: ZoneAction, inner: &str) -> String {
    match action {
        ZoneAction::Hide => String::new(),
        ZoneAction::Show => inner.to_string(),
        ZoneAction::Collapse => {
            format!("<details class=\"rm-digest-collapsed\">\n{inner}</details>\n")
        }
    }
}

fn render_prominent(zone: &ZoneSpec, children: &[ElementRef<'_>]) -> Option<String> {
    if zone.anchors.is_empty() {
        return None;
    }
    let mut title: Option<String> = None;
    let mut amount: Option<String> = None;
    let mut extra = Vec::new();
    for (i, anchor) in zone.anchors.iter().enumerate() {
        let text = anchor_text(children, anchor)?;
        match anchor.role {
            Some(AnchorRole::Title) => title = Some(text),
            Some(AnchorRole::Amount) => amount = Some(text),
            None if i == 0 => title = Some(text),
            None if i == 1 => amount = Some(text),
            None => extra.push(text),
        }
    }
    let title = title?;
    let amount = amount?;
    let mut out = format!(
        "  <h2>{}</h2>\n  <p><strong>{}</strong></p>\n",
        esc_html_pcdata(&title),
        esc_html_pcdata(&amount)
    );
    for line in extra {
        out.push_str("  <p>");
        out.push_str(&esc_html_pcdata(&line));
        out.push_str("</p>\n");
    }
    Some(out)
}

fn render_as_is(zone: &ZoneSpec, children: &[ElementRef<'_>]) -> Option<String> {
    if zone.anchors.is_empty() {
        return None;
    }
    let mut out = String::new();
    for anchor in &zone.anchors {
        let text = anchor_text(children, anchor)?;
        out.push_str("  <p>");
        out.push_str(&esc_html_pcdata(&text));
        out.push_str("</p>\n");
    }
    Some(out)
}

fn render_key_value(zone: &ZoneSpec, children: &[ElementRef<'_>]) -> Option<String> {
    let start_anchor = zone.anchors.first()?;
    let start = find_anchor(children, start_anchor)?;
    let rows_spec = zone.rows.as_ref()?;
    let start_pos = children.iter().position(|el| el.id() == start.id())?;
    let mut rows = Vec::new();
    for el in children.iter().skip(start_pos + 1) {
        if stop_row(*el, rows_spec) {
            break;
        }
        if !element_matches_simple(*el, &rows_spec.selector) {
            continue;
        }
        if let Some(row) = p_row_label_value(*el) {
            rows.push(row);
        }
    }
    if rows.is_empty() {
        return None;
    }
    let heading = zone.details_heading.as_deref().unwrap_or("Détails");
    let mut out = format!("  <h3>{}</h3>\n", esc_html_pcdata(heading));
    out.push_str("  <table>\n    <tbody>\n");
    for (label, value) in rows {
        out.push_str("      <tr><th scope=\"row\">");
        out.push_str(&esc_html_pcdata(&label));
        out.push_str("</th><td>");
        out.push_str(&esc_html_pcdata(&value));
        out.push_str("</td></tr>\n");
    }
    out.push_str("    </tbody>\n  </table>\n");
    Some(out)
}

fn stop_row(el: ElementRef<'_>, rows: &RowSpec) -> bool {
    let Some(stop) = &rows.stop_when else {
        return false;
    };
    element_stops(el, stop)
}

fn element_stops(el: ElementRef<'_>, stop: &StopWhen) -> bool {
    if let Some(tag) = &stop.or_tag {
        if el.value().name() == tag.as_str() {
            return true;
        }
    }
    if let Some(class_needle) = &stop.class_contains {
        if el
            .attr("class")
            .unwrap_or("")
            .contains(class_needle.as_str())
        {
            return true;
        }
    }
    false
}

fn anchor_text(children: &[ElementRef<'_>], anchor: &Anchor) -> Option<String> {
    let el = find_anchor(children, anchor)?;
    let text = collapse_ws(&el.text().collect::<Vec<_>>().join(""));
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn find_anchor<'a>(children: &[ElementRef<'a>], anchor: &Anchor) -> Option<ElementRef<'a>> {
    let index = anchor.index.unwrap_or(0);
    let el = children
        .iter()
        .copied()
        .filter(|el| anchor_matches_shape(*el, anchor))
        .nth(index)?;
    if anchor.text_contains_any.is_empty() || text_matches(el, &anchor.text_contains_any) {
        Some(el)
    } else {
        None
    }
}

fn anchor_matches_shape(el: ElementRef<'_>, anchor: &Anchor) -> bool {
    if let Some(selector) = &anchor.selector {
        if !element_matches_simple(el, selector) {
            return false;
        }
    }
    if let Some(needle) = &anchor.class_contains {
        if !el.attr("class").unwrap_or("").contains(needle.as_str()) {
            return false;
        }
    }
    true
}

fn element_matches_simple(el: ElementRef<'_>, selector: &str) -> bool {
    let mut parts = selector.split('.');
    let Some(tag) = parts.next() else {
        return false;
    };
    if el.value().name() != tag {
        return false;
    }
    match parts.next() {
        None => true,
        Some(class) => el
            .attr("class")
            .unwrap_or("")
            .split_whitespace()
            .any(|token| token == class),
    }
}

fn text_matches(el: ElementRef<'_>, needles: &[String]) -> bool {
    let raw = el.text().collect::<String>();
    let folded = raw.to_lowercase();
    needles
        .iter()
        .any(|needle| folded.contains(&needle.to_lowercase()) || raw.contains(needle.as_str()))
}

fn p_row_label_value(el: ElementRef<'_>) -> Option<(String, String)> {
    let inner = el.inner_html();
    let caps = RE_P_ROW.captures(inner.trim())?;
    let label = collapse_ws(caps.get(1)?.as_str());
    let value_raw = caps.get(2)?.as_str();
    let value = collapse_ws(&RE_STRIP_TAGS.replace_all(value_raw.trim(), ""));
    (!label.is_empty() && !value.is_empty()).then_some((label, value))
}

fn render_article(fixture: &DigestFixture, header: &str, body: &str, footer: &str) -> String {
    let mut out = format!(
        "<!-- rustymail:digest id=\"{}\" -->\n",
        esc_html_pcdata(&fixture.id)
    );
    let mut class = String::from("rm-digest");
    if let Some(legacy) = fixture.legacy_marker.as_deref() {
        out.push_str(&format!("<!-- rustymail:{legacy}-digest -->\n"));
        class.push_str(" rm-");
        class.push_str(legacy);
        class.push_str("-digest");
    }
    out.push_str(&format!(
        "<article class=\"{class}\" data-digest-id=\"{}\">\n",
        esc_html_pcdata(&fixture.id)
    ));
    out.push_str(header);
    out.push_str(body);
    out.push_str(footer);
    out.push_str("</article>\n");
    out
}

fn collapse_ws(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
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
