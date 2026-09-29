use std::collections::HashSet;
use std::convert::Infallible;
use std::ops::ControlFlow;
use std::sync::atomic::AtomicBool;

use serde::Deserialize;

use crate::ai_llm_contracts::{validate_summary_llm_shape, SUMMARY_THREAD_JSON_GBNF};
use crate::ai_llm_util::{
    budget_report, cancelled_llm_err, gen_params_json_for_prompt, parse_model_json,
    stream_chunk_or_cancel, truncate_chars, untrusted_mail_for_engine,
};
use rustymail_domain::{DiscussionThreadView, Message, TokenBudgetReport};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct SummaryResult {
    pub title: String,
    pub bullets: Vec<String>,
    pub source_message_ids: Vec<String>,
    #[serde(default)]
    pub budget: TokenBudgetReport,
}

pub fn summarize_message(message: &Message) -> SummaryResult {
    let first_lines = message
        .plain_body
        .lines()
        .filter(|line| !line.trim().is_empty())
        .take(3)
        .map(|line| line.trim().to_string())
        .collect::<Vec<_>>();

    SummaryResult {
        title: message.subject.clone(),
        bullets: if first_lines.is_empty() {
            vec!["No readable content found.".to_string()]
        } else {
            first_lines
        },
        source_message_ids: vec![message.id.0.clone()],
        budget: TokenBudgetReport::empty_stub(),
    }
}

