//! Utilitaires communs pour les appels prompts + parsing JSON sortie modèle.

/// Marqueur d’erreur renvoyé quand l’utilisateur annule une génération LLM en cours.
pub const LLM_CANCELLED: &str = "llm_cancelled";

use serde::de::DeserializeOwned;
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::ai_llm_contracts::untrusted_mail_content_block;
use rustymail_domain::{AssistLlmTier, TokenBudgetReport};
use rustymail_llm::{redact_user_content_if_needed, LlmEngine, LlmError, LlmGenParams};

/// Contenu mail encadré pour prompt LLM ; redaction PII si le moteur exfiltre vers un tiers (OpenRouter, API distante).
pub(crate) fn untrusted_mail_for_engine(engine: &LlmEngine, label: &str, content: &str) -> String {
    let body = redact_user_content_if_needed(engine, content);
    untrusted_mail_content_block(label, &body)
}

/// Texte utilisateur (hors bloc « non fiable ») avec la même politique de redaction cloud.
pub(crate) fn user_text_for_engine(engine: &LlmEngine, content: &str) -> String {
    redact_user_content_if_needed(engine, content)
}

pub(crate) fn effective_n_ctx(engine: &LlmEngine) -> u32 {
    engine.n_ctx().max(1024)
}

pub(crate) fn prompt_token_count(engine: &LlmEngine, system: &str, user: &str) -> u32 {
    engine.token_count(&format!("{system}\n{user}")) as u32
}

/// Espace restant pour la sortie après prompt + marge (aligné `n_ctx` prefs / sonde llama-server).
pub(crate) fn output_room_after_prompt(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    ctx_slack: u32,
) -> u32 {
    effective_n_ctx(engine)
        .saturating_sub(prompt_token_count(engine, system, user))
        .saturating_sub(ctx_slack)
}

/// Plafond `max_tokens` HTTP : `min(max_souhaité, n_ctx − prompt − marge)`.
pub(crate) fn resolve_max_output_tokens(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    min: u32,
    max: u32,
    ctx_slack: u32,
) -> u32 {
    let room = output_room_after_prompt(engine, system, user, ctx_slack);
    if room == 0 {
        return 1;
    }
    let cap = max.min(room);
    if cap < min {
        return cap.max(1);
    }
    min.max(cap)
}

/// Sortie ~longueur d’un texte source (traduction, brouillon, adaptation de ton).
pub(crate) fn resolve_max_output_tokens_for_echo(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    echo_text: &str,
    min: u32,
    max: u32,
    ctx_slack: u32,
) -> u32 {
    let room = output_room_after_prompt(engine, system, user, ctx_slack);
    if room == 0 {
        return 1;
    }
    let echo_tokens = engine.token_count(echo_text) as u32;
    let need = echo_tokens
        .saturating_mul(5)
        .saturating_div(4)
        .saturating_add(256);
    let target = need.clamp(min, max);
    target.min(room).max(1)
}

pub(crate) fn gen_params_for_tier(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    tier: AssistLlmTier,
) -> LlmGenParams {
    let (min, max) = match tier {
        AssistLlmTier::Light => (512, 4096),
        AssistLlmTier::Heavy => (1024, 8192),
    };
    gen_params_json_for_prompt(engine, system, user, min, max)
}

pub(crate) fn gen_params_json_for_prompt(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    min: u32,
    max: u32,
) -> LlmGenParams {
    gen_params_json(resolve_max_output_tokens(
        engine, system, user, min, max, 64,
    ))
}

pub(crate) fn gen_params_json_for_prompt_with_grammar(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    min: u32,
    max: u32,
    grammar_gbnf: &str,
) -> LlmGenParams {
    gen_params_json_with_grammar(
        resolve_max_output_tokens(engine, system, user, min, max, 64),
        Some(grammar_gbnf),
    )
}

pub(crate) fn gen_params_json_echo_for_prompt(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    echo_text: &str,
    min: u32,
    max: u32,
) -> LlmGenParams {
    gen_params_json(resolve_max_output_tokens_for_echo(
        engine, system, user, echo_text, min, max, 64,
    ))
}

pub(crate) fn gen_params_text_for_prompt(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    min: u32,
    max: u32,
) -> LlmGenParams {
    gen_params_text(resolve_max_output_tokens(
        engine, system, user, min, max, 64,
    ))
}

