//! Détection désinscription (List-Unsubscribe + liens HTML).

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json;
use unicode_normalization::UnicodeNormalization;

/// Normalise pour matcher FR/EN malgré accents / entités HTML courantes.
fn fold_unsub_key(raw: &str) -> String {
    let mut s = raw.to_string();
    for (from, to) in [
        ("&eacute;", "e"),
        ("&Eacute;", "e"),
        ("&egrave;", "e"),
        ("&agrave;", "a"),
        ("&nbsp;", " "),
        ("&#160;", " "),
        ("&#39;", "'"),
        ("&rsquo;", "'"),
        ("&lsquo;", "'"),
    ] {
        s = s.replace(from, to);
    }
    s.nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .flat_map(|c| c.to_lowercase())
        .collect::<String>()
}

pub fn list_unsubscribe_header_present(headers: &[(String, String)]) -> bool {
    headers.iter().any(|(name, value)| {
        let n = name.trim().to_ascii_lowercase();
        (n == "list-unsubscribe" || n == "list-unsubscribe-post") && !value.trim().is_empty()
    })
}

pub fn blob_has_unsubscribe_signal(blob: &str) -> bool {
    let blob = fold_unsub_key(blob);
    blob.contains("unsubscribe")
        || blob.contains("opt-out")
        || blob.contains("optout")
        || blob.contains("desinscri")
        || blob.contains("desabon")
        || blob.contains("desinscription")
        || blob.contains("list-unsubscribe")
        || blob.contains("list-manage")
        || blob.contains("subscription center")
        || blob.contains("email preferences")
        || blob.contains("communication preferences")
        || blob.contains("advertising preferences")
        || blob.contains("ne plus recevoir")
        || blob.contains("stop receiving")
        || blob.contains("stop receiv")
        || blob.contains("remove me from")
        || blob.contains("manage preferences")
}

/// Segments de chemin courants pour désinscription (ex. Yuka `/mk/un/v2/…`, Iterable `/s/u/`).
fn url_path_has_unsubscribe_signal(path_and_query: &str) -> bool {
    let p = fold_unsub_key(path_and_query);
    if p.contains("unsubscribe")
        || p.contains("optout")
        || p.contains("opt_out")
        || p.contains("opt-out")
        || p.contains("list-manage")
        || p.contains("list_unsubscribe")
        || p.contains("email-preference")
        || p.contains("preferences/email")
        || p.contains("advertising-preferences")
        || p.contains("manage-subscription")
        || p.contains("subscription-center")
        || p.contains("subscription_center")
    {
        return true;
    }
    // ESP marketing : segments courts (Yuka `/un/`, Iterable one-click `/s/uh/` + `/s/u/`).
    p.contains("/un/")
        || p.contains("/unsub")
        || p.contains("/optout")
        || p.contains("/opt-out")
        || p.contains("/manage-subscription")
        || p.contains("/s/uh/")
        || p.contains("/s/u/")
        || p.contains("/as/unsubscribe")
        || p.contains("/unsubscribe.")
}

fn href_path_and_query(href: &str) -> Option<String> {
    let href_lc = href.trim().to_ascii_lowercase();
    if href_lc.is_empty() {
        return None;
    }
    let parse_target = if href_lc.starts_with("http") {
        href.to_string()
    } else if href_lc.starts_with("mailto:") {
        return None;
    } else {
        format!("https://local.invalid/{href_lc}")
    };
    url::Url::parse(&parse_target).ok().map(|u| {
        format!(
            "{}{}",
            u.path().to_ascii_lowercase(),
            u.query().unwrap_or("")
        )
    })
}

pub fn href_has_unsubscribe_signal(href: &str) -> bool {
    let href_lc = fold_unsub_key(href.trim());
    if href_lc.is_empty() {
        return false;
    }
    if href_lc.contains("unsubscribe")
        || href_lc.contains("opt-out")
        || href_lc.contains("optout")
        || href_lc.contains("preferences/email")
        || href_lc.contains("email-preference")
        || href_lc.contains("list-manage")
        || href_lc.contains("unsubscribe.iterable")
        || href_lc.contains("list-unsubscribe")
    {
        return true;
    }
    // Hosts / mailto ESP dédiés désinscription.
    if href_lc.starts_with("mailto:") {
        if blob_has_unsubscribe_signal(href)
            || href_lc.contains("unsubscribe+")
            || href_lc.contains("unsubscribe@")
            || href_lc.contains("unsub@")
        {
            return true;
        }
    }
    if let Some(path) = href_path_and_query(href) {
        if url_path_has_unsubscribe_signal(&path) {
            return true;
        }
    }
    false
}

