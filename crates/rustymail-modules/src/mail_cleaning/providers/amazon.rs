use std::collections::HashSet;
use std::ops::Deref;
use std::sync::LazyLock;

use ego_tree::NodeId;
use regex::Regex;
use scraper::{ElementRef, Html, Selector};

use crate::mail_cleaning::{
    error::CleanError,
    traits::{ProviderCleaner, ProviderDetector},
    types::{CleaningInput, DetectionConfidence, ProviderId},
};

pub const AMAZON_RULE_SET_VERSION: &str = "9";

static RE_EUR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)[\d][\d\u{202f}\x{00a0} \,.]*(?:(?:€|\u20ac)|EUR\b)")
        .expect("EUR price regex should compile")
});

static RE_ORDER_ID: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(\d{3}-\d{7}-\d{7})\b").expect("order id"));
static RE_HTML_TAGS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?si)<[^>]+>").expect("strip html tags"));

const FOOTER_KEYWORDS: &[&str] = &[
    "conditions of use",
    "privacy notice",
    "interest-based ads",
    "preference",
    "conditions générales",
    "confidentialité",
    "vie privée",
    "vos informations personnelles",
    "©",
];

const NAV_KEYWORDS: &[&str] = &[
    "today's deals",
    "gift cards",
    "registry",
    "your account",
    "your orders",
    "shopping basket",
    "shopping cart",
    "basket",
    "sell on amazon",
    "meilleures ventes",
    "votre compte",
];

pub struct AmazonDetector;

impl ProviderDetector for AmazonDetector {
    fn detect(&self, ctx: &CleaningInput<'_>) -> DetectionConfidence {
        if domain_amazon_related(ctx.sender_email) {
            return DetectionConfidence::Strong;
        }
        if ctx.html_preview.map(html_suggests_amazon).unwrap_or(false) {
            return DetectionConfidence::Weak;
        }
        if subject_suggests_amazon(ctx.subject) {
            return DetectionConfidence::Weak;
        }
        DetectionConfidence::None
    }
}

pub struct AmazonCleaner;

impl ProviderCleaner for AmazonCleaner {
    fn clean(&self, html: &str, ctx: &CleaningInput<'_>) -> Result<String, CleanError> {
        Ok(amazon_html_clean(html, ctx))
    }

    fn rule_set_version(&self) -> &'static str {
        AMAZON_RULE_SET_VERSION
    }

    fn provider_id(&self) -> ProviderId {
        ProviderId::Amazon
    }
}

/// Strip nav / legal-heavy tables — used when semantic digest does not apply.
pub fn amazon_html_clean(html: &str, ctx: &CleaningInput<'_>) -> String {
    if let Some(order) = try_amazon_order_digest(html, ctx) {
        return order;
    }
    if let Some(summary) = try_amazon_product_grid_digest(html) {
        return summary;
    }
    amazon_strip_nav_and_footer_tables(html)
}

#[derive(Debug)]
struct AmazonOrderDigest {
    pickup: Option<String>,
    /// Créneau / arrivée (mails suivi colis), ex. « Arrive aujourd'hui… » — pas les anciens libellés « Livraison prévue » seuls.
    delivery_window: Option<String>,
    order_id: String,
    order_url: String,
    tracking_url: Option<String>,
    items: Vec<(String, String, String)>,
    total: Option<String>,
}

fn normalize_amazon_qp(blob: &str) -> String {
    blob.replace("=\r\n", "")
        .replace("=\n", "")
        .replace("=3D", "=")
        .replace('\r', "")
}

fn amazon_order_context(ctx: &CleaningInput<'_>, plain: Option<&str>, html: &str) -> bool {
    let oid_plain = plain.map(|p| RE_ORDER_ID.is_match(p)).unwrap_or(false);
    let oid_html = RE_ORDER_ID.is_match(html);
    if !oid_plain && !oid_html {
        return false;
    }
    let snd = ctx.sender_email.to_ascii_lowercase();
    let has_ack_plain = plain
        .map(|p| {
            p.contains("Merci pour votre commande")
                || p.contains("Thank you for your order")
                || p.contains("Consulter ou modifier cette commande")
        })
        .unwrap_or(false);
    let html_lc = html.to_ascii_lowercase();
    let has_ack_html = html_lc.contains("/your-orders/order-details")
        || html_lc.contains("modifier%20cette%20commande");
    let has_shipment_plain = plain
        .map(|p| p.contains("Votre colis est en cours de livraison"))
        .unwrap_or(false);
    let has_shipment_html = html_lc.contains("progress-tracker/package")
        || html_lc.contains("progress-tracker%2fpackage");
    snd.contains("confirmation-commande")
        || snd.contains("shipment-tracking")
        || has_ack_plain
        || has_ack_html
        || (has_shipment_plain && oid_plain)
        || (has_shipment_html && oid_html)
}