pub(crate) fn gen_params_text_echo_for_prompt(
    engine: &LlmEngine,
    system: &str,
    user: &str,
    echo_text: &str,
    min: u32,
    max: u32,
) -> LlmGenParams {
    gen_params_text(resolve_max_output_tokens_for_echo(
        engine, system, user, echo_text, min, max, 64,
    ))
}

pub(crate) fn gen_params_json(max_tokens: u32) -> LlmGenParams {
    gen_params_json_with_grammar(max_tokens, None)
}

/// Place minimale pour une petite réponse JSON (intention, slots, faits, actions).
pub(crate) const MIN_ASSIST_JSON_OUTPUT_ROOM: u32 = 256;

const ASSIST_CTX_OVERFLOW_ERR: &str = "Assistant IA : la fenêtre de contexte ne laisse pas assez de place pour une réponse JSON complète. Augmentez n_ctx dans Paramètres → IA, ou ouvrez un fil plus court.";

/// Calage d’un prompt `prefix + fil tronqué + suffix` jusqu’à laisser de la place pour le JSON.
pub(crate) fn fit_fil_context_user(
    engine: &LlmEngine,
    system: &str,
    thread_context: &str,
    prefix: &str,
    suffix: &str,
    initial_max_chars: usize,
    min_output: u32,
    max_output: u32,
) -> Result<(String, LlmGenParams), LlmError> {
    let mut max_chars = thread_context
        .chars()
        .count()
        .min(initial_max_chars.max(400))
        .max(400);
    for _ in 0..28 {
        let ctx = truncate_chars(thread_context, max_chars);
        let user = format!("{prefix}{ctx}{suffix}");
        let room = output_room_after_prompt(engine, system, &user, 64);
        let max_tokens =
            resolve_max_output_tokens(engine, system, &user, min_output, max_output, 64);
        // Exiger la place demandée par l’appelant (pas seulement le plancher 256).
        let need = min_output.max(MIN_ASSIST_JSON_OUTPUT_ROOM);
        if room >= need && max_tokens >= need {
            return Ok((user, gen_params_json(max_tokens)));
        }
        if max_chars <= 500 {
            return Err(LlmError::Msg(ASSIST_CTX_OVERFLOW_ERR.into()));
        }
        max_chars = (max_chars * 2 / 3).max(500);
    }
    Err(LlmError::Msg(ASSIST_CTX_OVERFLOW_ERR.into()))
}

/// JSON tronqué / vide : mérite un second essai avec un fil plus court.
pub(crate) fn json_truncation_retryable(err: &LlmError) -> bool {
    match err {
        LlmError::InvalidJson(msg) => {
            let m = msg.to_ascii_lowercase();
            m.contains("eof")
                || m.contains("vide")
                || m.contains("sans json")
                || m.contains("missing field")
                || m.contains("réparation")
                || m.contains("expected")
                ||             m.contains("tronqu")
                || m.contains("incomplet")
                || m.contains("intention vide")
                || m.contains("diagnosis")
        }
        LlmError::Msg(msg) => {
            let m = msg.to_ascii_lowercase();
            m.contains("vide") || m.contains("empty") || m.contains("diagnostic manquant")
        }
        _ => false,
    }
}

/// Génère + parse JSON avec calage du fil, puis un essai compact si la sortie est tronquée.
pub(crate) fn generate_fil_json<T: DeserializeOwned>(
    engine: &mut LlmEngine,
    system: &str,
    thread_context: &str,
    prefix: &str,
    suffix: &str,
    initial_max_chars: usize,
    min_output: u32,
    max_output: u32,
) -> Result<T, LlmError> {
    let (user, params) = fit_fil_context_user(
        engine,
        system,
        thread_context,
        prefix,
        suffix,
        initial_max_chars,
        min_output,
        max_output,
    )?;
    let raw = engine.generate(system, &user, &params)?;
    match parse_model_json::<T>(&raw) {
        Ok(v) => Ok(v),
        Err(first) if json_truncation_retryable(&first) => {
            // Second essai : budget fil nettement plus petit que le premier calage.
            let first_chars = thread_context.chars().count().min(initial_max_chars.max(400));
            let compact_chars = ((first_chars * 2) / 5).clamp(800, 2_400);
            let (user2, params2) = fit_fil_context_user(
                engine,
                system,
                thread_context,
                prefix,
                suffix,
                compact_chars,
                min_output,
                max_output,
            )?;
            let raw2 = engine.generate(system, &user2, &params2)?;
            parse_model_json(&raw2).map_err(|e2| {
                LlmError::InvalidJson(format!(
                    "Réponse JSON incomplète ou tronquée ({first}). Nouvel essai: {e2}"
                ))
            })
        }
        Err(e) => Err(e),
    }
}

