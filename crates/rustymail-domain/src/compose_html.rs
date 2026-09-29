//! Corps TipTap stocké dans `Draft.markdown_body`.
//!
//! Le préfixe `<!--rustymail-html-->` distingue un fragment HTML d’e-mail
//! d’un brouillon Markdown historique. L’aperçu et l’envoi ne repassent pas
//! ce fragment dans pulldown-cmark.

pub const COMPOSE_HTML_MARK: &str = "<!--rustymail-html-->";

pub fn compose_body_is_html(body: &str) -> bool {
    body.trim_start().starts_with(COMPOSE_HTML_MARK)
}

pub fn compose_html_fragment(body: &str) -> &str {
    let trimmed = body.trim_start();
    trimmed[COMPOSE_HTML_MARK.len()..].trim_start()
}

pub fn compose_body_plain(body: &str) -> String {
    if compose_body_is_html(body) {
        compose_html_to_plain(body)
    } else {
        body.to_string()
    }
}

pub fn sanitize_compose_html(fragment: &str) -> String {
    let without_blocks = strip_blocked_elements(fragment);
    rewrite_tags(&without_blocks)
}

pub fn compose_html_to_plain(body: &str) -> String {
    let fragment = if compose_body_is_html(body) {
        compose_html_fragment(body)
    } else {
        body
    };
    plain_from_html(&sanitize_compose_html(fragment))
}

fn strip_blocked_elements(input: &str) -> String {
    const BLOCKED: &[&str] = &[
        "script", "style", "iframe", "object", "embed", "link", "meta", "base", "form", "svg",
        "math",
    ];
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while !rest.is_empty() {
        let lower = rest.to_ascii_lowercase();
        let mut found: Option<(usize, &'static str)> = None;
        for tag in BLOCKED {
            let needle = format!("<{tag}");
            if let Some(index) = lower.find(&needle) {
                let boundary = lower[index + needle.len()..]
                    .chars()
                    .next()
                    .map(|ch| !ch.is_ascii_alphanumeric())
                    .unwrap_or(true);
                if boundary && found.map(|(at, _)| index < at).unwrap_or(true) {
                    found = Some((index, tag));
                }
            }
        }
        let Some((index, tag)) = found else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..index]);
        let after = &rest[index..];
        let lower_after = after.to_ascii_lowercase();
        let close = format!("</{tag}");
        if let Some(close_at) = lower_after.find(&close) {
            let tail = &after[close_at + close.len()..];
            if let Some(gt) = tail.find('>') {
                rest = &tail[gt + 1..];
                continue;
            }
        }
        if let Some(gt) = after.find('>') {
            rest = &after[gt + 1..];
        } else {
            break;
        }
    }
    out
}

struct TagInfo {
    name: String,
    closing: bool,
    self_closing: bool,
    attrs: Vec<(String, String)>,
    len: usize,
    comment: bool,
}

fn read_tag(input: &str) -> Option<TagInfo> {
    if !input.starts_with('<') {
        return None;
    }
    if input.starts_with("<!--") {
        let len = if let Some(end) = input[4..].find("-->") {
            4 + end + 3
        } else {
            input.len()
        };
        return Some(TagInfo {
            name: String::new(),
            closing: false,
            self_closing: false,
            attrs: Vec::new(),
            len,
            comment: true,
        });
    }

    let mut i = 1usize;
    let mut closing = false;
    if input[i..].starts_with('/') {
        closing = true;
        i += 1;
    }
    i = skip_ws(input, i);
    let name_start = i;
    i = take_name(input, i);
    if i == name_start {
        return None;
    }
    let name = input[name_start..i].to_ascii_lowercase();
    let mut attrs = Vec::new();
    if !closing {
        loop {
            i = skip_ws(input, i);
            if i >= input.len() {
                break;
            }
            let ch = char_at(input, i);
            if ch == '>' || ch == '/' {
                break;
            }
            let attr_start = i;
            i = take_attr_name(input, i);
            if i == attr_start {
                i += ch.len_utf8();
                continue;
            }
            let attr_name = input[attr_start..i].to_ascii_lowercase();
            i = skip_ws(input, i);
            let mut value = String::new();
            if i < input.len() && input[i..].starts_with('=') {
                i += 1;
                i = skip_ws(input, i);
                if i < input.len() {
                    let quote = char_at(input, i);
                    if quote == '"' || quote == '\'' {
                        i += quote.len_utf8();
                        if let Some(rel) = input[i..].find(quote) {
                            value = input[i..i + rel].to_string();
                            i += rel + quote.len_utf8();
                        } else {
                            value = input[i..].to_string();
                            i = input.len();
                        }
                    } else {
                        let value_start = i;
                        while i < input.len() {
                            let c = char_at(input, i);
                            if c.is_whitespace() || c == '>' || c == '/' {
                                break;
                            }
                            i += c.len_utf8();
                        }
                        value = input[value_start..i].to_string();
                    }
                }
            }
            attrs.push((attr_name, value));
        }
    }
    let mut self_closing = false;
    if let Some(rel) = input[i..].find('>') {
        if input[i..i + rel].contains('/') {
            self_closing = true;
        }
        i += rel + 1;
    } else {
        i = input.len();
    }
    Some(TagInfo {
        name,
        closing,
        self_closing,
        attrs,
        len: i,
        comment: false,
    })
}

