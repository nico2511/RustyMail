//! Après sélection des zones : article de lecture (signal en avant, blabla dehors).

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;

use crate::ai_llm_util::{
    gen_params_json_for_prompt, output_room_after_prompt, parse_model_json, truncate_chars,
    untrusted_mail_for_engine,
};
use crate::mail_cleaning::digest_fixtures::proposal::{
    french_explanation, proposal_to_fixture_yaml, DigestCutProposal, DigestCutZone, ProposalSource,
};
use crate::mail_cleaning::digest_fixtures::{
    preview_candidate_fixture, AnchorRole, ZoneAction, ZonePresentation,
};
use rustymail_llm::{LlmEngine, LlmError};

const MIN_OUTPUT_TOKENS: u32 = 384;
const MAX_OUTPUT_TOKENS: u32 = 1_024;
const MIN_OUTPUT_ROOM: u32 = 280;
const EXCERPT_CHARS: usize = 1_200;
const MAX_ACTIONS: usize = 2;
const MAX_CONTACTS: usize = 2;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReformatDto {
    #[serde(default)]
    explanation_fr: String,
    #[serde(default)]
    header_presentation: Option<String>,
    #[serde(default)]
    body_presentation: Option<String>,
    #[serde(default)]
    title: String,
    #[serde(default)]
    amount: String,
    #[serde(default)]
    highlight_label: String,
    #[serde(default)]
    highlight_value: String,
    #[serde(default)]
    details_heading: String,
    #[serde(default)]
    rows: Vec<ReformatRowDto>,
    #[serde(default)]
    paragraphs: Vec<String>,
    #[serde(default)]
    actions: Vec<ReformatActionDto>,
    #[serde(default)]
    contacts: Vec<ReformatRowDto>,
    #[serde(default)]
    hide_footer: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReformatRowDto {
    #[serde(default)]
    label: String,
    #[serde(default)]
    value: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReformatActionDto {
    #[serde(default)]
    label: String,
    #[serde(default)]
    url: String,
}

#[derive(Debug, Clone)]
struct LinkCandidate {
    label: String,
    url: String,
    score: i32,
}

pub struct DigestCutReformatOutcome {
    pub proposal: DigestCutProposal,
    pub reading_html: String,
    pub from_model: bool,
    pub fallback_reason: Option<String>,
}

/// Réécrit le texte des zones déjà choisies. Sans moteur : reformat structurel local.
pub fn reformat_digest_cut_reading(
    engine: Option<&mut LlmEngine>,
    html: &str,
    sender_email: &str,
    subject: &str,
    output_language: &str,
    current: &DigestCutProposal,
) -> DigestCutReformatOutcome {
    let excerpts = zone_excerpts(html, sender_email, subject, current);
    let candidates = extract_useful_link_candidates(html, 8);
    let mut fallback_reason = None;
    if let Some(engine) = engine {
        match reformat_with_llm(
            engine,
            sender_email,
            subject,
            output_language,
            current,
            &excerpts,
            &candidates,
        ) {
            Ok(mut dto) => {
                enrich_dto_with_local_signal(&mut dto, subject, html, &excerpts, &candidates);
                let (proposal, reading_html) = apply_reformat_dto(current, dto);
                return DigestCutReformatOutcome {
                    proposal,
                    reading_html,
                    from_model: true,
                    fallback_reason: None,
                };
            }
            Err(e) => {
                fallback_reason = Some(match &e {
                    LlmError::InputTooLarge { tokens, n_ctx } => format!(
                        "contexte trop court pour reformater ({tokens} jetons / n_ctx={n_ctx})."
                    ),
                    other => format!("Le modèle n’a pas reformatté le texte : {other}"),
                });
            }
        }
    } else {
        fallback_reason =
            Some("Aucun moteur IA joignable pour le reformatage (Paramètres → IA).".into());
    }
    let (proposal, reading_html) =
        heuristic_reformat(current, subject, html, &excerpts, &candidates);
    DigestCutReformatOutcome {
        proposal,
        reading_html,
        from_model: false,
        fallback_reason,
    }
}

struct ZoneExcerpts {
    header: String,
    body: String,
    footer: String,
}

fn zone_excerpts(
    html: &str,
    sender_email: &str,
    subject: &str,
    proposal: &DigestCutProposal,
) -> ZoneExcerpts {
    let mut as_is = proposal.clone();
    as_is.zones.header.presentation = Some(ZonePresentation::AsIs);
    as_is.zones.body.presentation = Some(ZonePresentation::AsIs);
    let yaml = proposal_to_fixture_yaml(&as_is).unwrap_or_default();
    let preview = preview_candidate_fixture(&yaml, html, sender_email);
    let reading = preview.html.unwrap_or_default();
    let plain = reading_source_plain(&reading, preview.applicable, html);
    let subject = subject.split_whitespace().collect::<Vec<_>>().join(" ");
    let header = if subject.is_empty() {
        truncate_chars(&plain, EXCERPT_CHARS / 3)
    } else {
        truncate_chars(&format!("{subject} — {plain}"), EXCERPT_CHARS / 3)
    };
    ZoneExcerpts {
        header,
        body: truncate_chars(&plain, EXCERPT_CHARS),
        footer: truncate_chars(
            &proposal.zones.footer.rationale.clone().unwrap_or_default(),
            200,
        ),
    }
}

/// Texte pour l’article. Si la découpe ne s’applique pas, on garde le mail entier.
fn reading_source_plain(cut_html: &str, cut_applicable: bool, source_html: &str) -> String {
    let cut = strip_tags_to_plain(cut_html);
    if cut_applicable && cut.chars().count() >= 40 {
        return cut;
    }
    let full = strip_tags_to_plain(source_html);
    if full.chars().count() > cut.chars().count() {
        full
    } else {
        cut
    }
}

fn strip_tags_to_plain(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace()
        .filter(|word| !looks_like_attr_token(word))
        .collect::<Vec<_>>()
        .join(" ")
}

fn looks_like_attr_token(word: &str) -> bool {
    let folded = word.to_ascii_lowercase();
    folded.contains("target=")
        || folded.contains("style=")
        || folded.contains("data-block")
        || folded.contains("text-decoration")
        || folded.contains("href=")
}

fn reformat_with_llm(
    engine: &mut LlmEngine,
    sender_email: &str,
    subject: &str,
    output_language: &str,
    current: &DigestCutProposal,
    excerpts: &ZoneExcerpts,
    candidates: &[LinkCandidate],
) -> Result<ReformatDto, LlmError> {
    let system = crate::prompts::system_prompt_for_language("digest_cut_reformat", output_language);
    let slim = json!({
        "fixtureId": current.fixture_id,
        "headerAction": current.zones.header.action,
        "bodyAction": current.zones.body.action,
        "footerAction": current.zones.footer.action,
    });
    let subject_line = subject.split_whitespace().collect::<Vec<_>>().join(" ");
    let links_json = serde_json::to_string(
        &candidates
            .iter()
            .take(6)
            .map(|c| json!({"label": c.label, "url": c.url}))
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|_| "[]".into());
    let user = format!(
        "Sender (context only): {}\nSubject (context only): {}\nZones: {}\nCandidate action links (prefer these urls, do not invent): {}\n\n{}\n\n{}\n\n{}",
        sender_email.trim(),
        truncate_chars(&subject_line, 160),
        slim,
        links_json,
        untrusted_mail_for_engine(engine, "digest-cut-header-text", &excerpts.header),
        untrusted_mail_for_engine(engine, "digest-cut-body-text", &excerpts.body),
        untrusted_mail_for_engine(engine, "digest-cut-footer-note", &excerpts.footer),
    );
    let room = output_room_after_prompt(engine, system.as_str(), &user, 64);
    if room < MIN_OUTPUT_ROOM {
        let n_ctx = engine.n_ctx();
        return Err(LlmError::InputTooLarge {
            tokens: (n_ctx.saturating_sub(room)) as usize,
            n_ctx,
        });
    }
    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_json_for_prompt(
            engine,
            system.as_str(),
            &user,
            MIN_OUTPUT_TOKENS,
            MAX_OUTPUT_TOKENS,
        ),
    )?;
    let value: Value = parse_model_json(&raw)?;
    let dto: ReformatDto = serde_json::from_value(value)
        .map_err(|e| LlmError::InvalidJson(format!("reformat JSON incomplet : {e}")))?;
    validate_reformat_dto(&dto)?;
    Ok(dto)
}

fn validate_reformat_dto(dto: &ReformatDto) -> Result<(), LlmError> {
    let bad = |s: &str| s.to_ascii_lowercase().contains("ignore all") || s.contains('<');
    if bad(&dto.explanation_fr)
        || bad(&dto.title)
        || bad(&dto.amount)
        || bad(&dto.details_heading)
        || bad(&dto.highlight_label)
        || bad(&dto.highlight_value)
    {
        return Err(LlmError::InvalidJson("reformat fields".into()));
    }
    if dto.rows.len() > 8
        || dto.paragraphs.len() > 4
        || dto.actions.len() > MAX_ACTIONS
        || dto.contacts.len() > MAX_CONTACTS
    {
        return Err(LlmError::InvalidJson("reformat size".into()));
    }
    for row in dto.rows.iter().chain(dto.contacts.iter()) {
        if bad(&row.label) || bad(&row.value) {
            return Err(LlmError::InvalidJson("reformat row".into()));
        }
    }
    for p in &dto.paragraphs {
        if bad(p) {
            return Err(LlmError::InvalidJson("reformat paragraph".into()));
        }
    }
    for action in &dto.actions {
        if bad(&action.label) {
            return Err(LlmError::InvalidJson("reformat action".into()));
        }
        if !is_allowed_action_url(&action.url) || href_looks_like_unsubscribe(&action.url) {
            return Err(LlmError::InvalidJson("reformat action url".into()));
        }
    }
    if dto.title.trim().is_empty()
        && dto.amount.trim().is_empty()
        && dto.highlight_value.trim().is_empty()
        && dto.rows.is_empty()
        && dto.paragraphs.is_empty()
        && dto.actions.is_empty()
    {
        return Err(LlmError::InvalidJson("reformat empty".into()));
    }
    Ok(())
}

fn is_allowed_action_url(url: &str) -> bool {
    let u = url.trim();
    (u.starts_with("https://") || u.starts_with("http://"))
        && !u.contains('<')
        && !u.contains(' ')
        && u.len() <= 500
}

fn parse_presentation(raw: Option<&str>, fallback: ZonePresentation) -> ZonePresentation {
    match raw
        .map(str::trim)
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "prominent" => ZonePresentation::Prominent,
        "key_value" => ZonePresentation::KeyValue,
        "as_is" => ZonePresentation::AsIs,
        _ => fallback,
    }
}

