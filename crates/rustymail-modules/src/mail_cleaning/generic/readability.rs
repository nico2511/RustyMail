use std::sync::LazyLock;

use regex::Regex;

static RE_BR_RUN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)(?:<br\s*/?>\s*){3,}").expect("br run"));
static RE_BULLET_P: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<p[^>]*>\s*[•·▪▫‣⁃-]\s*([^<]+?)\s*</p>").expect("bullet paragraph")
});

/// Ajustements légers post-nettoyage (sauts de ligne, listes pseudo-texte).
pub fn postprocess_readability(html: &str) -> String {
    let br = RE_BR_RUN.replace_all(html, "<br><br>");
    convert_bullet_paragraphs(&br)
}

fn convert_bullet_paragraphs(html: &str) -> String {
    RE_BULLET_P
        .replace_all(html, |caps: &regex::Captures| {
            let item = caps.get(1).map(|m| m.as_str().trim()).unwrap_or("");
            if item.is_empty() {
                return caps.get(0).map(|m| m.as_str()).unwrap_or("").to_string();
            }
            format!("<ul><li>{}</li></ul>", escape_html_text(item))
        })
        .into_owned()
}

fn escape_html_text(raw: &str) -> String {
    let mut s = String::with_capacity(raw.len());
    for c in raw.chars() {
        match c {
            '&' => s.push_str("&amp;"),
            '<' => s.push_str("&lt;"),
            '>' => s.push_str("&gt;"),
            '"' => s.push_str("&quot;"),
            _ => s.push(c),
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapses_br_runs() {
        let html = "<p>A</p><br><br><br><br><p>B</p>";
        let out = postprocess_readability(html);
        assert!(!out.contains("<br><br><br>"));
        assert!(out.contains("<br><br>"));
    }

    #[test]
    fn converts_bullet_paragraph() {
        let html = "<p>• Premier point</p>";
        let out = postprocess_readability(html);
        assert!(out.contains("<ul><li>Premier point</li></ul>"));
    }
}