pub(crate) fn gen_params_json_with_grammar(
    max_tokens: u32,
    grammar_gbnf: Option<&str>,
) -> LlmGenParams {
    LlmGenParams {
        max_tokens,
        temperature: 0.15,
        top_p: 0.92,
        stop: Vec::new(),
        grammar_gbnf: grammar_gbnf.map(str::to_string),
    }
}

pub(crate) fn gen_params_text(max_tokens: u32) -> LlmGenParams {
    LlmGenParams {
        max_tokens,
        temperature: 0.35,
        top_p: 0.92,
        stop: Vec::new(),
        grammar_gbnf: None,
    }
}

pub(crate) fn budget_report(
    n_ctx_hint: u32,
    engine: &LlmEngine,
    system: &str,
    user: &str,
    output: Option<&str>,
    input_truncated: bool,
) -> TokenBudgetReport {
    let input = engine.token_count(&format!("{system}\n{user}"));
    TokenBudgetReport {
        n_ctx: n_ctx_hint,
        input_tokens: input as u32,
        output_tokens: output.map(|o| engine.token_count(o) as u32).unwrap_or(0),
        truncated: input_truncated,
        strategy: "local_llm".into(),
        items_in: 0,
        items_used: 0,
    }
}

/// Profondeur de structures JSON non fermées (hors chaînes).
fn json_unclosed_depth(s: &str) -> usize {
    let mut stack: Vec<char> = Vec::new();
    let mut in_string = false;
    let mut escape = false;
    for c in s.chars() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if c == '\\' {
                escape = true;
                continue;
            }
            if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' => stack.push('}'),
            '[' => stack.push(']'),
            '}' | ']' => {
                if stack.last() == Some(&c) {
                    stack.pop();
                }
            }
            _ => {}
        }
    }
    stack.len()
}

/// Retire un bloc ``` … ``` (balise de langue optionnelle). Le texte hors clôture est ignoré
/// seulement si l’intérieur contient un objet ou un tableau.
fn markdown_fenced_json(raw: &str) -> Option<String> {
    let t = raw.trim().trim_start_matches('\u{feff}');
    let start = t.find("```")?;
    let after = &t[start + 3..];
    let after = after.trim_start_matches('\u{feff}');
    let (body, closed) = if let Some(end) = after.find("```") {
        (after[..end].trim(), true)
    } else {
        (after.trim(), false)
    };
    let body = strip_fence_language_line(body);
    if body.contains('{') || body.contains('[') {
        Some(body.to_string())
    } else if closed {
        None
    } else {
        Some(body.to_string())
    }
}

fn strip_fence_language_line(body: &str) -> &str {
    let Some(nl) = body.find(['\n', '\r']) else {
        return body
            .strip_prefix("json")
            .or_else(|| body.strip_prefix("JSON"))
            .unwrap_or(body)
            .trim_start();
    };
    let first = body[..nl].trim();
    let lang = !first.is_empty()
        && !first.contains('{')
        && !first.contains('[')
        && first
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '+');
    if lang {
        body[nl + 1..].trim_start()
    } else {
        body
    }
}

fn prepare_json_source(raw: &str) -> String {
    let t = raw.trim().trim_start_matches('\u{feff}');
    if let Some(inner) = markdown_fenced_json(t) {
        if inner.contains('{') || inner.contains('[') {
            return inner;
        }
    }
    t.to_string()
}

/// Fin du premier objet/tableau JSON valide (le décodeur s’arrête avant le texte qui suit).
fn first_json_value_end(slice: &str) -> Option<usize> {
    let mut stream = serde_json::Deserializer::from_str(slice).into_iter::<serde_json::Value>();
    let value = stream.next()?.ok()?;
    match value {
        serde_json::Value::Object(_) | serde_json::Value::Array(_) => Some(stream.byte_offset()),
        _ => None,
    }
}

/// Fin d’un objet/tableau équilibré (chaînes respectées), même s’il reste des virgules trainantes.
fn balanced_json_end(slice: &str) -> Option<usize> {
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
    let mut started = false;
    for (i, c) in slice.char_indices() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if c == '\\' {
                escape = true;
                continue;
            }
            if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' | '[' => {
                depth += 1;
                started = true;
            }
            '}' | ']' => {
                depth -= 1;
                if started && depth == 0 {
                    return Some(i + c.len_utf8());
                }
                if depth < 0 {
                    return None;
                }
            }
            _ => {}
        }
    }
    None
}