fn char_at(input: &str, i: usize) -> char {
    input[i..].chars().next().unwrap_or('\0')
}

fn skip_ws(input: &str, mut i: usize) -> usize {
    while i < input.len() {
        let ch = char_at(input, i);
        if !ch.is_whitespace() {
            break;
        }
        i += ch.len_utf8();
    }
    i
}

fn take_name(input: &str, mut i: usize) -> usize {
    while i < input.len() {
        let ch = char_at(input, i);
        if ch.is_ascii_alphanumeric() || ch == '-' {
            i += ch.len_utf8();
        } else {
            break;
        }
    }
    i
}

fn take_attr_name(input: &str, mut i: usize) -> usize {
    while i < input.len() {
        let ch = char_at(input, i);
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == ':' || ch == '_' {
            i += ch.len_utf8();
        } else {
            break;
        }
    }
    i
}

fn tag_allowed(name: &str) -> bool {
    matches!(
        name,
        "p" | "br"
            | "strong"
            | "b"
            | "em"
            | "i"
            | "u"
            | "s"
            | "del"
            | "a"
            | "ul"
            | "ol"
            | "li"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "blockquote"
            | "pre"
            | "code"
            | "img"
            | "table"
            | "thead"
            | "tbody"
            | "tfoot"
            | "tr"
            | "th"
            | "td"
            | "hr"
            | "span"
    )
}

fn attr_allowed(tag: &str, name: &str) -> bool {
    match (tag, name) {
        ("a", "href" | "title") => true,
        ("img", "src" | "alt" | "title" | "width" | "height") => true,
        ("td" | "th", "colspan" | "rowspan") => true,
        ("ol", "start") => true,
        _ => false,
    }
}

fn safe_url(value: &str, allow_data_image: bool) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("javascript:") || lower.starts_with("vbscript:") {
        return false;
    }
    if lower.starts_with("data:") {
        return allow_data_image
            && lower.starts_with("data:image/")
            && (lower.contains(";base64,")
                || lower.starts_with("data:image/png,")
                || lower.starts_with("data:image/jpeg,")
                || lower.starts_with("data:image/gif,")
                || lower.starts_with("data:image/webp,"));
    }
    if lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
        || lower.starts_with("cid:")
    {
        return true;
    }
    if trimmed.starts_with("//") {
        return false;
    }
    !trimmed.contains(':')
}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

fn void_tag(name: &str) -> bool {
    matches!(name, "br" | "img" | "hr")
}

fn rewrite_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while !rest.is_empty() {
        if let Some(tag) = read_tag(rest) {
            if tag.comment {
                rest = &rest[tag.len..];
                continue;
            }
            if tag_allowed(&tag.name) {
                if tag.closing {
                    out.push_str("</");
                    out.push_str(&tag.name);
                    out.push('>');
                } else {
                    push_start(&mut out, &tag.name, &tag.attrs, tag.self_closing);
                }
            }
            rest = &rest[tag.len..];
            continue;
        }
        let ch = char_at(rest, 0);
        out.push(ch);
        rest = &rest[ch.len_utf8()..];
    }
    out
}

fn push_start(out: &mut String, name: &str, attrs: &[(String, String)], self_closing: bool) {
    out.push('<');
    out.push_str(name);
    for (key, value) in attrs {
        if !attr_allowed(name, key) {
            continue;
        }
        if (key == "href" || key == "src") && !safe_url(value, name == "img" && key == "src") {
            continue;
        }
        out.push(' ');
        out.push_str(key);
        out.push_str("=\"");
        out.push_str(&escape_attr(value));
        out.push('"');
    }
    if self_closing || void_tag(name) {
        out.push_str(" />");
    } else {
        out.push('>');
    }
}

