use scraper::ElementRef;

const TRACKER_HOST_MARKERS: &[&str] = &[
    "doubleclick.net",
    "googleadservices.com",
    "googlesyndication.com",
    "track.",
    "tracking.",
    "open.",
    "click.",
    "pixel.",
    "mailchimp.com",
    "list-manage.com",
    "mandrillapp.com",
    "sendgrid.net/wf",
    "hubspotlinks.com",
    "cmail",
    "/o.gif",
    "beacon.",
];

/// Ne retire une image que si plusieurs signaux indiquent un pixel / tracker (évite faux positifs logo).
pub fn is_tracking_or_hidden_img(el: ElementRef<'_>) -> bool {
    if is_outlook_noise_img(el) {
        return true;
    }
    if is_hidden_by_style_or_attr(el) {
        return true;
    }
    let src = match el.attr("src") {
        Some(s) if !s.trim().is_empty() => s,
        _ => return pixel_dimensions_only(el) && presentation_role(el),
    };
    let s = src.to_ascii_lowercase();
    let tiny = pixel_dimensions_only(el);
    let tracker_host = known_tracker_host(&s);

    if tiny && tracker_host {
        return true;
    }
    if tiny && presentation_role(el) {
        return true;
    }
    if tracker_host && (tiny || s.contains("pixel") || s.contains("beacon")) {
        return true;
    }
    if tiny && (s.contains("spacer") || s.ends_with("/o.gif")) {
        return true;
    }
    false
}

/// Images fantômes Outlook / Word (trace VML, spacer cid, bordures exportées).
pub fn is_outlook_noise_img(el: ElementRef<'_>) -> bool {
    if el.attr("data-outlook-trace").is_some() {
        return true;
    }
    let id = el.attr("id").unwrap_or("").to_ascii_lowercase();
    if id.contains("x0000_i") || id.contains("_x0000_") {
        return true;
    }
    let src = el.attr("src").unwrap_or("").to_ascii_lowercase();
    if src.starts_with("cid:") && (id.contains("x0000") || id.contains("image00")) {
        let alt_empty = el.attr("alt").map(|a| a.trim().is_empty()).unwrap_or(true);
        if alt_empty {
            return true;
        }
    }
    false
}

fn known_tracker_host(src: &str) -> bool {
    TRACKER_HOST_MARKERS.iter().any(|m| src.contains(m))
}

fn is_hidden_by_style_or_attr(el: ElementRef<'_>) -> bool {
    if el.attr("hidden").is_some() {
        return true;
    }
    if el.attr("aria-hidden").is_some_and(|v| v == "true") {
        return true;
    }
    let Some(style) = el.attr("style") else {
        return false;
    };
    let lower = style.to_ascii_lowercase();
    lower.contains("display:none")
        || lower.contains("display: none")
        || lower.contains("visibility:hidden")
        || lower.contains("visibility: hidden")
        || lower.contains("opacity:0")
        || lower.contains("opacity: 0")
}

fn presentation_role(el: ElementRef<'_>) -> bool {
    el.attr("role")
        .is_some_and(|r| r.eq_ignore_ascii_case("presentation"))
}

fn pixel_dimensions_only(el: ElementRef<'_>) -> bool {
    let w = el.attr("width").and_then(parse_dim);
    let h = el.attr("height").and_then(parse_dim);
    matches!((w, h), (Some(w), Some(h)) if w <= 1 && h <= 1) || dims_from_style_tiny(el)
}

fn parse_dim(raw: &str) -> Option<u32> {
    let t = raw.trim().trim_end_matches('%');
    t.parse().ok()
}

fn dims_from_style_tiny(el: ElementRef<'_>) -> bool {
    let Some(style) = el.attr("style") else {
        return false;
    };
    let lower = style.to_ascii_lowercase();
    let mut w: Option<u32> = None;
    let mut h: Option<u32> = None;
    for part in lower.split(';') {
        let part = part.trim();
        if let Some(rest) = part.strip_prefix("width:") {
            w = parse_css_len(rest);
        } else if let Some(rest) = part.strip_prefix("height:") {
            h = parse_css_len(rest);
        }
    }
    matches!((w, h), (Some(0..=1), Some(0..=1)))
}

fn parse_css_len(raw: &str) -> Option<u32> {
    let t = raw.trim();
    let t = t.strip_suffix("px").unwrap_or(t).trim();
    let n: f32 = t.parse().ok()?;
    Some(n.round() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use scraper::{Html, Selector};

    #[test]
    fn keeps_small_logo_without_tracker_signals() {
        let html = r#"<img src="https://cdn.example/logo.png" width="32" height="32" alt="Acme"/>"#;
        let doc = Html::parse_fragment(html);
        let img = doc.select(&Selector::parse("img").unwrap()).next().unwrap();
        assert!(!is_tracking_or_hidden_img(img));
    }

    #[test]
    fn removes_outlook_trace_cid_image() {
        let html = r#"<span style=""><img id="x_x__x0000_i1027" data-outlook-trace="F:2|T:2" src="cid:image001.jpg@01DCF376.14FDF370"></span>"#;
        let doc = Html::parse_fragment(html);
        let img = doc.select(&Selector::parse("img").unwrap()).next().unwrap();
        assert!(is_outlook_noise_img(img));
        assert!(is_tracking_or_hidden_img(img));
    }

    #[test]
    fn removes_1x1_tracker_pixel() {
        let html = r#"<img src="https://track.example/pixel?id=1" width="1" height="1" role="presentation"/>"#;
        let doc = Html::parse_fragment(html);
        let img = doc.select(&Selector::parse("img").unwrap()).next().unwrap();
        assert!(is_tracking_or_hidden_img(img));
    }
}