fn clip_field(s: &str, max: usize) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max)
        .collect()
}

fn apply_reformat_dto(
    current: &DigestCutProposal,
    dto: ReformatDto,
) -> (DigestCutProposal, String) {
    let mut proposal = current.clone();
    proposal.source = ProposalSource::Llm;
    let header_pres =
        parse_presentation(dto.header_presentation.as_deref(), ZonePresentation::AsIs);
    let body_pres = parse_presentation(dto.body_presentation.as_deref(), ZonePresentation::AsIs);
    proposal.zones.header.presentation = Some(header_pres);
    proposal.zones.body.presentation = Some(body_pres);
    if header_pres == ZonePresentation::Prominent {
        tag_header_roles(&mut proposal.zones.header);
    }
    if body_pres == ZonePresentation::KeyValue {
        let heading = clip_field(dto.details_heading.trim(), 80);
        proposal.zones.body.details_heading = Some(if heading.is_empty() {
            "Détails".into()
        } else {
            heading
        });
        proposal.zones.body.row_selector = Some("p".into());
    }
    if dto.hide_footer {
        proposal.zones.footer.action = ZoneAction::Hide;
    }
    let explanation = clip_field(&dto.explanation_fr, 400);
    proposal.explanation_fr = if explanation.is_empty() {
        french_explanation(&proposal)
    } else {
        explanation
    };
    let reading_html = build_reading_html(&proposal.fixture_id, &dto);
    (proposal, reading_html)
}