/// Heuristique HTML : recherche `href` et texte « désabonner » / unsubscribe.
pub fn html_has_unsubscribe_link(html: &str) -> bool {
    let html_lc = html.to_ascii_lowercase();
    if blob_has_unsubscribe_signal(&html_lc) {
        return true;
    }
    for part in html_lc.split("href=") {
        if part.len() < 2 {
            continue;
        }
        let quote = part.as_bytes()[0];
        if quote != b'"' && quote != b'\'' {
            continue;
        }
        let rest = &part[1..];
        let end = rest
            .find(quote as char as u8 as char)
            .unwrap_or(rest.len().min(500));
        let href = &rest[..end.min(rest.len())];
        if href_has_unsubscribe_signal(href) {
            return true;
        }
    }
    false
}

pub fn message_has_unsubscribe_signal(
    list_unsubscribe: Option<&str>,
    subject: &str,
    plain: &str,
    html: Option<&str>,
) -> bool {
    if list_unsubscribe
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some()
    {
        return true;
    }
    let blob = format!(
        "{} {}",
        subject,
        plain.chars().take(2000).collect::<String>()
    );
    if blob_has_unsubscribe_signal(&blob) {
        return true;
    }
    if let Some(h) = html {
        if html_has_unsubscribe_link(h) {
            return true;
        }
    }
    false
}

/// Score aligné sur le tri UI (`sortUnsubscribeLinks`) : préfère HTTPS actionnable
/// aux `mailto:` et aux redirecteurs `/click` quand les deux sont présents.
pub fn unsubscribe_url_score(href: &str) -> i32 {
    let href = href.trim();
    if href.is_empty() {
        return i32::MIN / 4;
    }
    let low = fold_unsub_key(href);
    let mut score = 0;
    if low.starts_with("https://") || low.starts_with("http://") {
        score += 30;
    }
    if low.starts_with("mailto:") {
        score += 40;
        // Préférer la page web (List-Unsubscribe-Post / préférences) au mailto RFC.
        score -= 30;
    }
    if low.contains("unsubscribe")
        || low.contains("opt-out")
        || low.contains("optout")
        || low.contains("opt_out")
        || low.contains("desinscri")
        || low.contains("desabon")
    {
        score += 80;
    }
    if low.contains("list-unsubscribe")
        || low.contains("list-manage")
        || low.contains("subscription-center")
        || low.contains("email-preference")
        || low.contains("preferences/email")
    {
        score += 25;
    }
    if low.contains("/s/uh/") || low.contains("/s/u/") {
        score += 55;
    }
    if low.contains("unsub.aspx") {
        score += 35;
    }
    if let Some(path) = href_path_and_query(href) {
        if url_path_has_unsubscribe_signal(&path) {
            score += 70;
        }
    }
    if low.contains("/click")
        || low.contains("/redirect")
        || low.contains("/track")
        || low.contains("/open")
    {
        score -= 20;
    }
    if low.contains("utm_") {
        score -= 5;
    }
    score
}

pub fn sort_unsubscribe_urls(urls: &mut [String]) {
    urls.sort_by(|a, b| {
        unsubscribe_url_score(b)
            .cmp(&unsubscribe_url_score(a))
            .then_with(|| a.len().cmp(&b.len()))
    });
}

fn push_unsub_url(
    out: &mut Vec<String>,
    seen: &mut HashSet<String>,
    href: &str,
    limit: usize,
    allow_by_label: bool,
) -> bool {
    if out.len() >= limit {
        return false;
    }
    let href = href.trim();
    if href.is_empty() {
        return out.len() < limit;
    }
    if !allow_by_label && !href_has_unsubscribe_signal(href) {
        return out.len() < limit;
    }
    let low = href.to_ascii_lowercase();
    if allow_by_label
        && !href_has_unsubscribe_signal(href)
        && !low.starts_with("http://")
        && !low.starts_with("https://")
        && !low.starts_with("mailto:")
    {
        return out.len() < limit;
    }
    let norm = href.to_string();
    if seen.insert(norm.clone()) {
        out.push(norm);
    }
    out.len() < limit
}

fn anchor_text_looks_like_unsubscribe(text: &str) -> bool {
    let t = fold_unsub_key(text);
    t.contains("unsubscribe")
        || t.contains("opt-out")
        || t.contains("optout")
        || t.contains("desinscri")
        || t.contains("desabon")
        || t.contains("se desinscrire")
        || t.contains("ne plus recevoir")
        || t.contains("stop receiving")
        || t.contains("email preferences")
        || t.contains("communication preferences")
        || t.contains("advertising preferences")
}

