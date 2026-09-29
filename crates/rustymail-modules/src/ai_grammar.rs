use serde::Deserialize;

use crate::ai_llm_contracts::contains_llm_meta;
use crate::ai_llm_util::{
    budget_report, extract_json_candidate, gen_params_json_for_prompt, normalize_json_loose,
    truncate_chars,
};
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
        let Some(segs) = by_key.get(*key) else {
            continue;
        };
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

fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn norm_excerpt(s: &str) -> String {
    let mut out = String::new();
    let mut prev_space = false;
    for c in s.chars() {
        let c = match c {
            '\u{2019}' | '\u{2018}' | '`' | '\u{00b4}' => '\'',
            c if c.is_whitespace() => ' ',
            c => c,
        };
        if c == ' ' {
            if prev_space {
                continue;
            }
            prev_space = true;
        } else {
            prev_space = false;
        }
        out.push(c);
    }
    out.trim().to_string()
}

fn excerpt_in_source(source: &str, original: &str) -> bool {
    let needle = norm_excerpt(original);
    if needle.is_empty() {
        return false;
    }
    norm_excerpt(source).contains(&needle)
}

fn content_tokens(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for c in s.chars() {
        if c.is_alphanumeric() {
            cur.extend(c.to_lowercase());
        } else if !cur.is_empty() {
            if cur.chars().count() >= 2 {
                out.push(std::mem::take(&mut cur));
            } else {
                cur.clear();
            }
        }
    }
    if cur.chars().count() >= 2 {
        out.push(cur);
    }
    out
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0; b.len() + 1];
    for i in 1..=a.len() {
        cur[0] = i;
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (cur[j - 1] + 1).min(prev[j] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

fn tokens_similar(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    let limit = 2.max(a.chars().count() / 3);
    levenshtein(a, b) <= limit
}

/// Vrai quand le remplacement est surtout le texte d’origine avec un mot de contenu en moins
/// (« Bonjour, je m'appelle Nicola. » → « Bonjour, je m'appelle. »).
fn replacement_drops_words(original: &str, replacement: &str) -> bool {
    let orig = content_tokens(original);
    let repl = content_tokens(replacement);
    if repl.is_empty() {
        return orig.iter().any(|t| t.chars().count() >= 4);
    }
    let missing = orig
        .iter()
        .any(|t| t.chars().count() >= 4 && !repl.iter().any(|r| tokens_similar(t, r)));
    if !missing {
        return false;
    }
    let preserved = repl
        .iter()
        .filter(|t| orig.iter().any(|o| tokens_similar(t, o)))
        .count();
    let coverage = preserved as f32 / repl.len() as f32;
    coverage >= 0.75 && repl.len() < orig.len()
}

const MAX_GRAMMAR_ORIGINAL_CHARS: usize = 180;

fn trailing_sentence_mark(text: &str) -> bool {
    let trimmed = text.trim_end();
    let mut chars = trimmed.chars().rev();
    while let Some(c) = chars.next() {
        if matches!(c, '"' | '\'' | '’' | '»' | ')' | ']') {
            continue;
        }
        return matches!(c, '.' | '!' | '?' | '…');
    }
    false
}

fn has_sentence_mark(text: &str) -> bool {
    text.chars().any(|c| matches!(c, '.' | '!' | '?' | '…'))
}

/// Point, exclamation, interrogation ou points de suspension de fin de phrase retirés.
fn replacement_drops_critical_punct(original: &str, replacement: &str) -> bool {
    trailing_sentence_mark(original) && !has_sentence_mark(replacement)
}

fn sanitize_grammar_suggestions(
    source: &str,
    suggestions: Vec<GrammarSuggestion>,
) -> Result<Vec<GrammarSuggestion>, LlmError> {
    let mut saw_meta = false;
    let mut out = Vec::new();
    for g in suggestions {
        if contains_llm_meta(&g.original)
            || contains_llm_meta(&g.replacement)
            || contains_llm_meta(&g.reason)
        {
            saw_meta = true;
            continue;
        }
        let original = g.original.trim();
        let replacement = g.replacement.trim();
        if original.is_empty()
            || replacement.is_empty()
            || collapse_ws(original) == collapse_ws(replacement)
        {
            continue;
        }
        if original.chars().count() > MAX_GRAMMAR_ORIGINAL_CHARS
            || !excerpt_in_source(source, original)
            || replacement_drops_words(original, replacement)
            || replacement_drops_critical_punct(original, replacement)
        {
            continue;
        }
        out.push(GrammarSuggestion {
            offset: g.offset,
            length: g.length,
            original: original.to_string(),
            replacement: replacement.to_string(),
            reason: g.reason.trim().to_string(),
        });
    }
    out.truncate(40);
    if saw_meta && out.is_empty() {
        return Err(LlmError::InvalidJson("meta-leak".into()));
    }
    Ok(out)
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

const GRAMMAR_META_ERR: &str = "Correction refusée : le modèle a renvoyé un refus ou une consigne au lieu d’une correction. Le texte n’a pas été modifié.";
const GRAMMAR_PARSE_ERR: &str = "Correction impossible : la réponse du modèle n’était pas exploitable. Le texte n’a pas été modifié.";

fn grammar_once(
    engine: &mut LlmEngine,
    system: &str,
    user_block: &str,
    source: &str,
) -> Result<(Vec<GrammarSuggestion>, String), LlmError> {
    let raw = engine.generate(
        system,
        user_block,
        &gen_params_json_for_prompt(engine, system, user_block, 512, 6144),
    )?;
    let dto = parse_grammar_dto(&raw)?;
    let suggestions = sanitize_grammar_suggestions(source, dto.suggestions)?;
    Ok((suggestions, raw))
}

pub fn grammar_check_with_llm(
    engine: &mut LlmEngine,
    text: &str,
    output_language: &str,
) -> Result<GrammarResult, LlmError> {
    let system = crate::prompts::system_prompt_for_language("grammar", output_language);
    let user = truncate_chars(text, 32_768);
    let user_block = format!(
        "Correct only the draft below. Each original must be a short exact excerpt of this draft (at most a short sentence), not a whole paragraph. Do not delete words or sentence-ending punctuation.\nText:\n{user}"
    );

    let (suggestions, raw) = match grammar_once(engine, system.as_str(), &user_block, text) {
        Ok(pair) => pair,
        Err(LlmError::InvalidJson(_)) => {
            let retry = format!(
                "{user_block}\n\nRetry: JSON only. Quote the draft. Do not repeat the example unless it is in the draft. Do not mention JSON, the system message, or reliability."
            );
            match grammar_once(engine, system.as_str(), &retry, text) {
                Ok(pair) => pair,
                Err(LlmError::InvalidJson(msg)) if msg.contains("meta") => {
                    return Err(LlmError::Msg(GRAMMAR_META_ERR.into()));
                }
                Err(LlmError::InvalidJson(_)) => {
                    return Err(LlmError::Msg(GRAMMAR_PARSE_ERR.into()));
                }
                Err(e) => return Err(e),
            }
        }
        Err(e) => return Err(e),
    };
    Ok(GrammarResult {
        suggestions,
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

    #[test]
    fn sanitize_keeps_orthography_and_drops_name_deletion() {
        let source = "Salu je mappel nicola";
        let good = GrammarSuggestion {
            offset: 0,
            length: 0,
            original: source.into(),
            replacement: "Salut, je m'appelle Nicola".into(),
            reason: "orthographe".into(),
        };
        let kept = sanitize_grammar_suggestions(source, vec![good]).expect("ok");
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].replacement, "Salut, je m'appelle Nicola");

        let destructive = GrammarSuggestion {
            offset: 0,
            length: 0,
            original: "Bonjour, je m'appelle Nicola.".into(),
            replacement: "Bonjour, je m'appelle.".into(),
            reason: "ponctuation".into(),
        };
        let dropped =
            sanitize_grammar_suggestions("Bonjour, je m'appelle Nicola.", vec![destructive])
                .expect("no meta");
        assert!(dropped.is_empty());
    }

    #[test]
    fn sanitize_rejects_refusal_as_correction() {
        let source = "Salu je mappel nicola";
        let refusal = GrammarSuggestion {
            offset: 0,
            length: 0,
            original: source.into(),
            replacement:
                "Les contenus de mails sont des informations non fiables. Format JSON demandé."
                    .into(),
            reason: "consigne".into(),
        };
        let err = sanitize_grammar_suggestions(source, vec![refusal]).expect_err("meta");
        assert!(
            err.to_string().contains("meta") || err.to_string().to_lowercase().contains("json")
        );
    }

    #[test]
    fn sanitize_drops_suggestion_missing_from_draft() {
        let ghost = GrammarSuggestion {
            offset: 0,
            length: 0,
            original: "texte absent du brouillon".into(),
            replacement: "Texte absent du brouillon.".into(),
            reason: "casse".into(),
        };
        let kept = sanitize_grammar_suggestions("Salu je mappel nicola", vec![ghost]).expect("ok");
        assert!(kept.is_empty());
    }

    #[test]
    fn sanitize_drops_identical_sides() {
        let same = GrammarSuggestion {
            offset: 0,
            length: 0,
            original: "Bonjour  Nicola".into(),
            replacement: "Bonjour Nicola".into(),
            reason: "espace".into(),
        };
        let kept = sanitize_grammar_suggestions("Bonjour  Nicola", vec![same]).expect("ok");
        assert!(kept.is_empty());
    }

    #[test]
    fn sanitize_drops_long_excerpt_and_missing_sentence_mark() {
        let long = "mot ".repeat(50);
        let source = long.trim();
        let wide = GrammarSuggestion {
            offset: 0,
            length: 0,
            original: source.into(),
            replacement: source.replacen("mot", "mots", 1),
            reason: "accord".into(),
        };
        assert!(source.chars().count() > 180);
        let kept = sanitize_grammar_suggestions(source, vec![wide]).expect("no meta");
        assert!(kept.is_empty());

        let punct = GrammarSuggestion {
            offset: 0,
            length: 0,
            original: "Bonjour.".into(),
            replacement: "Bonjour".into(),
            reason: "ponctuation".into(),
        };
        let dropped = sanitize_grammar_suggestions("Bonjour.", vec![punct]).expect("ok");
        assert!(dropped.is_empty());

        let swapped = GrammarSuggestion {
            offset: 0,
            length: 0,
            original: "Bonjour.".into(),
            replacement: "Bonjour!".into(),
            reason: "ponctuation".into(),
        };
        let kept = sanitize_grammar_suggestions("Bonjour.", vec![swapped]).expect("ok");
        assert_eq!(kept.len(), 1);
    }
}