fn tag_header_roles(zone: &mut DigestCutZone) {
    if let Some(first) = zone.anchors.get_mut(0) {
        if first.role.is_none() {
            first.role = Some(AnchorRole::Title);
        }
    }
    if let Some(second) = zone.anchors.get_mut(1) {
        if second.role.is_none() {
            second.role = Some(AnchorRole::Amount);
        }
    }
}

fn looks_like_markup_leak(text: &str) -> bool {
    let folded = text.to_ascii_lowercase();
    folded.contains("target=")
        || folded.contains("data-block")
        || folded.contains("text-decoration")
        || folded.contains("style=")
        || folded.contains("href=")
        || text.contains('<')
        || text.contains('>')
}

fn scrub_reformat_fields(dto: &mut ReformatDto) {
    if looks_like_markup_leak(&dto.title) {
        dto.title.clear();
    }
    if looks_like_markup_leak(&dto.amount) {
        dto.amount.clear();
    }
    if looks_like_markup_leak(&dto.highlight_label) {
        dto.highlight_label.clear();
    }
    if looks_like_markup_leak(&dto.highlight_value) {
        dto.highlight_value.clear();
    }
    dto.rows
        .retain(|row| !looks_like_markup_leak(&row.label) && !looks_like_markup_leak(&row.value));
    dto.paragraphs.retain(|p| !looks_like_markup_leak(p));
    dto.actions.retain(|a| !looks_like_markup_leak(&a.label));
    dto.contacts
        .retain(|row| !looks_like_markup_leak(&row.label) && !looks_like_markup_leak(&row.value));
}

