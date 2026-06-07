//! Échantillons de texte pour heuristiques (tags, retag) — troncature UTF-8 sûre.

/// Ajoute jusqu'à `max_total_bytes` octets UTF-8 de `src` dans `dst` (sans couper un scalaire).
pub(crate) fn append_utf8_byte_sample(dst: &mut String, src: &str, max_total_bytes: usize) {
    if dst.len() >= max_total_bytes {
        return;
    }
    let src = src.trim();
    if src.is_empty() || !looks_like_text_for_heuristics(src) {
        return;
    }
    let room = max_total_bytes.saturating_sub(dst.len());
    let mut end = src.len().min(room);
    while end > 0 && !src.is_char_boundary(end) {
        end -= 1;
    }
    if end == 0 {
        return;
    }
    dst.push_str(&src[..end]);
    if dst.len() < max_total_bytes && !dst.ends_with('\n') {
        dst.push('\n');
    }
}

/// Évite d’indexer du binaire (ex. PDF lu comme `text/plain`) pour l’inférence de tags.
pub(crate) fn looks_like_text_for_heuristics(s: &str) -> bool {
    let probe: String = s.chars().take(800).collect();
    if probe.is_empty() {
        return false;
    }
    let mut good = 0u32;
    let total = probe.chars().count() as u32;
    for c in probe.chars() {
        if c.is_whitespace()
            || c.is_ascii_alphanumeric()
            || matches!(
                c,
                '.' | ',' | ';' | ':' | '!' | '?' | '-' | '_' | '@' | '/'
                    | '(' | ')' | '\'' | '"' | '«' | '»' | '’' | '€' | '%' | '+'
                    | '=' | '&' | '#' | '[' | ']' | '\n' | '\r' | '\t'
            )
        {
            good += 1;
        }
    }
    good * 4 >= total * 3
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn append_does_not_panic_on_multibyte_boundary() {
        let plain = format!("{}{}", "a".repeat(3998), "†bc");
        let mut sample = String::new();
        append_utf8_byte_sample(&mut sample, &plain, 4000);
        assert!(sample.is_char_boundary(sample.len()));
    }

    #[test]
    fn rejects_pdf_like_binary() {
        let bin = "PK\x03\x04WJ\x00\x00CONDITIONS_SERVICE.pdf\x00\u{80}";
        assert!(!looks_like_text_for_heuristics(bin));
    }
}