/// Réponse courte quand le fil est classé « expéditeur automatique » : pas de parcours « synthèse » sur le corps
/// (aujourd’hui module local ; prêt pour ignorer un futur résumé IA sur ce type d’envoi).
pub fn newsletter_light_summary(thread: &DiscussionThreadView) -> SummaryResult {
    SummaryResult {
        title: thread.subject.clone(),
        bullets: vec![
            "Fil détecté comme envoi automatique (noreply, notification, etc.) : pas d’aperçu synthétique pour ce message."
                .to_string(),
        ],
        source_message_ids: thread
            .messages
            .iter()
            .map(|message| message.message_id.clone())
            .collect(),
        budget: TokenBudgetReport::empty_stub(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SummaryLlmDto {
    #[serde(default)]
    title: String,
    #[serde(default)]
    bullets: Vec<String>,
    #[serde(default)]
    source_message_ids: Vec<String>,
}

fn transcript_for_summary(view: &DiscussionThreadView) -> String {
    let mut parts = Vec::with_capacity(view.messages.len().min(42) + 1);
    parts.push(format!("Sujet du fil : {}\n", view.subject));
    for message in view.messages.iter().take(40) {
        parts.push(format!(
            "[message_id={}] {}\n{}\n",
            message.message_id,
            message.sender,
            truncate_chars(message.cleaned_text.as_str(), 4000),
        ));
    }
    parts.join("\n")
}

fn filter_evidence(ids: &[String], view: &DiscussionThreadView) -> Vec<String> {
    let ok: HashSet<&str> = view
        .messages
        .iter()
        .map(|m| m.message_id.as_str())
        .collect();
    ids.iter()
        .filter(|id| ok.contains(id.as_str()))
        .cloned()
        .take(20)
        .collect()
}

fn summary_system(lang: &str) -> String {
    let ctx = crate::prompts::PromptCtx::from_language(lang);
    crate::prompts::system_prompt("summary", &ctx).unwrap_or_default()
}

/// Message d’état quand la sortie du modèle ne contient pas une synthèse lisible.
const SUMMARY_UNREADABLE_FR: &str =
    "Résumé indisponible : la réponse du modèle n’a pas pu être lue.";

fn is_conversation_index_marker(text: &str) -> bool {
    let t = text.trim();
    if marker_line(t) {
        return true;
    }
    if let Some((_, rest)) = t.rsplit_once(':') {
        if marker_line(rest.trim()) {
            return true;
        }
    }
    false
}

fn marker_line(text: &str) -> bool {
    let t = text.trim();
    if t.len() < 8 || !t.starts_with("===") || !t.ends_with("===") {
        return false;
    }
    let inner = t.trim_matches('=').trim();
    let Some(rest) = inner.strip_prefix('[') else {
        return false;
    };
    let Some((num, _)) = rest.split_once(']') else {
        return false;
    };
    !num.is_empty() && num.chars().all(|c| c.is_ascii_digit())
}

fn looks_like_raw_summary_json(text: &str) -> bool {
    let t = text
        .trim()
        .strip_prefix("(extrait modèle)")
        .map(str::trim)
        .unwrap_or(text.trim());
    (t.contains("\"title\"") && t.contains("\"bullets\""))
        || (t.contains("\\\"title\\\"") && t.contains("\\\"bullets\\\""))
}

fn bullet_is_noise(text: &str) -> bool {
    let t = text.trim();
    t.is_empty()
        || t.starts_with("(extrait modèle)")
        || is_conversation_index_marker(t)
        || looks_like_raw_summary_json(t)
}

fn json_key_positions(text: &str, key: &str) -> Vec<usize> {
    let pattern = format!("\"{key}\"");
    let mut out = Vec::new();
    let mut search = 0usize;
    while let Some(rel) = text[search..].find(&pattern) {
        let idx = search + rel;
        let before_ok = text[..idx]
            .chars()
            .next_back()
            .map(|c| !c.is_ascii_alphanumeric() && c != '_')
            .unwrap_or(true);
        if before_ok {
            out.push(idx);
        }
        search = idx + pattern.len();
        if out.len() >= 16 {
            break;
        }
    }
    out
}

fn value_start_after_key(text: &str, key_idx: usize, key: &str) -> Option<usize> {
    let after = key_idx + key.len() + 2;
    let rest = text.get(after..)?;
    let trimmed = rest.trim_start();
    if !trimmed.starts_with(':') {
        return None;
    }
    let colon_pad = rest.len() - trimmed.len();
    let after_colon = trimmed[1..].trim_start();
    let value_pad = trimmed[1..].len() - after_colon.len();
    Some(after + colon_pad + 1 + value_pad)
}

/// Lit une chaîne JSON à partir du guillemet ouvrant. Une chaîne coupée s’arrête avant un
/// retour ligne brut (extrait collé à d’autres puces) et reste exploitable.
fn read_json_string(text: &str, quote_idx: usize) -> Option<(String, usize, bool)> {
    let bytes = text.as_bytes();
    if quote_idx >= bytes.len() || bytes[quote_idx] != b'"' {
        return None;
    }
    let mut i = quote_idx + 1;
    let mut out = String::new();
    let mut escape = false;
    while i < text.len() {
        let c = text[i..].chars().next()?;
        let clen = c.len_utf8();
        if escape {
            match c {
                'n' => out.push('\n'),
                'r' => out.push('\r'),
                't' => out.push('\t'),
                'u' => {
                    let hex_start = i + clen;
                    let hex_end = (hex_start + 4).min(text.len());
                    let hex = &text[hex_start..hex_end];
                    if hex.len() == 4 && hex.chars().all(|h| h.is_ascii_hexdigit()) {
                        if let Ok(cp) = u32::from_str_radix(hex, 16) {
                            if let Some(ch) = char::from_u32(cp) {
                                out.push(ch);
                            }
                        }
                        i = hex_end;
                        escape = false;
                        continue;
                    }
                    out.push('u');
                }
                other => out.push(other),
            }
            escape = false;
            i += clen;
            continue;
        }
        if c == '\\' {
            escape = true;
            i += clen;
            continue;
        }
        if c == '"' {
            return Some((out, i + clen, true));
        }
        if c == '\n' || c == '\r' {
            let trimmed = out.trim().to_string();
            if trimmed.is_empty() {
                return None;
            }
            return Some((trimmed, i, false));
        }
        out.push(c);
        i += clen;
    }
    let trimmed = out.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some((trimmed, text.len(), false))
    }
}

fn read_string_array(text: &str, bracket_idx: usize) -> Vec<String> {
    if !text[bracket_idx..].starts_with('[') {
        return Vec::new();
    }
    let mut i = bracket_idx + 1;
    let mut out = Vec::new();
    while i < text.len() {
        let rest = text[i..].trim_start();
        i += text[i..].len() - rest.len();
        if i >= text.len() {
            break;
        }
        let c = text[i..].chars().next().unwrap_or('\0');
        if c == ']' {
            break;
        }
        if c == ',' {
            i += 1;
            continue;
        }
        if c == '"' {
            let Some((s, next, _)) = read_json_string(text, i) else {
                break;
            };
            let t = s.trim();
            if !t.is_empty() {
                out.push(t.to_string());
            }
            if next <= i {
                break;
            }
            i = next;
            continue;
        }
        match text[i..].find([',', ']']) {
            Some(rel) if text[i + rel..].starts_with(',') => i += rel + 1,
            _ => break,
        }
    }
    out
}

fn best_string_array(text: &str, key: &str) -> Option<(usize, Vec<String>)> {
    let mut best: Option<(usize, Vec<String>)> = None;
    for idx in json_key_positions(text, key) {
        let Some(vstart) = value_start_after_key(text, idx, key) else {
            continue;
        };
        if !text[vstart..].starts_with('[') {
            continue;
        }
        let items = read_string_array(text, vstart);
        let better = best
            .as_ref()
            .map(|(_, prev)| items.len() > prev.len())
            .unwrap_or(true);
        if better && !items.is_empty() {
            best = Some((idx, items));
        }
    }
    best
}

fn string_field_before(text: &str, key: &str, before: usize) -> Option<String> {
    let mut found = None;
    for idx in json_key_positions(text, key) {
        if idx >= before {
            break;
        }
        let Some(vstart) = value_start_after_key(text, idx, key) else {
            continue;
        };
        if !text[vstart..].starts_with('"') {
            continue;
        }
        if let Some((s, _, _)) = read_json_string(text, vstart) {
            if !s.trim().is_empty() {
                found = Some(s);
            }
        }
    }
    found
}

fn first_string_field(text: &str, key: &str) -> Option<String> {
    string_field_before(text, key, usize::MAX)
}

fn find_enclosing_object_start(text: &str, idx: usize) -> Option<usize> {
    let mut in_string = false;
    let mut escape = false;
    let mut stack: Vec<usize> = Vec::new();
    let mut i = 0usize;
    while i < idx && i < text.len() {
        let c = text[i..].chars().next()?;
        let clen = c.len_utf8();
        if in_string {
            if escape {
                escape = false;
            } else if c == '\\' {
                escape = true;
            } else if c == '"' {
                in_string = false;
            }
            i += clen;
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' => stack.push(i),
            '}' => {
                stack.pop();
            }
            _ => {}
        }
        i += clen;
    }
    stack.last().copied()
}

fn balanced_end_from(text: &str, start: usize) -> Option<usize> {
    let slice = text.get(start..)?;
    if !slice.starts_with('{') && !slice.starts_with('[') {
        return None;
    }
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
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
            '{' | '[' => depth += 1,
            '}' | ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(start + i + c.len_utf8());
                }
            }
            _ => {}
        }
    }
    None
}