fn already_mentions(dto: &ReformatDto, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }
    dto.highlight_value.contains(needle)
        || dto.title.contains(needle)
        || dto.amount.contains(needle)
        || dto.rows
            .iter()
            .any(|row| row.label.contains(needle) || row.value.contains(needle))
        || dto.paragraphs.iter().any(|p| p.contains(needle))
        || dto
            .actions
            .iter()
            .any(|a| a.url.contains(needle) || a.label.contains(needle))
}

fn fill_missing_facts(dto: &mut ReformatDto, excerpts: &ZoneExcerpts) {
    let blob = format!("{} {}", excerpts.header, excerpts.body);
    let date_re = regex::Regex::new(r"\d{1,2}/\d{1,2}/\d{4}").expect("date");
    for found in date_re.find_iter(&blob) {
        if dto.rows.len() >= 8 {
            break;
        }
        let value = found.as_str();
        if already_mentions(dto, value) {
            continue;
        }
        dto.rows.push(ReformatRowDto {
            label: "Date".into(),
            value: value.to_string(),
        });
    }
    let name_re = regex::Regex::new(
        r"(?i)\b(?:(?:MR|M\.|MME|MONSIEUR|MADAME)\s+[A-ZÀ-Ý][A-ZÀ-Ý' -]{2,40}|(?:Bonjour|Hello)\s+[A-ZÀ-Ý][a-zà-ÿ'’-]{1,24}(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’-]{1,24})?)",
    )
    .expect("name");
    if dto.rows.len() < 8 {
        if let Some(found) = name_re.find(&blob) {
            let value = found.as_str().split_whitespace().collect::<Vec<_>>().join(" ");
            if !already_mentions(dto, &value) {
                dto.rows.push(ReformatRowDto {
                    label: "Destinataire".into(),
                    value,
                });
            }
        }
    }
    if dto.actions.len() < MAX_ACTIONS {
        let site_re =
            regex::Regex::new(r"(?i)\bwww\.[a-z0-9.-]+\.[a-z]{2,}\b").expect("site");
        if let Some(found) = site_re.find(&blob) {
            let host = found.as_str();
            if !already_mentions(dto, host) {
                let url = format!("https://{host}");
                if !href_looks_like_unsubscribe(&url) {
                    dto.actions.push(ReformatActionDto {
                        label: host.to_string(),
                        url,
                    });
                }
            }
        }
    }
}

fn enrich_dto_with_local_signal(
    dto: &mut ReformatDto,
    subject: &str,
    html: &str,
    excerpts: &ZoneExcerpts,
    candidates: &[LinkCandidate],
) {
    scrub_reformat_fields(dto);
    dto.actions = sanitize_actions(std::mem::take(&mut dto.actions), candidates);
    if dto.actions.is_empty() {
        dto.actions = actions_from_candidates(candidates);
    }
    if dto.highlight_value.trim().is_empty() {
        if let Some((label, value)) = guess_highlight(subject, excerpts, html) {
            dto.highlight_label = label;
            dto.highlight_value = value;
        }
    }
    fill_missing_facts(dto, excerpts);
    dto.rows.truncate(8);
    dto.paragraphs.truncate(4);
    dto.actions.truncate(MAX_ACTIONS);
    dto.contacts.truncate(MAX_CONTACTS);
}

fn sanitize_actions(
    actions: Vec<ReformatActionDto>,
    candidates: &[LinkCandidate],
) -> Vec<ReformatActionDto> {
    let allowed: HashSet<&str> = candidates.iter().map(|c| c.url.as_str()).collect();
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for action in actions {
        let url = action.url.trim().to_string();
        let label = clip_field(action.label.trim(), 80);
        if label.is_empty() || !is_allowed_action_url(&url) || href_looks_like_unsubscribe(&url) {
            continue;
        }
        if !candidates.is_empty() && !allowed.contains(url.as_str()) {
            continue;
        }
        if seen.insert(url.clone()) {
            out.push(ReformatActionDto { label, url });
        }
        if out.len() >= MAX_ACTIONS {
            break;
        }
    }
    out
}

fn actions_from_candidates(candidates: &[LinkCandidate]) -> Vec<ReformatActionDto> {
    candidates
        .iter()
        .take(MAX_ACTIONS)
        .map(|c| ReformatActionDto {
            label: clip_field(&c.label, 80),
            url: c.url.clone(),
        })
        .filter(|a| !a.label.is_empty() && is_allowed_action_url(&a.url))
        .collect()
}