fn next_json_opener(s: &str) -> Option<usize> {
    s.find(['{', '['])
}

/// Premier objet ou tableau JSON : fences markdown retirées, texte après une valeur valide ignoré.
/// Un document tronqué (accolades non fermées) est conservé pour la réparation.
pub(crate) fn extract_json_candidate(raw: &str) -> String {
    let t = prepare_json_source(raw);
    let t = t.trim();
    let mut search = 0usize;
    while let Some(rel) = next_json_opener(&t[search..]) {
        let start = search + rel;
        let slice = &t[start..];
        if let Some(end) = first_json_value_end(slice) {
            return slice[..end].to_string();
        }
        if let Some(end) = balanced_json_end(slice) {
            return slice[..end].to_string();
        }
        if json_unclosed_depth(slice) > 0 {
            return slice.to_string();
        }
        search = start + slice.chars().next().map(|c| c.len_utf8()).unwrap_or(1);
    }
    t.to_string()
}

/// Échappe les contrôles bruts (saut de ligne, tab) à l’intérieur des chaînes JSON.
/// Les modèles les émettent souvent dans `translatedText` / `text`, ce qui fait échouer `serde_json`.
pub(crate) fn escape_controls_inside_json_strings(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_string = false;
    let mut escape = false;
    for c in s.chars() {
        if in_string {
            if escape {
                escape = false;
                out.push(c);
                continue;
            }
            if c == '\\' {
                escape = true;
                out.push(c);
                continue;
            }
            if c == '"' {
                in_string = false;
                out.push(c);
                continue;
            }
            match c {
                '\n' => out.push_str("\\n"),
                '\r' => out.push_str("\\r"),
                '\t' => out.push_str("\\t"),
                c if c.is_control() => {
                    out.push_str(&format!("\\u{:04x}", u32::from(c)));
                }
                c => out.push(c),
            }
            continue;
        }
        if c == '"' {
            in_string = true;
        }
        out.push(c);
    }
    out
}

pub(crate) fn normalize_json_loose(s: &str) -> String {
    let mut t = s.replace('\u{00a0}', " ");
    t = t.replace('“', "\"");
    t = t.replace('”', "\"");
    t = t.replace('‘', "'");
    t = t.replace('’', "'");
    t = escape_controls_inside_json_strings(&t);
    while t.contains(",}") {
        t = t.replace(",}", "}");
    }
    while t.contains(",]") {
        t = t.replace(",]", "]");
    }
    t
}

/// Dernière virgule hors chaîne, à une profondeur > 0 (séparateur de champ ou d’élément).
fn last_value_comma(s: &str) -> Option<usize> {
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
    let mut last: Option<usize> = None;
    for (i, c) in s.char_indices() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if c == '\\' {
                escape = true;
                continue;
            }
            if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' | '[' => depth += 1,
            '}' | ']' => depth -= 1,
            ',' if depth > 0 => last = Some(i),
            _ => {}
        }
    }
    last
}

/// Ferme chaînes / tableaux / objets ouverts (sortie LLM coupée par max_tokens).
pub(crate) fn close_truncated_json(s: &str) -> String {
    let mut out = s.trim_end().to_string();
    let mut in_string = false;
    let mut escape = false;
    let mut stack: Vec<char> = Vec::new();
    for c in out.chars() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if c == '\\' {
                escape = true;
                continue;
            }
            if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' => stack.push('}'),
            '[' => stack.push(']'),
            '}' | ']' => {
                if stack.last() == Some(&c) {
                    stack.pop();
                }
            }
            _ => {}
        }
    }
    if in_string {
        out.push('"');
    }
    while out.ends_with(',') || out.ends_with(':') {
        out.pop();
    }
    while let Some(closer) = stack.pop() {
        out.push(closer);
    }
    out
}

/// Retire les éléments incomplets en queue, y compris le JSON indenté (`",\\n    {"`).
fn repair_truncated_json_drop_tail(s: &str) -> Option<String> {
    let mut base = s.trim().to_string();
    for _ in 0..48 {
        let closed = close_truncated_json(&base);
        if serde_json::from_str::<serde_json::Value>(&closed).is_ok() {
            return Some(closed);
        }
        let Some(pos) = last_value_comma(&base) else {
            break;
        };
        base = base[..pos].to_string();
    }
    None
}