fn object_span_containing(text: &str, idx: usize) -> (usize, usize) {
    let start = find_enclosing_object_start(text, idx).unwrap_or(0);
    let end = balanced_end_from(text, start).unwrap_or(text.len());
    (start, end.max(start).min(text.len()))
}

fn lenient_summary_dto(text: &str) -> Option<SummaryLlmDto> {
    let Some((anchor, bullets_from_scan)) = best_string_array(text, "bullets") else {
        let bullets = first_string_field(text, "bullets")
            .map(|s| {
                s.lines()
                    .map(str::trim)
                    .filter(|l| !l.is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let title = first_string_field(text, "title").unwrap_or_default();
        if title.trim().is_empty() && bullets.is_empty() {
            return None;
        }
        return Some(SummaryLlmDto {
            title,
            bullets,
            source_message_ids: Vec::new(),
        });
    };
    let (start, end) = object_span_containing(text, anchor);
    let slice = &text[start..end];
    let bullets = best_string_array(slice, "bullets")
        .map(|(_, items)| items)
        .filter(|items| !items.is_empty())
        .unwrap_or(bullets_from_scan);
    let title = first_string_field(slice, "title").unwrap_or_default();
    if title.trim().is_empty() && bullets.is_empty() {
        return None;
    }
    let mut source_message_ids = best_string_array(slice, "sourceMessageIds")
        .map(|(_, ids)| ids)
        .unwrap_or_default();
    if source_message_ids.is_empty() {
        source_message_ids = best_string_array(slice, "source_message_ids")
            .map(|(_, ids)| ids)
            .unwrap_or_default();
    }
    Some(SummaryLlmDto {
        title,
        bullets,
        source_message_ids,
    })
}

fn escape_controls_in_json_strings(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut in_string = false;
    let mut escape = false;
    for c in raw.chars() {
        if in_string {
            if escape {
                out.push(c);
                escape = false;
                continue;
            }
            if c == '\\' {
                out.push(c);
                escape = true;
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
                _ => out.push(c),
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

/// Décode `\"` / `\\` pour un JSON de synthèse enfermé dans une chaîne.
fn unescape_embedded_quotes(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.peek().copied() {
                Some('"') | Some('\\') => {
                    out.push(chars.next().unwrap());
                    continue;
                }
                _ => {}
            }
        }
        out.push(c);
    }
    out
}

fn push_unique(out: &mut Vec<String>, s: String) {
    let t = s.trim().to_string();
    if t.len() < 12 || out.iter().any(|e| e == &t) || out.len() >= 24 {
        return;
    }
    out.push(t);
}

fn summary_json_candidates(raw: &str) -> Vec<String> {
    let mut bases = vec![raw.to_string(), escape_controls_in_json_strings(raw)];
    if raw.contains("\\\"") {
        bases.push(unescape_embedded_quotes(raw));
    }
    let mut out = Vec::new();
    for base in bases {
        push_unique(&mut out, base.clone());
        let mut braces = 0usize;
        for (i, c) in base.char_indices() {
            if c != '{' {
                continue;
            }
            push_unique(&mut out, base[i..].to_string());
            braces += 1;
            if braces >= 8 {
                break;
            }
        }
        if let Some(&idx) = json_key_positions(&base, "title").first() {
            let from = base[idx..].trim_start();
            if !from.starts_with('{') {
                push_unique(&mut out, format!("{{{from}"));
            }
        }
        if out.len() >= 24 {
            break;
        }
    }
    out
}

fn score_summary_dto(dto: &SummaryLlmDto) -> i32 {
    let bullets = dto.bullets.iter().filter(|b| !bullet_is_noise(b)).count() as i32;
    let title_ok = {
        let t = dto.title.trim();
        !t.is_empty() && !bullet_is_noise(t)
    };
    if bullets == 0 && !title_ok {
        return 0;
    }
    bullets * 10 + i32::from(title_ok) * 4
}

fn summary_richness(dto: &SummaryLlmDto) -> usize {
    dto.title.chars().count()
        + dto
            .bullets
            .iter()
            .filter(|b| !bullet_is_noise(b))
            .map(|b| b.chars().count())
            .sum::<usize>()
}

fn best_summary_dto(raw: &str) -> Option<SummaryLlmDto> {
    let mut best_score = 0i32;
    let mut best_chars = 0usize;
    let mut best: Option<SummaryLlmDto> = None;
    let mut consider = |dto: SummaryLlmDto| {
        let score = score_summary_dto(&dto);
        let chars = summary_richness(&dto);
        if score > best_score || (score == best_score && score > 0 && chars > best_chars) {
            best_score = score;
            best_chars = chars;
            best = Some(dto);
        }
    };
    for cand in summary_json_candidates(raw) {
        if let Ok(dto) = parse_model_json::<SummaryLlmDto>(&cand) {
            consider(dto);
        }
        if let Some(dto) = lenient_summary_dto(&cand) {
            consider(dto);
        }
    }
    best
}

fn clean_bullet_text(text: &str) -> String {
    let mut kept = Vec::new();
    for line in text.lines() {
        let t = line.trim().trim_start_matches(['-', '•']).trim();
        if t.is_empty() {
            continue;
        }
        if bullet_is_noise(t) {
            break;
        }
        kept.push(t);
    }
    kept.join(" ")
}

fn clamp_summary_dto(dto: &mut SummaryLlmDto) {
    dto.title = dto.title.trim().chars().take(260).collect();
    let mut bullets = Vec::new();
    for b in dto.bullets.drain(..) {
        let cleaned = clean_bullet_text(&b);
        if bullet_is_noise(&cleaned) {
            continue;
        }
        let clipped: String = cleaned.chars().take(300).collect();
        if clipped.is_empty() {
            continue;
        }
        bullets.push(clipped);
        if bullets.len() == 8 {
            break;
        }
    }
    dto.bullets = bullets;
    if dto.source_message_ids.len() > 40 {
        dto.source_message_ids.truncate(40);
    }
}

fn unreadable_summary(
    raw: &str,
    view: &DiscussionThreadView,
    engine: &mut LlmEngine,
    system: &str,
    user: &str,
) -> Result<SummaryResult, LlmError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() < 24 {
        return Err(LlmError::InvalidJson(
            "Réponse du modèle sans synthèse JSON exploitable.".into(),
        ));
    }
    let mut fallback = SummaryResult {
        title: view.subject.clone(),
        bullets: vec![SUMMARY_UNREADABLE_FR.to_string()],
        source_message_ids: view
            .messages
            .iter()
            .map(|message| message.message_id.clone())
            .collect(),
        budget: budget_report(
            engine.n_ctx(),
            engine,
            system,
            user,
            Some(raw),
            user.contains("[tronqué]"),
        ),
    };
    fallback.budget.strategy = "local_llm_summary:unreadable".into();
    Ok(fallback)
}

fn summary_from_raw(
    raw: &str,
    view: &DiscussionThreadView,
    engine: &mut LlmEngine,
    system: &str,
    user: &str,
) -> Result<SummaryResult, LlmError> {
    let Some(mut dto) = best_summary_dto(raw) else {
        return unreadable_summary(raw, view, engine, system, user);
    };
    clamp_summary_dto(&mut dto);
    validate_summary_llm_shape(&dto.title, &dto.bullets, &dto.source_message_ids)?;

    let title_resolved = if dto.title.trim().is_empty() || looks_like_raw_summary_json(&dto.title) {
        view.subject.clone()
    } else {
        dto.title
    };

    let mut bullets = dto.bullets;
    if bullets.is_empty() {
        bullets = summarize_thread(view)
            .bullets
            .into_iter()
            .filter(|b| !bullet_is_noise(b))
            .take(8)
            .collect();
    }
    let bullets_fin = if bullets.is_empty() {
        vec![SUMMARY_UNREADABLE_FR.to_string()]
    } else {
        bullets
    };

    let evid = filter_evidence(&dto.source_message_ids, view);
    let source_message_ids = if evid.is_empty() {
        view.messages
            .iter()
            .map(|message| message.message_id.clone())
            .collect::<Vec<_>>()
    } else {
        evid
    };

    let mut out = SummaryResult {
        title: title_resolved,
        bullets: bullets_fin,
        source_message_ids,
        budget: budget_report(
            engine.n_ctx(),
            engine,
            system,
            user,
            Some(raw),
            user.contains("[tronqué]"),
        ),
    };
    let n_seen = dto.source_message_ids.len().min(view.messages.len());
    out.budget.strategy = format!("local_llm_summary:{n_seen}");
    Ok(out)
}

/// Synthèse courte du fil avec le LLM local (réponse JSON puis normalisation).
pub fn summarize_thread_with_llm(
    view: &DiscussionThreadView,
    engine: &mut LlmEngine,
    output_language: &str,
) -> Result<SummaryResult, LlmError> {
    let system = summary_system(output_language);
    let user = untrusted_mail_for_engine(engine, "thread-summary", &transcript_for_summary(view));
    let params = gen_params_json_for_prompt(engine, system.as_str(), &user, 512, 4096);
    let raw =
        engine.generate_with_schema(system.as_str(), &user, &params, SUMMARY_THREAD_JSON_GBNF)?;
    summary_from_raw(&raw, view, engine, system.as_str(), &user)
}

/// Même sortie que [`summarize_thread_with_llm`] avec émission de fragments pendant la génération.
pub fn summarize_thread_with_llm_streaming(
    view: &DiscussionThreadView,
    engine: &mut LlmEngine,
    output_language: &str,
    cancelled: &AtomicBool,
    mut on_chunk: impl FnMut(&str),
) -> Result<SummaryResult, LlmError> {
    let system = summary_system(output_language);
    let user = untrusted_mail_for_engine(engine, "thread-summary", &transcript_for_summary(view));
    let params = gen_params_json_for_prompt(engine, system.as_str(), &user, 512, 4096);
    let raw = engine.generate_streaming_with_schema(
        system.as_str(),
        &user,
        &params,
        SUMMARY_THREAD_JSON_GBNF,
        |piece| -> ControlFlow<Result<(), Infallible>> {
            stream_chunk_or_cancel(cancelled, piece, &mut on_chunk)
        },
    )?;
    if let Some(e) = cancelled_llm_err(cancelled) {
        return Err(e);
    }
    summary_from_raw(&raw, view, engine, system.as_str(), &user)
}

pub fn summarize_thread(thread: &DiscussionThreadView) -> SummaryResult {
    let mut bullets = Vec::new();
    for message in thread.messages.iter().take(5) {
        let content = message
            .cleaned_text
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty() && !is_conversation_index_marker(line))
            .unwrap_or("No readable content found.");
        let bullet = format!("{}: {}", message.sender, content);
        if bullet_is_noise(&bullet) {
            continue;
        }
        bullets.push(bullet);
    }

    SummaryResult {
        title: thread.subject.clone(),
        bullets,
        source_message_ids: thread
            .messages
            .iter()
            .map(|message| message.message_id.clone())
            .collect(),
        budget: TokenBudgetReport::empty_stub(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::{CleanedMessageView, MailSecuritySignals, ThreadId};
    use rustymail_llm::LlmEngine;

    const COURTY_TITLE: &str = "Rendez-vous avec le Dr. Courty!";
    const COURTY_BULLETS: [&str; 4] = [
        "Le rendez-vous est possible sans courrier d'adressage si vous n'avez jamais rencontré Dr COURTY.",
        "Il est recommandé de fournir un courrier d'adressage si vous n'avez déjà rencontré le Dr.",
        "Le rendez-vous est fixé à une date et une heure à déterminer.",
        "Il est possible de renvoyer le mail avec la bonne adresse pour éviter les problèmes de livraison.",
    ];

    fn courty_json() -> String {
        let title = serde_json::to_string(COURTY_TITLE).expect("title");
        let bullets = serde_json::to_string(&COURTY_BULLETS).expect("bullets");
        format!("{{\"title\":{title},\"bullets\":{bullets},\"sourceMessageIds\":[\"m1\",\"m2\"]}}")
    }

    fn message(id: &str, sender: &str, cleaned: &str) -> CleanedMessageView {
        CleanedMessageView {
            message_id: id.to_string(),
            sender: sender.to_string(),
            sender_email: String::new(),
            is_newsletter: false,
            detected_lang: None,
            received_at: String::new(),
            source_text: cleaned.to_string(),
            cleaned_text: cleaned.to_string(),
            html_body: None,
            cleaned_html_body: None,
            html_cleaning_provider: None,
            collapsed_quotes: Vec::new(),
            dimmed_blocks: Vec::new(),
            attachments: Vec::new(),
            recipients: Vec::new(),
            tags: Vec::new(),
            entities: Vec::new(),
            mail_security: MailSecuritySignals::empty_ok(),
        }
    }

    fn courty_view() -> DiscussionThreadView {
        DiscussionThreadView {
            id: ThreadId("t-courty".into()),
            subject: "RE: Demande de rendez-vous".into(),
            messages: vec![
                message(
                    "m1",
                    "Nicolas Lechopier",
                    "=== [1] .. ===\nBonjour, je souhaite un rendez-vous avec le Dr Courty.",
                ),
                message(
                    "m2",
                    "secretariat@drcourty.fr",
                    "=== [1] .. ===\nVotre demande est bien reçue.",
                ),
            ],
            tags: Vec::new(),
            entities: Vec::new(),
            is_newsletter_thread: false,
            unread: false,
        }
    }

    fn engine() -> LlmEngine {
        LlmEngine::open_ai_compatible(
            "http://127.0.0.1:8080/v1".into(),
            "test".into(),
            String::new(),
        )
        .expect("engine")
    }

    fn parse(raw: &str) -> SummaryResult {
        let view = courty_view();
        let mut engine = engine();
        summary_from_raw(raw, &view, &mut engine, "system", "user").expect("summary")
    }

    fn assert_courty(summary: &SummaryResult) {
        assert_eq!(summary.title, COURTY_TITLE);
        assert!(summary.bullets.len() >= 3, "puces : {:?}", summary.bullets);
        assert!(summary.bullets.iter().any(|b| b.contains("Dr COURTY")));
        assert!(summary
            .bullets
            .iter()
            .any(|b| b.contains("date et une heure")));
        let blob = format!("{}\n{}", summary.title, summary.bullets.join("\n"));
        assert!(!blob.contains("extrait modèle"), "{blob}");
        assert!(!blob.contains("=== ["), "{blob}");
        assert!(!blob.contains("\"bullets\""), "{blob}");
        assert!(!blob.contains("\"title\""), "{blob}");
    }

    #[test]
    fn summary_parses_plain_json() {
        assert_courty(&parse(&courty_json()));
    }

    #[test]
    fn summary_parses_prefixed_json_with_earlier_brace() {
        let raw = format!(
            "Je résume {{rapidement}} le fil avant le JSON.\n{}",
            courty_json()
        );
        assert_courty(&parse(&raw));
    }

    #[test]
    fn summary_parses_json_missing_opening_brace() {
        let raw = courty_json();
        let raw = raw.trim_start_matches('{');
        assert_courty(&parse(raw));
    }

    #[test]
    fn summary_parses_fenced_json() {
        let raw = format!("```json\n{}\n```\n", courty_json());
        assert_courty(&parse(&raw));
    }

    #[test]
    fn summary_parses_truncated_json() {
        let full = courty_json();
        let cut = full.find("livraison").expect("cut point");
        let raw = &full[..cut];
        let summary = parse(raw);
        assert_eq!(summary.title, COURTY_TITLE);
        assert!(summary.bullets.iter().any(|b| b.contains("Dr COURTY")));
        assert!(summary
            .bullets
            .iter()
            .any(|b| b.contains("date et une heure")));
        assert!(summary.bullets.iter().any(|b| b.contains("problèmes de")));
        let blob = summary.bullets.join("\n");
        assert!(!blob.contains("\"bullets\""));
        assert!(!blob.contains("=== ["));
    }

    #[test]
    fn summary_parses_encapsulated_json_string() {
        let wrapped = serde_json::json!({
            "output": courty_json(),
        })
        .to_string();
        assert_courty(&parse(&wrapped));
    }

    #[test]
    fn summary_parses_json_with_raw_newline_inside_string() {
        let raw = format!(
            "{{\"title\":\"{COURTY_TITLE}\",\"bullets\":[\"Le rendez-vous est possible\nsans courrier.\",\"Il est recommandé de fournir un courrier d'adressage.\"]}}"
        );
        let summary = parse(&raw);
        assert_eq!(summary.title, COURTY_TITLE);
        assert!(summary.bullets.iter().any(|b| b.contains("sans courrier")));
        assert!(summary
            .bullets
            .iter()
            .any(|b| b.contains("courrier d'adressage")));
    }

    #[test]
    fn summary_prefers_real_object_over_short_prefix_object() {
        let raw = format!(
            "{{\"title\":\"brouillon\",\"bullets\":[\"trop court\"]}}\n{}",
            courty_json()
        );
        assert_courty(&parse(&raw));
    }

    #[test]
    fn unreadable_model_output_is_status_not_raw_excerpt_or_markers() {
        let raw = "Le modèle a répondu en prose, sans objet JSON exploitable du tout.";
        let summary = parse(raw);
        assert_eq!(summary.title, "RE: Demande de rendez-vous");
        assert_eq!(summary.bullets, vec![SUMMARY_UNREADABLE_FR.to_string()]);
        let blob = summary.bullets.join("\n");
        assert!(!blob.contains("extrait modèle"));
        assert!(!blob.contains("=== ["));
        assert!(!blob.contains("Nicolas Lechopier"));
    }

    #[test]
    fn heuristic_summary_skips_conversation_index_markers() {
        let summary = summarize_thread(&courty_view());
        assert_eq!(summary.bullets.len(), 2, "{:?}", summary.bullets);
        assert!(summary.bullets[0].contains("souhaite un rendez-vous"));
        assert!(summary.bullets[1].contains("bien reçue"));
        assert!(summary.bullets.iter().all(|b| !b.contains("=== [")));
    }
}