fn heuristic_reformat(
    current: &DigestCutProposal,
    subject: &str,
    html: &str,
    excerpts: &ZoneExcerpts,
    candidates: &[LinkCandidate],
) -> (DigestCutProposal, String) {
    let text = format!("{} {}", excerpts.header, excerpts.body);
    let lines: Vec<&str> = text
        .split(['.', '\n', '•'])
        .map(str::trim)
        .filter(|s| s.len() >= 3)
        .take(12)
        .collect();
    let subject = subject.split_whitespace().collect::<Vec<_>>().join(" ");
    let title = if !subject.is_empty() {
        clip_field(&subject, 120)
    } else {
        lines.first().unwrap_or(&"Message").to_string()
    };
    let text_lc = text.to_ascii_lowercase();
    let currency_hits: Vec<&str> = lines
        .iter()
        .copied()
        .filter(|l| {
            let u = l.to_ascii_uppercase();
            u.contains("EUR") || u.contains("USD") || l.contains('€') || l.contains('$')
        })
        .collect();
    let promo_catalog = currency_hits.len() >= 5
        && !text_lc.contains("commande")
        && !text_lc.contains("order")
        && !text_lc.contains("alerte")
        && !text_lc.contains("livré")
        && !text_lc.contains("delivered");

    let amount = if promo_catalog {
        String::new()
    } else if text_lc.contains("livré") || text_lc.contains("delivered") {
        "Livré".into()
    } else if text_lc.contains("failed") || text_lc.contains("échec") {
        "Échec".into()
    } else {
        currency_hits
            .first()
            .map(|s| clip_field(s, 120))
            .unwrap_or_default()
    };

    let mut rows = Vec::new();
    if !promo_catalog {
        for line in lines.iter().skip(1).take(6) {
            if let Some((label, value)) = line.split_once(':') {
                let label = label.trim();
                let value = value.trim();
                if !label.is_empty() && !value.is_empty() && label.len() <= 40 {
                    rows.push(ReformatRowDto {
                        label: label.to_string(),
                        value: value.to_string(),
                    });
                }
            }
        }
    }

    let (highlight_label, highlight_value) = if promo_catalog {
        (String::new(), String::new())
    } else {
        guess_highlight(&subject, excerpts, html).unwrap_or_default()
    };

    let used_in_rows: HashSet<String> = rows
        .iter()
        .flat_map(|r| [r.label.clone(), r.value.clone()])
        .collect();
    let commentary: Vec<String> = lines
        .iter()
        .skip(1)
        .filter(|line| {
            let lower = line.to_ascii_lowercase();
            if used_in_rows.contains(**line) {
                return false;
            }
            if lower.contains("investir")
                || lower.contains("unsubscribe")
                || lower.contains("désinscri")
                || lower.contains("desinscri")
                || lower.contains("mentions légales")
                || lower.contains("click here")
                || lower.contains("cliquez ici")
            {
                return false;
            }
            line.len() >= 40
        })
        .take(2)
        .map(|s| clip_field(s, 120))
        .collect();
    let paragraphs = if promo_catalog {
        vec!["Catalogue promotionnel — aucun détail de commande personnelle.".into()]
    } else if !commentary.is_empty() {
        commentary
    } else if rows.len() < 2 {
        lines
            .iter()
            .skip(1)
            .take(3)
            .map(|s| clip_field(s, 120))
            .collect()
    } else {
        vec![]
    };

    let mut dto = ReformatDto {
        explanation_fr: "Article de lecture local (sans modèle) : signal mis en avant.".into(),
        header_presentation: Some(if !amount.is_empty() {
            "prominent".into()
        } else {
            "as_is".into()
        }),
        body_presentation: Some(if rows.len() >= 2 {
            "key_value".into()
        } else {
            "as_is".into()
        }),
        title: clip_field(&title, 120),
        amount,
        highlight_label,
        highlight_value,
        details_heading: "Détails".into(),
        rows,
        paragraphs,
        actions: if promo_catalog {
            vec![]
        } else {
            actions_from_candidates(candidates)
        },
        contacts: vec![],
        hide_footer: true,
    };
    enrich_dto_with_local_signal(&mut dto, &subject, html, excerpts, candidates);
    let (mut proposal, out_html) = apply_reformat_dto(current, dto);
    proposal.source = ProposalSource::Heuristic;
    (proposal, out_html)
}

