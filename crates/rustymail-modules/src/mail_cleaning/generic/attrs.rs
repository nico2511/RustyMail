use std::collections::HashSet;
use std::sync::LazyLock;

use ego_tree::NodeId;
use scraper::{ElementRef, Html, Node, Selector};

static SEL_ALL_ELEMENTS: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("*").expect("universal element selector"));

static SEL_RM_MAIL_DATA_TABLE: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("table.rm-mail-data").expect("rm-mail-data table selector")
});

/// Classes conservées après strip (marqueurs RustyMail / Gmail quote — ciblés par le CSS d’affichage).
fn retain_structural_class_attr(value: &str) -> Option<String> {
    let kept: Vec<&str> = value
        .split_whitespace()
        .filter(|c| {
            c.starts_with("rm-mail-")
                || c.starts_with("rm-conversation-")
                || *c == "rm-digest"
                || c.starts_with("rm-digest-")
                || c.starts_with("rm-amazon-")
                || c.starts_with("rm-deblock-")
                || c.starts_with("rm-github-")
                || matches!(*c, "gmail_quote" | "gmail_quote_container")
                || c.ends_with("_gmail_quote")
                || c.ends_with("_gmail_quote_container")
                || *c == "x_gmail_quote"
        })
        .collect();
    if kept.is_empty() {
        None
    } else {
        Some(kept.join(" "))
    }
}

fn class_has_rm_mail_data(value: &str) -> bool {
    value.split_whitespace().any(|c| c == "rm-mail-data")
}

/// IDs des nœuds `table` / `td` / `th` appartenant à un tableau data compositeur.
fn mail_data_table_cell_ids(doc: &Html) -> HashSet<NodeId> {
    let mut ids = HashSet::new();
    for table in doc.select(&SEL_RM_MAIL_DATA_TABLE) {
        ids.insert(table.id());
        for desc in table.descendants() {
            let Some(el) = ElementRef::wrap(desc) else {
                continue;
            };
            let tag = el.value().name.local.as_ref();
            if matches!(tag, "td" | "th" | "table") {
                ids.insert(el.id());
            }
        }
    }
    ids
}

/// Retire attributs de présentation (style, class, mso-*, align, …) ; garde href/src/alt/title/colspan/rowspan
/// et width/height sur médias. Bordures / cellules de présentation : uniquement `table.rm-mail-data`.
pub fn strip_presentation_attrs(html: &str) -> String {
    let mut doc = Html::parse_fragment(html);
    // Préserver `rm-mail-data` avant le strip class, pour décider des attrs table.
    let data_cells = mail_data_table_cell_ids(&doc);
    // Aussi : tables dont la class contient encore rm-mail-data (même avant retain).
    let ids: Vec<_> = doc.select(&SEL_ALL_ELEMENTS).map(|e| e.id()).collect();
    for id in ids {
        let in_data_table = data_cells.contains(&id);
        let Some(mut node) = doc.tree.get_mut(id) else {
            continue;
        };
        let Node::Element(el) = node.value() else {
            continue;
        };
        let tag = el.name.local.as_ref().to_string();
        // Si c’est une table avec rm-mail-data dans class (avant retain), traiter comme data.
        let table_is_data = tag == "table"
            && el
                .attrs
                .iter()
                .any(|(n, v)| n.local.as_ref() == "class" && class_has_rm_mail_data(v));
        let allow_table_present = in_data_table || table_is_data;
        el.attrs.retain_mut(|(name, value)| {
            if name.local.as_ref() == "class" {
                if let Some(kept) = retain_structural_class_attr(value) {
                    *value = kept.into();
                    return true;
                }
                return false;
            }
            keep_attr(&tag, name.local.as_ref(), allow_table_present)
        });
    }
    doc.html()
}

pub(crate) fn keep_attr(tag: &str, attr: &str, allow_table_present: bool) -> bool {
    let a = attr.to_ascii_lowercase();
    if a.starts_with("mso-") {
        return false;
    }
    match a.as_str() {
        "href" | "src" | "alt" | "title" | "colspan" | "rowspan" | "role" | "aria-label" | "id"
        | "data-digest-id" => true,
        "width" | "height" => {
            if matches!(tag, "img" | "video" | "picture" | "source" | "svg") {
                return true;
            }
            allow_table_present && matches!(tag, "table" | "td" | "th")
        }
        // Présentation utile (compose TipTap + clients) — uniquement tableaux data.
        "border" | "cellpadding" | "cellspacing" => allow_table_present && tag == "table",
        "bgcolor" | "align" | "valign" => {
            allow_table_present && matches!(tag, "table" | "td" | "th")
        }
        "style" | "class" | "face" | "color" | "lang" | "dir" => false,
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
    fn keeps_table_border_attrs_and_rm_mail_data_class() {
        let html = r##"<table class="rm-mail-data MsoNormal" border="1" cellpadding="6" cellspacing="0"><tr><th bgcolor="#f2f0ec" align="left">A</th><td>B</td></tr></table>"##;
        let out = strip_presentation_attrs(html);
        assert!(out.contains("rm-mail-data"));
        assert!(!out.contains("MsoNormal"));
        assert!(out.contains(r#"border="1""#));
        assert!(out.contains(r#"cellpadding="6""#));
        assert!(out.contains(r##"bgcolor="#f2f0ec""##));
    }

    #[test]
    fn strips_layout_table_border_attrs() {
        let html = r##"<table border="1" cellpadding="6" bgcolor="#fff"><tr><td align="left">Layout</td></tr></table>"##;
        let out = strip_presentation_attrs(html);
        assert!(!out.contains("border="));
        assert!(!out.contains("cellpadding="));
        assert!(!out.contains("bgcolor="));
        assert!(!out.contains("align="));
        assert!(out.contains("Layout"));
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
