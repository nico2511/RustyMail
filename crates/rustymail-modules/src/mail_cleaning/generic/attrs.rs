use std::sync::LazyLock;

use scraper::{Html, Node, Selector};

static SEL_ALL_ELEMENTS: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("*").expect("universal element selector"));

/// Classes conservées après strip (marqueurs RustyMail / Gmail quote — ciblés par le CSS d’affichage).
fn retain_structural_class_attr(value: &str) -> Option<String> {
    let kept: Vec<&str> = value
        .split_whitespace()
        .filter(|c| {
            c.starts_with("rm-mail-")
                || c.starts_with("rm-amazon-")
                || c.starts_with("rm-deblock-")
                || matches!(*c, "gmail_quote" | "gmail_quote_container")
        })
        .collect();
    if kept.is_empty() {
        None
    } else {
        Some(kept.join(" "))
    }
}

/// Retire attributs de présentation (style, class, mso-*, align, …) ; garde href/src/alt/title/colspan/rowspan
/// et width/height sur médias.
pub fn strip_presentation_attrs(html: &str) -> String {
    let mut doc = Html::parse_fragment(html);
    let ids: Vec<_> = doc.select(&SEL_ALL_ELEMENTS).map(|e| e.id()).collect();
    for id in ids {
        let Some(mut node) = doc.tree.get_mut(id) else {
            continue;
        };
        let Node::Element(el) = node.value() else {
            continue;
        };
        let tag = el.name.local.as_ref();
        el.attrs.retain_mut(|(name, value)| {
            if name.local.as_ref() == "class" {
                if let Some(kept) = retain_structural_class_attr(value) {
                    *value = kept.into();
                    return true;
                }
                return false;
            }
            keep_attr(tag, name.local.as_ref())
        });
    }
    doc.html()
}

pub(crate) fn keep_attr(tag: &str, attr: &str) -> bool {
    let a = attr.to_ascii_lowercase();
    if a.starts_with("mso-") {
        return false;
    }
    match a.as_str() {
        "href" | "src" | "alt" | "title" | "colspan" | "rowspan" | "role" | "aria-label" | "id" => true,
        "width" | "height" => matches!(tag, "img" | "video" | "picture" | "source" | "svg"),
        "style"
        | "class"
        | "align"
        | "valign"
        | "bgcolor"
        | "border"
        | "cellpadding"
        | "cellspacing"
        | "face"
        | "color"
        | "lang"
        | "dir" => false,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_quoted_and_unquoted_presentation_attrs() {
        let html = r#"<p class=MsoNormal style='color:red' align=center mso-line-height-rule:exactly width=600><a href="https://x">Go</a></p>"#;
        let out = strip_presentation_attrs(html);
        assert!(out.contains(r#"href="https://x""#));
        assert!(!out.contains("MsoNormal"));
        assert!(!out.contains("style="));
        assert!(!out.contains("mso-"));
        assert!(!out.contains("align="));
        assert!(!out.contains("width=600"));
    }

    #[test]
    fn keeps_img_dimensions() {
        let html = r#"<img src="https://logo.example/x.png" width="48" height="48" alt="Logo"/>"#;
        let out = strip_presentation_attrs(html);
        assert!(out.contains("width=\"48\""));
        assert!(out.contains("height=\"48\""));
    }

    #[test]
    fn keeps_rustymail_structural_classes() {
        let html = r#"<div class="MsoNormal rm-mail-forward-header"><p class="x">De :</p></div>"#;
        let out = strip_presentation_attrs(html);
        assert!(out.contains("rm-mail-forward-header"));
        assert!(!out.contains("MsoNormal"));
        assert!(!out.contains("class=\"x\""));
    }
}