fn guess_highlight(subject: &str, excerpts: &ZoneExcerpts, html: &str) -> Option<(String, String)> {
    let blob = format!("{} {} {}", subject, excerpts.header, excerpts.body);
    if let Ok(re) = regex::Regex::new(
        r"(?i)(?:n[°o]\s*(?:de\s*)?commande|order\s*#?|commande)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{5,})",
    ) {
        if let Some(cap) = re.captures(&blob) {
            if let Some(m) = cap.get(1) {
                let value = m.as_str().trim();
                if value.len() >= 6 {
                    return Some(("N° commande".into(), clip_field(value, 80)));
                }
            }
        }
    }
    let lc = blob.to_ascii_lowercase();
    if lc.contains("suivi") || lc.contains("tracking") || lc.contains("colis") {
        if let Some(tok) = blob
            .split_whitespace()
            .find(|t| t.len() >= 10 && t.chars().all(|c| c.is_ascii_alphanumeric()))
        {
            return Some(("N° suivi".into(), clip_field(tok, 80)));
        }
    }
    let _ = html;
    None
}

fn extract_useful_link_candidates(html: &str, limit: usize) -> Vec<LinkCandidate> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let html_lc = html.to_ascii_lowercase();
    let mut search_from = 0usize;
    while out.len() < limit * 3 {
        let Some(rel) = html_lc[search_from..].find("href=") else {
            break;
        };
        let href_key = search_from + rel;
        search_from = href_key + 5;
        let part = &html[href_key + 5..];
        if part.len() < 2 {
            continue;
        }
        let quote = part.as_bytes()[0];
        if quote != b'"' && quote != b'\'' {
            continue;
        }
        let rest = &part[1..];
        let end = rest.find(quote as char).unwrap_or(rest.len().min(1200));
        let url = rest[..end.min(rest.len())].trim();
        if !is_allowed_action_url(url) || href_looks_like_unsubscribe(url) {
            continue;
        }
        let label = if let Some(close) = part.to_ascii_lowercase().find("</a>") {
            strip_tags_to_plain(&part[end.min(part.len())..close.min(part.len())])
        } else {
            String::new()
        };
        let label = clip_field(&label, 80);
        let score = useful_link_score(url, &label);
        if score < 20 {
            continue;
        }
        let label = if label.is_empty() {
            default_action_label(url)
        } else {
            label
        };
        if seen.insert(url.to_string()) {
            out.push(LinkCandidate {
                label,
                url: url.to_string(),
                score,
            });
        }
    }
    out.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.url.len().cmp(&b.url.len()))
    });
    out.truncate(limit);
    out
}

fn default_action_label(url: &str) -> String {
    let u = url.to_ascii_lowercase();
    if u.contains("progress-tracker") || u.contains("track") || u.contains("suivi") {
        "Suivre le colis".into()
    } else if u.contains("order") || u.contains("commande") {
        "Voir la commande".into()
    } else if u.contains("actions/runs") || u.contains("github.com") {
        "Voir les résultats".into()
    } else if u.contains("deal") {
        "Voir le deal".into()
    } else {
        "Ouvrir".into()
    }
}

fn useful_link_score(url: &str, label: &str) -> i32 {
    let blob = format!("{} {}", url, label).to_ascii_lowercase();
    if href_looks_like_unsubscribe(&blob) {
        return -100;
    }
    let mut score = 0;
    for (kw, pts) in [
        ("progress-tracker", 90),
        ("track", 70),
        ("suivi", 70),
        ("package", 50),
        ("order", 60),
        ("commande", 60),
        ("actions/runs", 85),
        ("view results", 80),
        ("voir les résultats", 80),
        ("dealabs", 55),
        ("deal", 40),
        ("investir", 35),
        ("vault", 35),
        ("github.com", 30),
    ] {
        if blob.contains(kw) {
            score += pts;
        }
    }
    for (kw, pts) in [
        ("facebook", -40),
        ("instagram", -40),
        ("linkedin", -40),
        ("twitter", -40),
        ("discord", -40),
        ("social", -30),
        ("play.google", -40),
        ("apps.apple", -40),
        ("rate us", -40),
    ] {
        if blob.contains(kw) {
            score += pts;
        }
    }
    score
}

fn href_looks_like_unsubscribe(href: &str) -> bool {
    let h = href.to_ascii_lowercase();
    h.contains("unsubscribe")
        || h.contains("opt-out")
        || h.contains("optout")
        || h.contains("desinscri")
        || h.contains("désinscri")
        || h.contains("desabon")
        || h.contains("list-manage")
        || h.contains("list-unsubscribe")
        || h.contains("unsubscribe.iterable")
        || h.contains("/s/uh/")
        || h.contains("/s/u/")
        || h.contains("/un/")
        || h.contains("/unsub")
        || h.contains("ne plus recevoir")
}