fn extract_order_detail_url(blob: &str) -> Option<String> {
    let re = Regex::new(
        r#"https://www\.amazon\.(?:fr|com|co\.uk|de|es|it)/your-orders/order-details[^)\s\]>"]+"#,
    )
    .ok()?;
    re.find(blob)
        .map(|m| sanitize_trailing_url_noise(m.as_str().trim().trim_end_matches('=').to_string()))
}

fn extract_progress_tracker_url(blob: &str) -> Option<String> {
    let re = Regex::new(
        r#"https://www\.amazon\.(?:fr|com|co\.uk|de|es|it)/progress-tracker/package[^)\s\]>"]+"#,
    )
    .ok()?;
    re.find(blob)
        .map(|m| sanitize_trailing_url_noise(m.as_str().trim().trim_end_matches('=').to_string()))
}

fn sanitize_trailing_url_noise(mut s: String) -> String {
    while s.ends_with('&') || s.ends_with('?') {
        s.pop();
    }
    s
}

fn default_fr_order_url(order_id: &str) -> String {
    format!(
        "https://www.amazon.fr/your-orders/order-details?orderID={}&ref_=rm_clean",
        esc_url_path_component(order_id)
    )
}

fn esc_url_path_component(s: &str) -> String {
    s.trim().to_string()
}

fn html_blob_as_plain(html: &str) -> String {
    let spaced = RE_HTML_TAGS.replace_all(html, "\n");
    normalize_amazon_qp(&spaced)
}

/// Avoid treating the créneau line (« … tranche horaire … » / « Arrive aujourd… ») as point de retrait.
fn line_looks_like_amazon_schedule_blurb(l: &str) -> bool {
    let low = l.to_ascii_lowercase();
    low.contains("tranche horaire")
        || low.starts_with("arrive aujourd")
        || low.starts_with("arrive demain")
}

fn try_amazon_order_digest(html: &str, ctx: &CleaningInput<'_>) -> Option<String> {
    let plain_norm = ctx.plain_body.map(|p| normalize_amazon_qp(p));
    let html_fallback = html_blob_as_plain(html);
    if !amazon_order_context(ctx, plain_norm.as_deref(), html) {
        return None;
    }

    let primary = plain_norm.as_deref();
    if let Some(blob) = primary {
        if let Some(o) = parse_amazon_ack_lines(blob) {
            return Some(build_order_digest_document(&o));
        }
    }
    if let Some(o) = parse_amazon_ack_lines(&html_fallback) {
        return Some(build_order_digest_document(&o));
    }
    None
}