fn anchor_text_weak_unsubscribe_label(text: &str) -> bool {
    let t = fold_unsub_key(text).trim().to_string();
    t == "ici"
        || t == "here"
        || t == "click here"
        || t == "cliquez ici"
        || t == "cliquez"
        || t == "link"
}

fn html_context_before_index(html_lc: &str, index: usize) -> &str {
    let start = index.saturating_sub(420);
    &html_lc[start..index.min(html_lc.len())]
}

/// Extrait des URLs candidates depuis le HTML (href + libellés « Se désabonner » / « ici » en contexte).
pub fn extract_unsubscribe_links_from_html(html: &str, limit: usize) -> Vec<String> {
    if limit == 0 {
        return Vec::new();
    }
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let html_lc = html.to_ascii_lowercase();
    let mut search_from = 0usize;

    while out.len() < limit {
        let Some(rel) = html_lc[search_from..].find("href=") else {
            break;
        };
        let href_key = search_from + rel;
        search_from = href_key + 5;
        let part = &html[href_key + 5..];
        if part.len() < 2 {
            continue;
        }
        let quote = part.as_bytes()[0];
        if quote != b'"' && quote != b'\'' {
            continue;
        }
        let rest = &part[1..];
        let end = rest.find(quote as char).unwrap_or(rest.len().min(1200));
        let href = rest[..end.min(rest.len())].trim();
        if href.is_empty() {
            continue;
        }
        let href_ok = href_has_unsubscribe_signal(href);
        let mut label_ok = false;
        let mut weak_label_with_context = false;
        if let Some(close) = part.to_ascii_lowercase().find("</a>") {
            let after_href = &part[end.min(part.len())..close.min(part.len())];
            label_ok = anchor_text_looks_like_unsubscribe(after_href);
            if !label_ok && anchor_text_weak_unsubscribe_label(after_href) {
                let ctx = html_context_before_index(&html_lc, href_key);
                weak_label_with_context = blob_has_unsubscribe_signal(ctx)
                    || fold_unsub_key(ctx).contains("desinscri")
                    || fold_unsub_key(ctx).contains("desabon")
                    || fold_unsub_key(ctx).contains("ne plus recevoir");
            }
        }
        if href_ok || label_ok || weak_label_with_context {
            let allow_weak = (label_ok && !href_ok) || weak_label_with_context;
            let _ = push_unsub_url(&mut out, &mut seen, href, limit, allow_weak);
        }
    }

    sort_unsubscribe_urls(&mut out);
    out.truncate(limit);
    out
}

/// Parse l’en-tête RFC `List-Unsubscribe` (`<url>`, `<mailto:…>`, …).
pub fn parse_list_unsubscribe_header(raw: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut in_angle = false;
    let mut buf = String::new();
    for c in raw.chars() {
        match c {
            '<' => {
                in_angle = true;
                buf.clear();
            }
            '>' if in_angle => {
                in_angle = false;
                let s = buf.trim();
                if !s.is_empty() && seen.insert(s.to_string()) {
                    out.push(s.to_string());
                }
            }
            c if in_angle => buf.push(c),
            _ => {}
        }
    }
    if out.is_empty() {
        for part in raw.split(',') {
            let s = part
                .trim()
                .trim_matches(|c| c == '<' || c == '>' || c == '"');
            if (s.starts_with("http://") || s.starts_with("https://") || s.starts_with("mailto:"))
                && seen.insert(s.to_string())
            {
                out.push(s.to_string());
            }
        }
    }
    out
}

/// Indexe les URLs de désinscription (en-tête RFC + HTML), puis trie par pertinence UX.
pub fn index_message_unsubscribe_urls(
    list_unsubscribe: Option<&str>,
    subject: &str,
    plain: &str,
    html: Option<&str>,
    limit: usize,
) -> (Option<String>, String) {
    let limit = limit.max(1).min(32);
    let mut urls = Vec::new();
    let mut seen = HashSet::new();
    let raw = list_unsubscribe
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    if let Some(ref r) = raw {
        for u in parse_list_unsubscribe_header(r) {
            if urls.len() >= limit {
                break;
            }
            if seen.insert(u.clone()) {
                urls.push(u);
            }
        }
    }
    if let Some(h) = html.filter(|s| !s.trim().is_empty()) {
        for u in extract_unsubscribe_links_from_html(h, limit) {
            if seen.insert(u.clone()) {
                urls.push(u);
            }
        }
    }
    sort_unsubscribe_urls(&mut urls);
    urls.truncate(limit);
    let _ = (subject, plain);
    let json = serde_json::to_string(&urls).unwrap_or_else(|_| "[]".to_string());
    (raw, json)
}