fn parse_json_with_optional_repair<T: DeserializeOwned>(s: &str) -> Result<(T, bool), LlmError> {
    let normalized = normalize_json_loose(s);
    match serde_json::from_str::<T>(&normalized) {
        Ok(v) => Ok((v, false)),
        Err(e) => {
            let msg = e.to_string();
            let repairable = msg.contains("EOF")
                || msg.contains("expected")
                || msg.contains("trailing")
                || msg.contains("missing field")
                || json_unclosed_depth(&normalized) > 0;
            if !repairable {
                return Err(LlmError::InvalidJson(msg));
            }
            let repaired = close_truncated_json(&normalized);
            if let Ok(v) = serde_json::from_str::<T>(&repaired) {
                return Ok((v, true));
            }
            if let Some(dropped) = repair_truncated_json_drop_tail(&normalized) {
                return serde_json::from_str(&dropped)
                    .map(|v| (v, true))
                    .map_err(|e3| LlmError::InvalidJson(format!("{msg} — réparation: {e3}")));
            }
            serde_json::from_str(&repaired)
                .map(|v| (v, true))
                .map_err(|e2| LlmError::InvalidJson(format!("{msg} — réparation: {e2}")))
        }
    }
}

pub(crate) struct ParsedModelJson<T> {
    pub value: T,
    pub repaired: bool,
}

pub(crate) fn parse_model_json_ex<T: DeserializeOwned>(
    raw: &str,
) -> Result<ParsedModelJson<T>, LlmError> {
    if raw.trim().is_empty() {
        return Err(LlmError::InvalidJson(
            "Réponse du modèle vide : aucun JSON exploitable.".into(),
        ));
    }
    let s = extract_json_candidate(raw);
    if !s.contains('{') && !s.contains('[') {
        return Err(LlmError::InvalidJson(
            "Réponse du modèle sans JSON exploitable (objet ou tableau attendu).".into(),
        ));
    }
    let (value, repaired) = parse_json_with_optional_repair(&s)?;
    Ok(ParsedModelJson { value, repaired })
}

pub(crate) fn parse_model_json<T: DeserializeOwned>(raw: &str) -> Result<T, LlmError> {
    parse_model_json_ex(raw).map(|parsed| parsed.value)
}

pub(crate) fn truncate_chars(text: &str, max_chars: usize) -> String {
    if text.len() <= max_chars {
        return text.to_string();
    }
    let mut cut = text.chars().take(max_chars).collect::<String>();
    cut.push_str("\n…[tronqué]");
    cut
}

/// Callback `generate_streaming` : annule si le drapeau est levé.
pub(crate) fn stream_chunk_or_cancel<E>(
    cancelled: &AtomicBool,
    piece: &str,
    on_chunk: &mut impl FnMut(&str),
) -> ControlFlow<Result<(), E>>
where
    E: std::fmt::Display,
{
    if cancelled.load(Ordering::Relaxed) {
        return ControlFlow::Break(Ok(()));
    }
    on_chunk(piece);
    ControlFlow::Continue(())
}