fn parse_amazon_ack_lines(blob: &str) -> Option<AmazonOrderDigest> {
    let lines: Vec<String> = blob.lines().map(|l| l.trim().to_owned()).collect();
    if lines.iter().filter(|l| !l.is_empty()).count() < 4 {
        return None;
    }

    let order_id = RE_ORDER_ID
        .find(blob)
        .map(|m| m.as_str().to_string())
        .or_else(|| {
            Regex::new(r"(?i)orderid=.*?(\d{3}-\d{7}-\d{7})")
                .ok()
                .and_then(|re| {
                    re.captures(blob)
                        .and_then(|c| c.get(1).map(|g| g.as_str().to_string()))
                })
        })?;

    let order_url =
        extract_order_detail_url(blob).unwrap_or_else(|| default_fr_order_url(&order_id));
    let tracking_url = extract_progress_tracker_url(blob);

    let liv_ix = lines.iter().position(|l| {
        l.contains("Livraison prévue")
            || l.to_lowercase().contains("estimated delivery")
            || l.contains("livraison estimée")
    });

    let pickup = liv_ix.and_then(|i| {
        lines
            .get(i + 1)
            .filter(|l| {
                l.contains(" - ")
                    && !RE_ORDER_ID.is_match(l)
                    && !line_looks_like_amazon_schedule_blurb(l)
            })
            .cloned()
    });

    let n_order_heading = lines.iter().position(|l| {
        let lc = l.to_ascii_lowercase();
        lc.contains("n° ") || lc.contains("numéro de commande") || RE_ORDER_ID.is_match(l)
    });

    let mut pickup_out = pickup;
    if pickup_out.is_none() {
        pickup_out = n_order_heading.and_then(|n| {
            lines[..n]
                .iter()
                .rev()
                .find(|l| {
                    !l.is_empty()
                        && l.contains(" - ")
                        && !RE_ORDER_ID.is_match(l)
                        && !line_looks_like_amazon_schedule_blurb(l)
                })
                .cloned()
        });
    }

    let delivery_window = lines
        .iter()
        .find(|l| line_looks_like_amazon_schedule_blurb(l))
        .cloned()
        .filter(|s| !s.is_empty());

    let mut items: Vec<(String, String, String)> = Vec::new();
    let url_line_ix = lines.iter().position(|l| {
        l.contains("/your-orders/order-details") || l.contains("progress-tracker/package")
    });
    let scan_from = url_line_ix.map(|i| i.saturating_add(1)).unwrap_or(0usize);
    let mut i = scan_from;

    while i < lines.len() {
        let line = &lines[i];
        let bullet = line
            .strip_prefix("* ")
            .or_else(|| line.strip_prefix("• "))
            .map(|rest| rest.trim().to_string());
        if let Some(title) = bullet {
            let mut next_i = i + 1;
            let mut qty_txt = String::from("—");
            let mut price_txt = String::from("—");

            if next_i < lines.len() {
                let nl = lines[next_i].to_ascii_lowercase();
                if nl.contains("quantité")
                    || nl.contains("quantity:")
                    || nl.contains("qty")
                    || nl.contains("quantity ")
                {
                    qty_txt = lines[next_i].clone();
                    next_i += 1;
                }
            }
            if next_i < lines.len() && RE_EUR.is_match(&lines[next_i]) {
                price_txt = lines[next_i].clone();
                next_i += 1;
            }

            items.push((title, qty_txt, price_txt));
            i = next_i;
            continue;
        }
        i += 1;
    }

    let total_from_line = lines
        .iter()
        .position(|l| l.eq_ignore_ascii_case("total"))
        .and_then(|ix| lines.get(ix + 1).cloned())
        .filter(|l| RE_EUR.is_match(l));

    items.retain(|it| !(it.0.eq_ignore_ascii_case("total")));

    Some(AmazonOrderDigest {
        pickup: pickup_out,
        delivery_window,
        order_id,
        order_url,
        tracking_url,
        items,
        total: total_from_line,
    })
    .filter(|d| !d.order_id.is_empty())
}

fn build_order_digest_document(o: &AmazonOrderDigest) -> String {
    let mut s = String::from("<!-- rustymail:amazon-digest -->\n");
    s.push_str("<article class=\"rm-amazon-digest\">\n");

    s.push_str("<table>\n<tbody>\n");
    if let Some(w) = &o.delivery_window {
        s.push_str("<tr><th scope=\"row\">Créneau</th><td>");
        s.push_str(&esc_html_pcdata(w));
        s.push_str("</td></tr>\n");
    }
    if let Some(pu) = &o.pickup {
        s.push_str("<tr><th scope=\"row\">Point de retrait / lieu</th><td>");
        s.push_str(&esc_html_pcdata(pu));
        s.push_str("</td></tr>\n");
    }
    s.push_str("<tr><th scope=\"row\">Réf. commande</th><td><code>");
    s.push_str(&esc_html_pcdata(&o.order_id));
    s.push_str("</code></td></tr>\n");
    s.push_str(&format!(
        "<tr><th scope=\"row\">Commande</th><td><a href=\"{}\" rel=\"noopener noreferrer\" target=\"_blank\">Voir ou modifier cette commande</a></td></tr>\n",
        esc_html_attr(&o.order_url)
    ));
    if let Some(tu) = &o.tracking_url {
        s.push_str(&format!(
            "<tr><th scope=\"row\">Suivi colis</th><td><a href=\"{}\" rel=\"noopener noreferrer\" target=\"_blank\">Voir le suivi</a></td></tr>\n",
            esc_html_attr(tu)
        ));
    }
    s.push_str("</tbody>\n</table>\n");

    if !o.items.is_empty() {
        s.push_str("<table>\n<thead>\n<tr><th scope=\"col\">Article</th><th scope=\"col\">Quantité</th><th scope=\"col\">Prix</th></tr>\n</thead>\n<tbody>\n");
        for (title, qty, price) in &o.items {
            s.push_str("<tr><td>");
            s.push_str(&esc_html_pcdata(title));
            s.push_str("</td><td>");
            if qty.is_empty() {
                s.push_str("—");
            } else {
                s.push_str(&esc_html_pcdata(qty));
            }
            s.push_str("</td><td>");
            s.push_str(&esc_html_pcdata(price));
            s.push_str("</td></tr>\n");
        }
        s.push_str("</tbody>\n</table>\n");
    }

    if let Some(t) = &o.total {
        s.push_str("<table>\n<tbody>\n");
        s.push_str("<tr><th scope=\"row\">Total</th><td>");
        s.push_str(&esc_html_pcdata(t));
        s.push_str("</td></tr>\n</tbody>\n</table>\n");
    }

    s.push_str("</article>\n");
    s
}