fn plain_from_html(html: &str) -> String {
    let mut out = String::new();
    let mut rest = html;
    while !rest.is_empty() {
        if let Some(tag) = read_tag(rest) {
            if !tag.comment && !tag.closing {
                if tag.name == "img" {
                    let alt = tag
                        .attrs
                        .iter()
                        .find(|(key, _)| key == "alt")
                        .map(|(_, value)| value.trim())
                        .unwrap_or("");
                    let src = tag
                        .attrs
                        .iter()
                        .find(|(key, _)| key == "src")
                        .map(|(_, value)| value.as_str())
                        .unwrap_or("");
                    if !alt.is_empty() {
                        out.push_str("[image: ");
                        out.push_str(alt);
                        out.push(']');
                    } else if src.trim_start().starts_with("data:image/") {
                        out.push_str("[image]");
                    }
                } else if tag.name == "br" {
                    out.push('\n');
                }
            } else if tag.closing {
                match tag.name.as_str() {
                    "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote" | "pre" | "tr" => {
                        if !out.ends_with("\n\n") {
                            out.push_str("\n\n");
                        }
                    }
                    "li" | "div" => {
                        if !out.ends_with('\n') {
                            out.push('\n');
                        }
                    }
                    _ => {}
                }
            }
            rest = &rest[tag.len..];
            continue;
        }
        let ch = char_at(rest, 0);
        out.push(ch);
        rest = &rest[ch.len_utf8()..];
    }
    let decoded = decode_entities(&out);
    let mut collapsed = String::new();
    let mut newlines = 0usize;
    for ch in decoded.chars() {
        if ch == '\n' {
            newlines += 1;
            if newlines <= 2 {
                collapsed.push('\n');
            }
        } else {
            newlines = 0;
            collapsed.push(ch);
        }
    }
    collapsed.trim().to_string()
}

fn decode_entities(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let after = &rest[amp..];
        if let Some(end) = after.find(';') {
            let entity = &after[1..end];
            if let Some(ch) = decode_one(entity) {
                out.push(ch);
                rest = &after[end + 1..];
                continue;
            }
        }
        out.push('&');
        rest = &rest[amp + 1..];
    }
    out.push_str(rest);
    out
}

fn decode_one(entity: &str) -> Option<char> {
    match entity {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" | "#39" => Some('\''),
        "nbsp" => Some('\u{00a0}'),
        _ => {
            if let Some(hex) = entity
                .strip_prefix("#x")
                .or_else(|| entity.strip_prefix("#X"))
            {
                return u32::from_str_radix(hex, 16).ok().and_then(char::from_u32);
            }
            if let Some(digits) = entity.strip_prefix('#') {
                return digits.parse::<u32>().ok().and_then(char::from_u32);
            }
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_mark_and_keeps_fragment() {
        let body = format!("{COMPOSE_HTML_MARK}<p>Bonjour <strong>monde</strong></p>");
        assert!(compose_body_is_html(&body));
        assert!(sanitize_compose_html(compose_html_fragment(&body)).contains("<strong>monde</strong>"));
        let plain = compose_html_to_plain(&body);
        assert!(plain.contains("Bonjour"));
        assert!(plain.contains("monde"));
        assert!(!plain.contains('<'));
    }

    #[test]
    fn strips_script_and_event_handlers() {
        let html = r#"<script>alert(1)</script><p onclick="alert(1)">OK</p>"#;
        let safe = sanitize_compose_html(html);
        assert!(!safe.to_ascii_lowercase().contains("script"));
        assert!(!safe.contains("onclick"));
        assert!(safe.contains("OK"));
        assert!(!compose_html_to_plain(html).contains("alert"));
    }

    #[test]
    fn drops_javascript_href_and_keeps_data_image_out_of_plain() {
        let html = r#"<a href="javascript:alert(1)">x</a><img src="data:image/png;base64,AAAA" alt="capture" />"#;
        let safe = sanitize_compose_html(html);
        assert!(!safe.to_ascii_lowercase().contains("javascript:"));
        assert!(safe.contains("data:image/png;base64,AAAA"));
        let plain = compose_html_to_plain(&format!("{COMPOSE_HTML_MARK}{html}"));
        assert!(plain.contains("[image: capture]"));
        assert!(!plain.contains("base64"));
    }

    #[test]
    fn markdown_is_not_html() {
        assert!(!compose_body_is_html("Bonjour **monde**"));
        assert_eq!(compose_body_plain("Bonjour"), "Bonjour");
    }
}