pub fn parse_and_sort_unsubscribe_urls_json(raw: Option<&str>) -> Vec<String> {
    let mut urls = parse_unsubscribe_urls_json(raw);
    sort_unsubscribe_urls(&mut urls);
    urls
}

pub fn parse_unsubscribe_urls_json(raw: Option<&str>) -> Vec<String> {
    let Some(s) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Vec::new();
    };
    serde_json::from_str(s).unwrap_or_default()
}

/// Backfill one-shot : indexe `unsubscribe_urls` pour les messages déjà en cache.
pub fn migrate_message_unsubscribe_urls(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
    )?;
    let already: bool = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'message_unsubscribe_urls_v1'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()?
        .as_deref()
        == Some("1");
    if already {
        return Ok(());
    }

    let mut stmt = conn.prepare(
        "SELECT id, list_unsubscribe, COALESCE(body_plain, body), body_html, subject
         FROM messages
         WHERE COALESCE(unsubscribe_urls, '') IN ('', '[]')",
    )?;
    let rows: Vec<(String, Option<String>, String, Option<String>, String)> = stmt
        .query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    for (id, list_unsub, plain, html, subject) in rows {
        let (raw, json) = index_message_unsubscribe_urls(
            list_unsub.as_deref(),
            &subject,
            &plain,
            html.as_deref(),
            8,
        );
        conn.execute(
            "UPDATE messages SET list_unsubscribe = ?1, unsubscribe_urls = ?2 WHERE id = ?3",
            params![raw, json, id],
        )?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('message_unsubscribe_urls_v1', '1')",
        [],
    )?;
    Ok(())
}