/// Marketing grids with `asin-container`; émet tableaux + liens désabonnement (sans cartes HTML).
fn try_amazon_product_grid_digest(html: &str) -> Option<String> {
    let doc = Html::parse_fragment(html);
    let sel = Selector::parse("table.asin-container").ok()?;
    let cards: Vec<_> = doc.select(&sel).collect();
    if cards.is_empty() {
        return None;
    }

    let unsub = filter_unsubscribe_only(collect_preferences_links(&doc));
    let unsub = if unsub.is_empty() {
        filter_unsubscribe_only(collect_preferences_fallback(&doc))
    } else {
        unsub
    };

    let mut rows = Vec::new();
    for card in cards {
        if let Some(row) = product_row_from_card(card) {
            rows.push(row);
        }
    }
    if rows.is_empty() {
        return None;
    }

    Some(build_digest_document(&unsub, &rows))
}

/// Keep only unsubscribe actions (drops “Mettre à jour vos préférences”, etc.).
fn filter_unsubscribe_only(links: Vec<(String, String)>) -> Vec<(String, String)> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (href, label) in links {
        if !is_unsubscribe_entry(&label, &href) {
            continue;
        }
        if seen.insert(href.clone()) {
            out.push((href, LINK_LABEL_UNSUB_FIX.to_string()));
        }
    }
    out
}

const LINK_LABEL_UNSUB_FIX: &str = "Se désinscrire";

fn is_unsubscribe_entry(label: &str, href: &str) -> bool {
    let href_lc = href.to_ascii_lowercase();
    if href_lc.starts_with("mailto:") {
        let l = label.to_ascii_lowercase();
        return l.contains("unsub")
            || l.contains("désinscr")
            || l.contains("opt out")
            || l.trim().is_empty();
    }
    let l = label.to_ascii_lowercase();
    let looks_prefs_only = (l.contains("préférence")
        || l.contains("preference")
        || l.contains("mettre à jour")
        || l.contains("update your"))
        && !l.contains("désinscr")
        && !l.contains("désabo")
        && !l.contains("unsub");
    if looks_prefs_only {
        return false;
    }
    if l.contains("désinscr") || l.contains("désabo") || l.contains("unsubscrib") {
        return true;
    }
    if l.contains("opt out") || l.contains("opt-out") || l.contains("optout") {
        return true;
    }
    contains_unsubscribe_path(href)
}

