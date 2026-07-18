use std::sync::LazyLock;

use ego_tree::NodeId;
use regex::Regex;
use scraper::{ElementRef, Html, Selector};

static RE_MSO_CONDITIONAL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<!--\[if\s+mso\][\s\S]*?<!\[endif\]-->")
        .expect("mso conditional comment regex")
});

static SEL_ALL_ELEMENTS: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("*").expect("universal element selector"));

const OFFICE_TAG_PREFIXES: &[&str] = &["v:", "o:", "w:"];

/// Retire commentaires conditionnels MSO avant parse HTML.
pub fn strip_mso_conditional_comments(html: &str) -> String {
    RE_MSO_CONDITIONAL.replace_all(html, "").into_owned()
}

pub fn clean_outlook_noise(doc: &mut Html) {
    remove_office_namespace_elements(doc);
    unwrap_redundant_wrappers(doc);
}

fn remove_office_namespace_elements(doc: &mut Html) {
    let ids: Vec<NodeId> = doc
        .select(&SEL_ALL_ELEMENTS)
        .filter(|el| is_office_namespace_tag(element_local_name(*el)))
        .map(|el| el.id())
        .collect();
    super::super::dom::detach_nodes(doc, ids);
}

fn is_office_namespace_tag(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    OFFICE_TAG_PREFIXES.iter().any(|p| n.starts_with(p))
        || matches!(n.as_str(), "vmlframe" | "imagedata" | "shapetype" | "shape")
}

fn element_local_name(el: ElementRef<'_>) -> &str {
    el.value().name.local.as_ref()
}

/// Déplie les chaînes `div/span/p` qui n’ajoutent qu’un seul wrapper identique.
fn unwrap_redundant_wrappers(doc: &mut Html) {
    let Ok(sel) = Selector::parse("div, span, p, font") else {
        return;
    };
    for _ in 0..12 {
        let candidates: Vec<(NodeId, NodeId)> = doc
            .select(&sel)
            .filter_map(|el| {
                let kids: Vec<ElementRef<'_>> =
                    el.children().filter_map(ElementRef::wrap).collect();
                if kids.len() != 1 {
                    return None;
                }
                let child = kids[0];
                if !matches!(
                    element_local_name(child),
                    "div" | "span" | "p" | "font" | "b" | "i" | "em" | "strong" | "u"
                ) {
                    return None;
                }
                if super::super::dom::element_visible_mass(el)
                    != super::super::dom::element_visible_mass(child)
                {
                    return None;
                }
                if el.value().attrs.iter().any(|(name, _)| {
                    super::attrs::keep_attr(element_local_name(el), name.local.as_ref())
                }) {
                    return None;
                }
                Some((el.id(), child.id()))
            })
            .collect();
        let mut unwrapped = false;
        for (wrapper_id, child_id) in candidates {
            if hoist_child_over_wrapper(doc, wrapper_id, child_id) {
                unwrapped = true;
                break;
            }
        }
        if !unwrapped {
            break;
        }
    }
}

fn hoist_child_over_wrapper(doc: &mut Html, wrapper_id: NodeId, child_id: NodeId) -> bool {
    let Some(wrapper_node) = doc.tree.get(wrapper_id) else {
        return false;
    };
    let parent_id = wrapper_node.parent().map(|p| p.id());
    let Some(parent_id) = parent_id else {
        return false;
    };
    let Some(mut child_node) = doc.tree.get_mut(child_id) else {
        return false;
    };
    let _ = child_node.detach();
    let Some(mut wrapper_mut) = doc.tree.get_mut(wrapper_id) else {
        return false;
    };
    let _ = wrapper_mut.detach();
    let Some(mut parent_mut) = doc.tree.get_mut(parent_id) else {
        return false;
    };
    let _ = parent_mut.append_id(child_id);
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use scraper::Html;

    #[test]
    fn strips_mso_conditional_comments() {
        let html = "<p>Hi</p><!--[if mso]><table><tr><td>X</td></tr></table><![endif]--><p>Bye</p>";
        let out = strip_mso_conditional_comments(html);
        assert!(out.contains("Hi") && out.contains("Bye"));
        assert!(!out.contains("[if mso]"));
    }

    #[test]
    fn removes_vml_tags() {
        let html = r#"<div><p>Body</p><v:roundrect>noise</v:roundrect></div>"#;
        let mut doc = Html::parse_fragment(html);
        clean_outlook_noise(&mut doc);
        let out = doc.html();
        assert!(out.contains("Body"));
        assert!(!out.to_ascii_lowercase().contains("v:roundrect"));
    }
}