/// Re-trie (et ré-indexe si besoin) les URLs déjà stockées — corrige l’ordre mailto avant HTTPS.
pub fn migrate_resort_unsubscribe_urls(conn: &Connection) -> Result<(), rusqlite::Error> {
    let already: bool = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'message_unsubscribe_urls_v2'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()?
        .as_deref()
        == Some("1");
    if already {
        return Ok(());
    }

    let mut stmt = conn.prepare(
        "SELECT id, list_unsubscribe, COALESCE(body_plain, body), body_html, subject, unsubscribe_urls
         FROM messages",
    )?;
    let rows: Vec<(
        String,
        Option<String>,
        String,
        Option<String>,
        String,
        String,
    )> = stmt
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    for (id, list_unsub, plain, html, subject, prev_json) in rows {
        let prev = parse_unsubscribe_urls_json(Some(&prev_json));
        let (raw, json) = if prev.is_empty() {
            index_message_unsubscribe_urls(
                list_unsub.as_deref(),
                &subject,
                &plain,
                html.as_deref(),
                8,
            )
        } else {
            let mut urls = prev;
            if let Some(h) = html.as_deref().filter(|s| !s.trim().is_empty()) {
                let mut seen: HashSet<String> = urls.iter().cloned().collect();
                for u in extract_unsubscribe_links_from_html(h, 8) {
                    if seen.insert(u.clone()) {
                        urls.push(u);
                    }
                }
            }
            sort_unsubscribe_urls(&mut urls);
            urls.truncate(8);
            let raw = list_unsub
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            let json = serde_json::to_string(&urls).unwrap_or_else(|_| "[]".to_string());
            (raw, json)
        };
        conn.execute(
            "UPDATE messages SET list_unsubscribe = COALESCE(?1, list_unsubscribe), unsubscribe_urls = ?2 WHERE id = ?3",
            params![raw, json, id],
        )?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('message_unsubscribe_urls_v2', '1')",
        [],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_list_unsubscribe_angle_brackets() {
        let raw = "<https://news.example/unsub>, <mailto:unsub@example.com>";
        let urls = parse_list_unsubscribe_header(raw);
        assert_eq!(urls.len(), 2);
        assert!(urls[0].starts_with("https://"));
        assert!(urls[1].starts_with("mailto:"));
    }

    #[test]
    fn index_merges_header_and_html_then_sorts() {
        let html = r#"<a href="https://e.email.example/click?dest=preferences_unsubscribe">Se désabonner</a>"#;
        let (_, json) = index_message_unsubscribe_urls(
            Some("<mailto:unsubscribe@email.example.com?subject=Unsubscribe>"),
            "Sale",
            "",
            Some(html),
            4,
        );
        let urls: Vec<String> = serde_json::from_str(&json).unwrap();
        assert_eq!(urls.len(), 2);
        assert!(
            urls[0].starts_with("https://"),
            "expected https first, got {}",
            urls[0]
        );
        assert!(urls[1].starts_with("mailto:"));
    }

    #[test]
    fn extract_unsub_from_click_tracker_with_french_label() {
        let html = r#"<a href="https://e.email.example/click?payload=epicStore_unsubscribe">Se désabonner</a>"#;
        let urls = extract_unsubscribe_links_from_html(html, 4);
        assert_eq!(urls.len(), 1);
        assert!(urls[0].contains("/click"));
    }

    #[test]
    fn sort_puts_https_unsub_before_mailto() {
        let mut urls = vec![
            "mailto:unsubscribe@example.com?subject=Unsubscribe".into(),
            "https://preferences.example.com/epicStore_unsubscribe".into(),
        ];
        sort_unsubscribe_urls(&mut urls);
        assert!(urls[0].starts_with("https://"));
    }

    #[test]
    fn detects_yuka_style_unsubscribe_path() {
        let href =
            "https://r.jc.yuka.io/mk/un/v2/sh/8qykxLwJZEwZdw3eTSjNnEgtouuIn5jeZhB/qXtadGCwHyW4";
        assert!(href_has_unsubscribe_signal(href));
    }

    #[test]
    fn sort_yuka_https_before_mailto() {
        let mut urls = vec![
            "mailto:unsubscribe@jc.yuka.io?subject=unsub-abc&body=abc".into(),
            "https://r.jc.yuka.io/mk/un/v2/sh/token".into(),
        ];
        sort_unsubscribe_urls(&mut urls);
        assert!(urls[0].starts_with("https://"));
    }

    #[test]
    fn extract_yuka_ici_link_with_context() {
        let html = r#"Pour vous désinscrire, cliquez <a href="https://r.jc.yuka.io/mk/un/v2/sh/abc">ici</a>."#;
        let urls = extract_unsubscribe_links_from_html(html, 4);
        assert_eq!(urls.len(), 1);
        assert!(urls[0].contains("yuka.io"));
    }

    #[test]
    fn detects_list_unsubscribe_header() {
        let h = vec![(
            "List-Unsubscribe".to_string(),
            "<mailto:unsub@example.com>".to_string(),
        )];
        assert!(list_unsubscribe_header_present(&h));
    }

    #[test]
    fn detects_html_unsub() {
        let html = r#"<a href="https://x.com/unsubscribe">Se désinscrire</a>"#;
        assert!(html_has_unsubscribe_link(html));
    }

    #[test]
    fn fold_matches_accented_french_label() {
        assert!(blob_has_unsubscribe_signal("Se désinscrire"));
        assert!(blob_has_unsubscribe_signal("se d&eacute;sinscrire"));
        assert!(anchor_text_looks_like_unsubscribe("Se désabonner"));
    }

    #[test]
    fn detects_iterable_style_paths() {
        assert!(href_has_unsubscribe_signal(
            "https://links.iterable.com/s/uh/Iw35cOOggG1OP4Ad/25"
        ));
        assert!(href_has_unsubscribe_signal(
            "http://links.swissborg.com/s/u/BSbrFspXkijdqVtJ1EDyO/25"
        ));
        assert!(href_has_unsubscribe_signal(
            "mailto:unsubscribe+20208333+26673752@unsubscribe.iterable.com"
        ));
    }

    #[test]
    fn extract_accented_desinscrire_with_iterable_path() {
        let html = r#"Si vous ne souhaitez plus recevoir d'e-mails, cliquez sur se <a href="http://links.swissborg.com/s/u/BSbrFspX/25">désinscrire</a>."#;
        let urls = extract_unsubscribe_links_from_html(html, 4);
        assert_eq!(urls.len(), 1, "{urls:?}");
        assert!(urls[0].contains("/s/u/"));
    }

    #[test]
    fn extract_cliquez_ici_after_ne_plus_recevoir() {
        let html = r#"Pour ne plus recevoir nos emails promotionnels, <a href="https://trk.aliexpress.com/unsub?x=1">Cliquez ici</a>."#;
        let urls = extract_unsubscribe_links_from_html(html, 4);
        assert_eq!(urls.len(), 1, "{urls:?}");
    }

    #[test]
    fn bare_account_preferences_path_is_not_unsub() {
        assert!(!href_has_unsubscribe_signal(
            "https://shop.example.com/account/preferences"
        ));
        assert!(!href_has_unsubscribe_signal(
            "https://shop.example.com/product/subscription-box"
        ));
    }
}