pub(crate) fn cancelled_llm_err(cancelled: &AtomicBool) -> Option<LlmError> {
    if cancelled.load(Ordering::Relaxed) {
        Some(LlmError::Msg(LLM_CANCELLED.into()))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_truncated_json_repairs_eof_list() {
        let partial = r#"{
  "changes": [],
  "decisions": [
    {"rank": 1, "title": "x", "impact": "y", "optionsHint": ["a"
"#;
        let repaired = close_truncated_json(partial);
        let v: serde_json::Value = serde_json::from_str(&repaired).expect("valid json");
        assert!(v.get("decisions").is_some());
    }

    #[test]
    fn extract_json_candidate_keeps_truncated_outer_object() {
        let partial = r#"{"a": [{"b": 1}"#;
        let cand = extract_json_candidate(partial);
        assert!(cand.starts_with('{'));
        assert!(json_unclosed_depth(&cand) > 0);
    }

    #[test]
    fn extract_json_drops_fences_and_trailing_object() {
        let raw = "Voici l’orientation :\n```json\n{\"diagnosis\":\"ok\",\"recommendations\":[],\"actions\":[]}\n```\n{\"note\":1}\n";
        let cand = extract_json_candidate(raw);
        let v: serde_json::Value = serde_json::from_str(&cand).expect("first object");
        assert_eq!(v["diagnosis"], "ok");
        assert!(v.get("note").is_none());
    }

    #[test]
    fn parse_model_json_tolerates_trailing_characters() {
        let raw = "{\n  \"diagnosis\": \"boîte encombrée\"\n}\n\n{\"diagnosis\":\"deuxième\"}\n";
        let v: serde_json::Value = parse_model_json(raw).expect("first value");
        assert_eq!(v["diagnosis"], "boîte encombrée");
    }

    #[test]
    fn parse_model_json_ex_flags_repaired_truncation() {
        let complete = r#"{"changes":[{"summary":"ok"}]}"#;
        let parsed = parse_model_json_ex::<serde_json::Value>(complete).expect("complete");
        assert!(!parsed.repaired);
        assert_eq!(parsed.value["changes"][0]["summary"], "ok");

        let partial = r#"{"changes":[{"summary":"ok"},{"summary":"#;
        let parsed = parse_model_json_ex::<serde_json::Value>(partial).expect("repaired");
        assert!(parsed.repaired);
        assert_eq!(parsed.value["changes"][0]["summary"], "ok");
    }

    #[test]
    fn parse_model_json_reports_when_no_json_remains() {
        let err = parse_model_json::<serde_json::Value>("Je ne peux pas répondre en JSON.")
            .expect_err("prose");
        let msg = err.to_string();
        assert!(msg.contains("sans JSON exploitable"), "{msg}");
    }

    #[test]
    fn repair_drops_incomplete_object_in_facts_array() {
        let partial = r#"{"facts":[{"kind":"request","text":"Devis","messageIds":[]},{"kind":"deadline","tex"#;
        let (v, repaired): (serde_json::Value, bool) =
            parse_json_with_optional_repair(partial).expect("facts json repaired");
        assert!(repaired);
        let facts = v["facts"].as_array().expect("facts");
        assert!(!facts.is_empty());
        assert_eq!(facts[0]["text"], "Devis");
        assert!(facts.iter().all(|fact| {
            fact.as_object()
                .map(|o| !o.contains_key("tex"))
                .unwrap_or(false)
        }));
    }

    #[test]
    fn parse_escapes_raw_newline_inside_string() {
        let raw = "{\"text\":\"ligne1\nligne2\"}";
        let v: serde_json::Value = parse_model_json(raw).expect("newline in string");
        assert_eq!(v["text"], "ligne1\nligne2");
    }

    #[test]
    fn repair_pretty_printed_truncated_brief() {
        let partial = "{\n  \"changes\": [\n    {\"id\": \"1\", \"summary\": \"ok\"},\n    {\"id\": \"2\", \"summary\":";
        let (v, repaired): (serde_json::Value, bool) =
            parse_json_with_optional_repair(partial).expect("pretty brief repaired");
        assert!(repaired);
        let changes = v["changes"].as_array().expect("changes");
        assert!(!changes.is_empty());
        assert_eq!(changes[0]["summary"], "ok");
    }

    #[test]
    fn resolve_output_respects_n_ctx_room() {
        use rustymail_llm::LlmEngine;
        let mut engine = LlmEngine::open_ai_compatible(
            "http://127.0.0.1:8080/v1".into(),
            "test".into(),
            String::new(),
        )
        .expect("engine");
        engine.set_n_ctx_probe(4096);
        let out = resolve_max_output_tokens(&engine, "system", "user prompt", 512, 8192, 64);
        assert!((512..=4096).contains(&out));
    }

    #[test]
    fn fit_fil_context_leaves_json_output_room() {
        use rustymail_llm::LlmEngine;
        let mut engine = LlmEngine::open_ai_compatible(
            "http://127.0.0.1:8080/v1".into(),
            "test".into(),
            String::new(),
        )
        .expect("engine");
        engine.set_n_ctx_probe(4096);
        let system = "Tu analyses un fil et réponds en JSON.";
        let huge = "x".repeat(80_000);
        let (user, params) = fit_fil_context_user(
            &engine,
            system,
            &huge,
            "Fil :\n",
            "",
            24_000,
            256,
            768,
        )
        .expect("fit");
        let room = output_room_after_prompt(&engine, system, &user, 64);
        assert!(
            room >= MIN_ASSIST_JSON_OUTPUT_ROOM,
            "room collapsed ({room})"
        );
        assert!(params.max_tokens >= 128, "max_tokens={}", params.max_tokens);
    }
}