fn collect_preferences_links(doc: &Html) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut seen_href = HashSet::new();

    let sel_footer = Selector::parse("table.footer-card a[href]").ok();
    let sel_extra = Selector::parse("table[data-sonar-role='footer'] a[href]").ok();

    fn push_filtered(
        out: &mut Vec<(String, String)>,
        seen: &mut HashSet<String>,
        href: String,
        label: String,
    ) {
        if href.is_empty() || seen.contains(&href) {
            return;
        }
        if prefs_or_unsubscribe_label(&label)
            || href.to_ascii_lowercase().starts_with("mailto:")
            || contains_unsubscribe_path(&href)
        {
            seen.insert(href.clone());
            let label = normalize_ws(label);
            let label_show = if label.is_empty() {
                summarize_href_label(&href)
            } else {
                label
            };
            out.push((href, label_show));
        }
    }

    if let Some(sel) = sel_footer {
        for a in doc.select(&sel) {
            if let Some(h) = a.attr("href").map(trim_href_wbr) {
                let label = a.text().collect::<String>();
                push_filtered(&mut out, &mut seen_href, h.to_string(), label);
            }
        }
    }

    if out.is_empty() {
        if let Some(sel) = sel_extra {
            for a in doc.select(&sel) {
                if let Some(h) = a.attr("href").map(trim_href_wbr) {
                    let label = a.text().collect::<String>();
                    push_filtered(&mut out, &mut seen_href, h.to_string(), label);
                }
            }
        }
    }

    out
}

fn collect_preferences_fallback(doc: &Html) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let Ok(sel) = Selector::parse("a[href]") else {
        return out;
    };
    for a in doc.select(&sel) {
        let Some(h) = a.attr("href").map(trim_href_wbr) else {
            continue;
        };
        let label = a.text().collect::<String>();
        if prefs_or_unsubscribe_label(&label)
            || h.to_ascii_lowercase().starts_with("mailto:")
            || contains_unsubscribe_path(&h)
        {
            if seen.insert(h.to_string()) {
                let label = normalize_ws(label);
                let label_show = if label.is_empty() {
                    summarize_href_label(&h)
                } else {
                    label
                };
                out.push((h.to_string(), label_show));
            }
        }
    }
    out
}

fn prefs_or_unsubscribe_label(label: &str) -> bool {
    let lc = label.to_ascii_lowercase();
    lc.contains("désinscr")
        || lc.contains("désabo")
        || lc.contains("unsub")
        || lc.contains("préférence")
        || lc.contains("preference")
        || lc.contains("préférences")
        || lc.contains("preferences")
        || lc.contains("mettre à jour")
        || lc.contains("update your")
}

fn contains_unsubscribe_path(href: &str) -> bool {
    let lc = href.to_ascii_lowercase();
    lc.contains("/gp/gss/o/") || lc.contains("list-manage.com") || lc.contains("optout")
}

fn trim_href_wbr(h: &str) -> &str {
    h.trim().trim_matches(|c| c == '<' || c == '>')
}

fn summarize_href_label(href: &str) -> String {
    if href.to_ascii_lowercase().starts_with("mailto:") {
        return "Se désinscrire (courriel)".to_string();
    }
    if href.contains("/gp/gss/o/") {
        return "Gérer les notifications".to_string();
    }
    "Lien de préférences / désabonnement".to_string()
}

fn normalize_ws(s: String) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn product_row_from_card(card: ElementRef<'_>) -> Option<(String, String, String, String)> {
    let a_sel = Selector::parse("a[href]").ok()?;
    let img_sel = Selector::parse("img").ok()?;
    let pick_link = card
        .select(&a_sel)
        .find(|a| a.select(&img_sel).next().is_some())?;

    let href = pick_link.attr("href")?.to_string();
    let img = pick_link.select(&img_sel).next().and_then(|im| {
        let src = im.attr("src")?.to_string();
        let alt = im.attr("alt").unwrap_or("").to_string();
        Some((src, alt))
    })?;

    let (img_src, description) = img;
    let flat = element_text_collect(card);
    let price = last_euro_snippet(&flat).unwrap_or_else(|| "—".to_string());

    Some((href, img_src, description, price))
}

fn last_euro_snippet(text: &str) -> Option<String> {
    RE_EUR
        .find_iter(text)
        .map(|m| m.as_str().trim().to_string())
        .last()
}