fn esc_pcdata(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn esc_attr(text: &str) -> String {
    esc_pcdata(text)
}

fn build_reading_html(fixture_id: &str, dto: &ReformatDto) -> String {
    let mut out = format!(
        "<!-- rustymail:digest id=\"{}\" -->\n<article class=\"rm-digest\">\n",
        esc_pcdata(fixture_id)
    );
    let title = clip_field(dto.title.trim(), 120);
    let amount = clip_field(dto.amount.trim(), 120);
    let hi_label = clip_field(dto.highlight_label.trim(), 80);
    let hi_value = clip_field(dto.highlight_value.trim(), 120);
    if !title.is_empty() {
        out.push_str(&format!("  <h2>{}</h2>\n", esc_pcdata(&title)));
    }
    if !hi_value.is_empty() {
        out.push_str("  <p class=\"rm-digest__highlight\">");
        if !hi_label.is_empty() {
            out.push_str(&format!("<span>{}</span>", esc_pcdata(&hi_label)));
        }
        out.push_str(&format!("<strong>{}</strong></p>\n", esc_pcdata(&hi_value)));
    }
    if !amount.is_empty() {
        out.push_str(&format!(
            "  <p class=\"rm-digest__status\"><strong>{}</strong></p>\n",
            esc_pcdata(&amount)
        ));
    }
    let heading = clip_field(dto.details_heading.trim(), 80);
    let rows: Vec<_> = dto
        .rows
        .iter()
        .filter(|r| !r.label.trim().is_empty() && !r.value.trim().is_empty())
        .take(8)
        .collect();
    if !rows.is_empty() {
        if !heading.is_empty() {
            out.push_str(&format!("  <h3>{}</h3>\n", esc_pcdata(&heading)));
        }
        out.push_str("  <table>\n    <tbody>\n");
        for row in rows {
            out.push_str("      <tr><th scope=\"row\">");
            out.push_str(&esc_pcdata(&clip_field(row.label.trim(), 120)));
            out.push_str("</th><td>");
            out.push_str(&esc_pcdata(&clip_field(row.value.trim(), 120)));
            out.push_str("</td></tr>\n");
        }
        out.push_str("    </tbody>\n  </table>\n");
    }
    let contacts: Vec<_> = dto
        .contacts
        .iter()
        .filter(|r| !r.label.trim().is_empty() && !r.value.trim().is_empty())
        .take(MAX_CONTACTS)
        .collect();
    if !contacts.is_empty() {
        out.push_str("  <h3>Contact</h3>\n  <table>\n    <tbody>\n");
        for row in contacts {
            out.push_str("      <tr><th scope=\"row\">");
            out.push_str(&esc_pcdata(&clip_field(row.label.trim(), 120)));
            out.push_str("</th><td>");
            out.push_str(&esc_pcdata(&clip_field(row.value.trim(), 120)));
            out.push_str("</td></tr>\n");
        }
        out.push_str("    </tbody>\n  </table>\n");
    }
    for p in dto.paragraphs.iter().take(4) {
        let line = clip_field(p.trim(), 120);
        if line.is_empty() {
            continue;
        }
        out.push_str("  <p>");
        out.push_str(&esc_pcdata(&line));
        out.push_str("</p>\n");
    }
    let actions: Vec<_> = dto
        .actions
        .iter()
        .filter(|a| is_allowed_action_url(&a.url) && !href_looks_like_unsubscribe(&a.url))
        .take(MAX_ACTIONS)
        .collect();
    if !actions.is_empty() {
        out.push_str("  <p class=\"rm-digest__actions\">");
        for (i, action) in actions.iter().enumerate() {
            if i > 0 {
                out.push(' ');
            }
            let label = clip_field(action.label.trim(), 80);
            let label = if label.is_empty() {
                default_action_label(&action.url)
            } else {
                label
            };
            out.push_str(&format!(
                "<a href=\"{}\" rel=\"noopener noreferrer\" target=\"_blank\">{}</a>",
                esc_attr(action.url.trim()),
                esc_pcdata(&label)
            ));
        }
        out.push_str("</p>\n");
    }
    out.push_str("</article>\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_dto() -> ReformatDto {
        ReformatDto {
            explanation_fr: "ok".into(),
            header_presentation: Some("prominent".into()),
            body_presentation: Some("key_value".into()),
            title: String::new(),
            amount: String::new(),
            highlight_label: String::new(),
            highlight_value: String::new(),
            details_heading: String::new(),
            rows: vec![],
            paragraphs: vec![],
            actions: vec![],
            contacts: vec![],
            hide_footer: true,
        }
    }

    #[test]
    fn rejects_html_injection_in_fields() {
        let mut dto = empty_dto();
        dto.title = "<script>x</script>".into();
        assert!(validate_reformat_dto(&dto).is_err());
    }

    #[test]
    fn rejects_unsubscribe_action_url() {
        let mut dto = empty_dto();
        dto.title = "Promo".into();
        dto.actions = vec![ReformatActionDto {
            label: "Se désinscrire".into(),
            url: "https://links.example.com/s/u/abc".into(),
        }];
        assert!(validate_reformat_dto(&dto).is_err());
    }

    #[test]
    fn builds_article_with_highlight_and_actions() {
        let mut dto = empty_dto();
        dto.title = "Livré — Nettoyant contacts".into();
        dto.amount = "Livré aujourd’hui".into();
        dto.highlight_label = "N° commande".into();
        dto.highlight_value = "123-4567890-1234567".into();
        dto.details_heading = "Détails".into();
        dto.rows = vec![ReformatRowDto {
            label: "Lieu".into(),
            value: "Ville-Exemple".into(),
        }];
        dto.actions = vec![ReformatActionDto {
            label: "Suivre le colis".into(),
            url: "https://shop.example.com/progress-tracker/package/demo".into(),
        }];
        assert!(validate_reformat_dto(&dto).is_ok());
        let html = build_reading_html("shop-example", &dto);
        assert!(html.contains("rm-digest__highlight"));
        assert!(html.contains("123-4567890-1234567"));
        assert!(html.contains("rm-digest__actions"));
        assert!(html.contains("progress-tracker"));
        assert!(html.contains("Suivre le colis"));
    }

    #[test]
    fn extracts_useful_links_and_skips_unsub() {
        let html = r#"
          <a href="https://shop.example.com/progress-tracker/package/demo">Suivre votre colis</a>
          <a href="http://links.example-esp.com/s/u/tokenDemo">désinscrire</a>
          <a href="https://social.example.com/x">Réseau social</a>
        "#;
        let links = extract_useful_link_candidates(html, 4);
        assert_eq!(links.len(), 1);
        assert!(links[0].url.contains("progress-tracker"));
    }

    #[test]
    fn prompt_example_parses_with_actions() {
        let prompt = include_str!("../prompts/digest_cut_reformat.system.txt");
        let start = prompt.find("{\"explanationFr\"").expect("example json");
        let end = prompt[start..]
            .find('\n')
            .map_or(prompt.len(), |i| start + i);
        let example: serde_json::Value =
            serde_json::from_str(prompt[start..end].trim()).expect("example parses");
        let dto: ReformatDto = serde_json::from_value(example).expect("example dto");
        assert!(!dto.highlight_value.is_empty());
        assert!(!dto.actions.is_empty());
        assert!(dto.hide_footer);
        assert!(validate_reformat_dto(&dto).is_ok());
    }

    #[test]
    fn drops_attribute_soup_and_keeps_plain_facts() {
        let mut dto = empty_dto();
        dto.title = "Duplicata".into();
        dto.paragraphs = vec![
            "a\" target=\"_blank\" style=\"text-decoration:none\" data-block".into(),
            "Phrase utile.".into(),
        ];
        let excerpts = ZoneExcerpts {
            header: "Le 01/02/2020. MR EXEMPLE MARTIN".into(),
            body: "Achat du 03/02/2020 sur www.exemple-boutique.fr".into(),
            footer: String::new(),
        };
        scrub_reformat_fields(&mut dto);
        fill_missing_facts(&mut dto, &excerpts);
        assert_eq!(dto.paragraphs, vec!["Phrase utile.".to_string()]);
        assert!(dto.rows.iter().any(|row| row.value == "01/02/2020"));
        assert!(dto.rows.iter().any(|row| row.value == "03/02/2020"));
        assert!(dto
            .rows
            .iter()
            .any(|row| row.label == "Destinataire" && row.value.contains("EXEMPLE")));
        assert!(dto
            .actions
            .iter()
            .any(|action| action.url == "https://www.exemple-boutique.fr"));
    }

    #[test]
    fn failed_cut_still_feeds_the_mail_text() {
        let source = "<p>Bonjour Camille Martin. Facture du 04/05/2021.</p><p>a\" target=\"_blank\" style=\"text-decoration:none\"</p>";
        let plain = reading_source_plain("", false, source);
        assert!(plain.contains("Camille Martin"));
        assert!(plain.contains("04/05/2021"));
        assert!(!plain.contains("text-decoration"));
        let cut = "Titre court et corps déjà assez long pour rester la source.";
        assert_eq!(reading_source_plain(cut, true, source), cut);
    }
}
