use serde::Deserialize;

use crate::ai_llm_util::{budget_report, extract_json_candidate, gen_params_json_for_prompt, truncate_chars};
use rustymail_domain::{GrammarResult, GrammarSuggestion};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrammarDto {
    #[serde(default)]
    suggestions: Vec<GrammarSuggestion>,
}

/// Repère la tranche `s[lo..hi]` = contenu du tableau JSON après `"suggestions":` (sans les crochets `[` `]`).
fn suggestions_array_inner_range(s: &str) -> Option<(usize, usize)> {
    let key = "\"suggestions\"";
    let i = s.find(key)?;
    let tail = &s[i + key.len()..];
    let j = tail.find('[')?;
    let open = i + key.len() + j;
    let close = matching_bracket_byte(s, open, b'[', b']')?;
    Some((open + 1, close))
}

/// `open_idx` pointe sur `open_b` ; renvoie l’index de `close_b` apparié.
fn matching_bracket_byte(s: &str, open_idx: usize, open_b: u8, close_b: u8) -> Option<usize> {
    let bytes = s.as_bytes();
    if bytes.get(open_idx) != Some(&open_b) {
        return None;
    }
    let mut depth = 1i32;
    let mut in_str = false;
    let mut esc = false;
    let mut i = open_idx + 1;
    while i < bytes.len() {
        let b = bytes[i];
        if in_str {
            if esc {
                esc = false;
            } else if b == b'\\' {
                esc = true;
            } else if b == b'"' {
                in_str = false;
            }
        } else if b == b'"' {
            in_str = true;
        } else if b == open_b {
            depth += 1;
        } else if b == close_b {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

/// `open_idx` sur `{` ; renvoie l’index du `}` apparié.
fn matching_brace_byte(s: &str, open_idx: usize) -> Option<usize> {
    matching_bracket_byte(s, open_idx, b'{', b'}')
}

/// Découpe un contenu d’objet JSON plat sur les virgules de profondeur 0 (hors chaînes).
fn split_depth_zero_commas(inner: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut depth = 0i32;
    let mut in_str = false;
    let mut esc = false;
    for (i, c) in inner.char_indices() {
        if in_str {
            if esc {
                esc = false;
            } else if c == '\\' {
                esc = true;
            } else if c == '"' {
                in_str = false;
            }
        } else {
            match c {
                '"' => in_str = true,
                '{' | '[' => depth += 1,
                '}' | ']' => depth -= 1,
                ',' if depth == 0 => {
                    out.push(inner[start..i].trim());
                    start = i + c.len_utf8();
                }
                _ => {}
            }
        }
    }
    out.push(inner[start..].trim());
    out
}

fn extract_object_key(segment: &str) -> Option<String> {
    let t = segment.trim();
    let t = t.strip_prefix('"')?;
    let end = t.find('"')?;
    Some(t[..end].to_string())
}

/// Reconstruit un objet JSON plat : `offset` / `length` = **première** valeur ; `original` / `replacement` / `reason` = **dernière** si doublons (sortie modèle bancale).
fn dedupe_flat_json_object(obj: &str) -> Option<String> {
    let obj = obj.trim();
    let inner = obj.strip_prefix('{')?.strip_suffix('}')?.trim();
    let parts = split_depth_zero_commas(inner);
    let mut by_key: std::collections::HashMap<String, Vec<&str>> = std::collections::HashMap::new();
    for p in parts {
        if p.is_empty() {
            continue;
        }
        if let Some(k) = extract_object_key(p) {
            by_key.entry(k).or_default().push(p.trim());
        }
    }
    const ORDER: &[&str] = &["offset", "length", "original", "replacement", "reason"];
    let mut out: Vec<&str> = Vec::new();
    for key in ORDER {
        let Some(segs) = by_key.get(*key) else { continue };
        let pick = if matches!(*key, "original" | "replacement" | "reason") {
            segs.last().copied()
        } else {
            segs.first().copied()
        };
        if let Some(s) = pick {
            out.push(s);
        }
    }
    if out.is_empty() {
        Some("{}".to_string())
    } else {
        Some(format!("{{{}}}", out.join(",")))
    }
}

fn split_array_top_level_objects(inner: &str) -> Vec<String> {
    let inner = inner.trim();
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < inner.len() {
        while let Some(c) = inner[i..].chars().next() {
            if c.is_whitespace() || c == ',' {
                i += c.len_utf8();
            } else {
                break;
            }
        }
        if i >= inner.len() {
            break;
        }
        let rest = &inner[i..];
        if !rest.starts_with('{') {
            break;
        }
        if let Some(end_rel) = matching_brace_byte(rest, 0) {
            out.push(rest[..=end_rel].to_string());
            i += end_rel + 1;
        } else {
            break;
        }
    }
    out
}

/// Quand le modèle produit du JSON strictement invalide (ex. clé `replacement` en double), on tente une réparation.
fn repair_grammar_dto(s: &str) -> Result<GrammarDto, LlmError> {
    let (lo, hi) = suggestions_array_inner_range(s)
        .ok_or_else(|| LlmError::InvalidJson("champ suggestions introuvable".into()))?;
    let inner = &s[lo..hi];
    let objs = split_array_top_level_objects(inner);
    let mut suggestions = Vec::new();
    for obj in objs {
        let Some(fixed) = dedupe_flat_json_object(&obj) else {
            continue;
        };
        if let Ok(g) = serde_json::from_str::<GrammarSuggestion>(&fixed) {
            suggestions.push(g);
        }
    }
    Ok(GrammarDto { suggestions })
}

/// Normalise les sorties modèles (guillemets typographiques, virgules finales).
fn normalize_json_loose(s: &str) -> String {
    let mut t = s.replace('\u{00a0}', " ");
    t = t.replace('“', "\"");
    t = t.replace('”', "\"");
    t = t.replace('‘', "'");
    t = t.replace('’', "'");
    while t.contains(",}") {
        t = t.replace(",}", "}");
    }
    while t.contains(",]") {
        t = t.replace(",]", "]");
    }
    t
}

fn wrap_bare_suggestions_array(s: &str) -> String {
    let t = s.trim();
    if t.starts_with('[') && !t.starts_with("{\"suggestions\"") {
        format!("{{\"suggestions\":{t}}}")
    } else {
        s.to_string()
    }
}

fn filter_usable_suggestions(mut suggestions: Vec<GrammarSuggestion>) -> Vec<GrammarSuggestion> {
    suggestions.retain(|g| {
        let o = g.original.trim();
        let r = g.replacement.trim();
        !o.is_empty() && o != r
    });
    suggestions.truncate(40);
    suggestions
}

fn parse_grammar_dto(raw: &str) -> Result<GrammarDto, LlmError> {
    let mut s = normalize_json_loose(&extract_json_candidate(raw));
    s = wrap_bare_suggestions_array(&s);
    match serde_json::from_str::<GrammarDto>(&s) {
        Ok(mut d) => {
            d.suggestions = filter_usable_suggestions(d.suggestions);
            Ok(d)
        }
        Err(e) => {
            let msg = e.to_string();
            if s.contains("\"suggestions\"")
                || msg.contains("duplicate field")
                || msg.contains("duplicate key")
                || msg.contains("expected `:`")
                || msg.contains("missing field")
            {
                let mut repaired = repair_grammar_dto(&s).map_err(|e2| {
                    LlmError::InvalidJson(format!("{msg} — tentative réparation: {e2}"))
                })?;
                repaired.suggestions = filter_usable_suggestions(repaired.suggestions);
                Ok(repaired)
            } else {
                Err(LlmError::InvalidJson(msg))
            }
        }
    }
}

pub fn grammar_check_with_llm(
    engine: &mut LlmEngine,
    text: &str,
    output_language: &str,
) -> Result<GrammarResult, LlmError> {
    let system = crate::prompts::system_prompt_for_language("grammar", output_language);
    let user = truncate_chars(text, 32_768);
    let user_block = format!("Text:\n{user}");

    let raw = engine.generate(
        system.as_str(),
        &user_block,
        &gen_params_json_for_prompt(engine, system.as_str(), &user_block, 512, 6144),
    )?;
    let dto = parse_grammar_dto(&raw)?;
    Ok(GrammarResult {
        suggestions: dto.suggestions,
        budget: budget_report(
            engine.n_ctx(),
            engine,
            system.as_str(),
            &user_block,
            Some(raw.as_str()),
            text.chars().count() > 32_768,
        ),
    })
}

pub fn grammar_stub() -> GrammarResult {
    use rustymail_domain::TokenBudgetReport;

    GrammarResult {
        suggestions: Vec::new(),
        budget: TokenBudgetReport::empty_stub(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_grammar_trailing_comma() {
        let raw = r#"{"suggestions":[{"original":"bonjour","replacement":"Bonjour","reason":"casse",},]}"#;
        let dto = parse_grammar_dto(raw).expect("parse");
        assert_eq!(dto.suggestions.len(), 1);
        assert_eq!(dto.suggestions[0].replacement, "Bonjour");
    }

    #[test]
    fn parse_grammar_bare_array() {
        let raw = r#"[{"original":"teh","replacement":"the","reason":"typo"}]"#;
        let dto = parse_grammar_dto(raw).expect("parse");
        assert_eq!(dto.suggestions.len(), 1);
    }

    #[test]
    fn parse_grammar_duplicate_replacement_key() {
        let raw = r#"{"suggestions":[{"original":"foo","replacement":"bar","replacement":"baz","reason":"x"}]}"#;
        let dto = parse_grammar_dto(raw).expect("repair");
        assert_eq!(dto.suggestions[0].replacement, "baz");
    }
}