fn build_digest_document(
    unsub: &[(String, String)],
    rows: &[(String, String, String, String)],
) -> String {
    let mut s = String::new();
    s.push_str("<!-- rustymail:amazon-digest -->\n");
    s.push_str("<article class=\"rm-amazon-digest\">\n");
    s.push_str("<h3>Désabonnement</h3>\n");
    if unsub.is_empty() {
        s.push_str(
            "<p><em>Aucun lien «&#160;Se désinscrire&#160;» repéré dans le HTML. Pensez aussi à l’en-tête <code>List-Unsubscribe</code> du message brut.</em></p>\n",
        );
    } else {
        s.push_str("<table><tbody>\n");
        for (href, label) in unsub {
            let link_text = if label.trim().is_empty() {
                "Se désinscrire"
            } else {
                label.as_str()
            };
            s.push_str(&format!(
                "<tr><td><a href=\"{}\" rel=\"noopener noreferrer\" target=\"_blank\">{}</a></td></tr>\n",
                esc_html_attr(href),
                esc_html_pcdata(link_text)
            ));
        }
        s.push_str("</tbody></table>\n");
    }
    s.push_str("<h2>Recommandations</h2>\n");
    s.push_str("<table>\n<thead>\n<tr><th scope=\"col\">Produit</th><th scope=\"col\">Prix</th><th scope=\"col\">Lien</th></tr>\n</thead>\n<tbody>\n");
    for (href, _img_src, desc, price) in rows {
        s.push_str(&format!(
            "<tr><td>{}</td><td>{}</td><td><a href=\"{}\" rel=\"noopener noreferrer\" target=\"_blank\">Voir sur Amazon.fr</a></td></tr>\n",
            esc_html_pcdata(desc),
            esc_html_pcdata(price),
            esc_html_attr(href)
        ));
    }
    s.push_str("</tbody>\n</table>\n</article>\n");
    s
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

fn esc_html_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('\"', "&quot;")
        .replace('<', "&lt;")
}

pub fn amazon_strip_nav_and_footer_tables(html: &str) -> String {
    let mut doc = Html::parse_fragment(html);
    if let Ok(table_sel) = Selector::parse("table") {
        let candidates: Vec<_> = doc.select(&table_sel).collect();
        let mut ids: Vec<NodeId> = Vec::new();
        for table in candidates {
            let txt = element_text_collect(table);
            let lc = txt.to_ascii_lowercase();
            if lc.len() < 160 {
                continue;
            }
            if footer_hit_count(&lc) >= 2 {
                ids.push(table.deref().id());
                continue;
            }
            if lc.len() < 800 && lc.contains("amazon.") && nav_hit_count(&lc) >= 2 {
                ids.push(table.deref().id());
            }
        }
        for id in ids {
            if let Some(mut n) = doc.tree.get_mut(id) {
                let _ = n.detach();
            }
        }
    }
    doc.html()
}

fn element_text_collect(el: ElementRef<'_>) -> String {
    el.text().collect::<Vec<_>>().join(" ")
}

fn footer_hit_count(lc: &str) -> usize {
    FOOTER_KEYWORDS.iter().filter(|k| lc.contains(*k)).count()
}

fn nav_hit_count(lc: &str) -> usize {
    NAV_KEYWORDS.iter().filter(|k| lc.contains(*k)).count()
}

fn domain_amazon_related(email: &str) -> bool {
    let Some(domain) = email.rsplit_once('@').map(|(_, d)| d.trim()) else {
        return false;
    };
    let domain = domain.trim_end_matches('.').to_ascii_lowercase();
    domain.split('.').any(|seg| seg == "amazon")
}

fn html_suggests_amazon(html: &str) -> bool {
    let sample: String = html
        .chars()
        .take(48_000)
        .collect::<String>()
        .to_ascii_lowercase();
    sample.contains("amazon.")
}

fn subject_suggests_amazon(subject: &str) -> bool {
    let s = subject.to_ascii_lowercase();
    s.contains("amazon") || s.contains("prime day")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detector_strong_on_amazon_domain() {
        let d = AmazonDetector;
        let ctx = CleaningInput {
            sender_email: "orders@email.amazon.co.uk",
            subject: "Shipped",
            html_preview: None,
            plain_body: None,
        };
        assert_eq!(d.detect(&ctx), DetectionConfidence::Strong);
    }

    #[test]
    fn detector_weak_on_html_link() {
        let d = AmazonDetector;
        let ctx = CleaningInput {
            sender_email: "someone@example.com",
            subject: "Your order",
            html_preview: Some(r#"<a href="https://www.amazon.fr/gp/css/homepage">x</a>"#),
            plain_body: None,
        };
        assert_eq!(d.detect(&ctx), DetectionConfidence::Weak);
    }
}
