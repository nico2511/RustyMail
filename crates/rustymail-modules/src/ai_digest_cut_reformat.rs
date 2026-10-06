//! Après sélection des zones : réécriture / reformatage du texte pour la lecture.

use serde::Deserialize;
use serde_json::{json, Value};

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
    details_heading: String,
    #[serde(default)]
    rows: Vec<ReformatRowDto>,
    #[serde(default)]
    paragraphs: Vec<String>,
    #[serde(default)]
    hide_footer: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReformatRowDto {
    #[serde(default)]
    label: String,
    #[serde(default)]
    value: String,
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
    let mut fallback_reason = None;
    if let Some(engine) = engine {
        match reformat_with_llm(
            engine,
            sender_email,
            subject,
            output_language,
            current,
            &excerpts,
        ) {
            Ok(dto) => {
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
        fallback_reason = Some(
            "Aucun moteur IA joignable pour le reformatage (Paramètres → IA)."
                .into(),
        );
    }
    let (proposal, reading_html) = heuristic_reformat(current, subject, &excerpts);
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
    let plain = strip_tags_to_plain(&reading);
    let subject = subject.split_whitespace().collect::<Vec<_>>().join(" ");
    let header = if subject.is_empty() {
        truncate_chars(&plain, EXCERPT_CHARS / 3)
    } else {
        truncate_chars(
            &format!("{subject} — {plain}"),
            EXCERPT_CHARS / 3,
        )
    };
    // Découpe grossière : tout le rendu as_is est le corps utile ; footer = zone footer du mail source.
    ZoneExcerpts {
        header,
        body: truncate_chars(&plain, EXCERPT_CHARS),
        footer: truncate_chars(
            &proposal
                .zones
                .footer
                .rationale
                .clone()
                .unwrap_or_default(),
            200,
        ),
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
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn reformat_with_llm(
    engine: &mut LlmEngine,
    sender_email: &str,
    subject: &str,
    output_language: &str,
    current: &DigestCutProposal,
    excerpts: &ZoneExcerpts,
) -> Result<ReformatDto, LlmError> {
    let system = crate::prompts::system_prompt_for_language("digest_cut_reformat", output_language);
    let slim = json!({
        "fixtureId": current.fixture_id,
        "headerAction": current.zones.header.action,
        "bodyAction": current.zones.body.action,
        "footerAction": current.zones.footer.action,
    });
    let subject_line = subject.split_whitespace().collect::<Vec<_>>().join(" ");
    let user = format!(
        "Sender (context only): {}\nSubject (context only): {}\nZones: {}\n\n{}\n\n{}\n\n{}",
        sender_email.trim(),
        truncate_chars(&subject_line, 160),
        slim,
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
    if bad(&dto.explanation_fr) || bad(&dto.title) || bad(&dto.amount) || bad(&dto.details_heading)
    {
        return Err(LlmError::InvalidJson("reformat fields".into()));
    }
    if dto.rows.len() > 8 || dto.paragraphs.len() > 4 {
        return Err(LlmError::InvalidJson("reformat size".into()));
    }
    for row in &dto.rows {
        if bad(&row.label) || bad(&row.value) {
            return Err(LlmError::InvalidJson("reformat row".into()));
        }
    }
    for p in &dto.paragraphs {
        if bad(p) {
            return Err(LlmError::InvalidJson("reformat paragraph".into()));
        }
    }
    if dto.title.trim().is_empty()
        && dto.amount.trim().is_empty()
        && dto.rows.is_empty()
        && dto.paragraphs.is_empty()
    {
        return Err(LlmError::InvalidJson("reformat empty".into()));
    }
    Ok(())
}

fn parse_presentation(raw: Option<&str>, fallback: ZonePresentation) -> ZonePresentation {
    match raw.map(str::trim).unwrap_or("").to_ascii_lowercase().as_str() {
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
    let header_pres = parse_presentation(
        dto.header_presentation.as_deref(),
        ZonePresentation::AsIs,
    );
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

fn heuristic_reformat(
    current: &DigestCutProposal,
    subject: &str,
    excerpts: &ZoneExcerpts,
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
    let currency_hits: Vec<&str> = lines
        .iter()
        .copied()
        .filter(|l| {
            let u = l.to_ascii_uppercase();
            u.contains("EUR") || u.contains("USD") || l.contains('€') || l.contains('$')
        })
        .collect();
    // Catalogue promo : beaucoup de prix isolés → pas de tableau inventé.
    let promo_catalog = currency_hits.len() >= 5
        && !text.to_ascii_lowercase().contains("commande")
        && !text.to_ascii_lowercase().contains("order")
        && !text.to_ascii_lowercase().contains("alerte")
        && !text.to_ascii_lowercase().contains("livré")
        && !text.to_ascii_lowercase().contains("delivered");
    let amount = if promo_catalog {
        None
    } else {
        currency_hits.first().map(|s| (*s).to_string())
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
    let used_in_rows: std::collections::HashSet<String> = rows
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
            // Garder une courte explication utile ; jeter CTA / légal / désinscription.
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
    let dto = ReformatDto {
        explanation_fr: "Reformatage structurel local (sans modèle) : lecture clarifiée.".into(),
        header_presentation: Some(if amount.is_some() {
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
        amount: amount.map(|a| clip_field(&a, 120)).unwrap_or_default(),
        details_heading: "Détails".into(),
        rows,
        paragraphs,
        hide_footer: true,
    };
    let (mut proposal, html) = apply_reformat_dto(current, dto);
    proposal.source = ProposalSource::Heuristic;
    (proposal, html)
}

fn esc_pcdata(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn build_reading_html(fixture_id: &str, dto: &ReformatDto) -> String {
    let mut out = format!(
        "<!-- rustymail:digest id=\"{}\" -->\n<article class=\"rm-digest\">\n",
        esc_pcdata(fixture_id)
    );
    let title = clip_field(dto.title.trim(), 120);
    let amount = clip_field(dto.amount.trim(), 120);
    if !title.is_empty() {
        out.push_str(&format!("  <h2>{}</h2>\n", esc_pcdata(&title)));
    }
    if !amount.is_empty() {
        out.push_str(&format!(
            "  <p><strong>{}</strong></p>\n",
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
    for p in dto.paragraphs.iter().take(4) {
        let line = clip_field(p.trim(), 120);
        if line.is_empty() {
            continue;
        }
        out.push_str("  <p>");
        out.push_str(&esc_pcdata(&line));
        out.push_str("</p>\n");
    }
    out.push_str("</article>\n");
    out
}

#[cfg(test)]
mod tests {
    use super::{build_reading_html, validate_reformat_dto, ReformatDto, ReformatRowDto};

    #[test]
    fn rejects_html_injection_in_fields() {
        let dto = ReformatDto {
            explanation_fr: "ok".into(),
            header_presentation: Some("prominent".into()),
            body_presentation: Some("key_value".into()),
            title: "<script>x</script>".into(),
            amount: String::new(),
            details_heading: String::new(),
            rows: vec![],
            paragraphs: vec![],
            hide_footer: true,
        };
        assert!(validate_reformat_dto(&dto).is_err());
    }

    #[test]
    fn builds_table_reading_html() {
        let dto = ReformatDto {
            explanation_fr: "ok".into(),
            header_presentation: Some("prominent".into()),
            body_presentation: Some("key_value".into()),
            title: "Paiement reçu".into(),
            amount: "+ 50 EUR".into(),
            details_heading: "Détails".into(),
            rows: vec![ReformatRowDto {
                label: "Date".into(),
                value: "1 mai".into(),
            }],
            paragraphs: vec![],
            hide_footer: true,
        };
        let html = build_reading_html("exemple-fr", &dto);
        assert!(html.contains("<h2>Paiement reçu</h2>"));
        assert!(html.contains("+ 50 EUR"));
        assert!(html.contains("<th scope=\"row\">Date</th>"));
        assert!(html.contains("rm-digest"));
    }

    #[test]
    fn prompt_example_allows_key_value_plus_commentary() {
        let prompt = include_str!("../prompts/digest_cut_reformat.system.txt");
        let start = prompt.find("{\"explanationFr\"").expect("example json");
        let end = prompt[start..]
            .find('\n')
            .map_or(prompt.len(), |i| start + i);
        let example: serde_json::Value =
            serde_json::from_str(prompt[start..end].trim()).expect("example parses");
        let dto: ReformatDto = serde_json::from_value(example).expect("example dto");
        assert!(dto.rows.len() >= 2);
        assert!(!dto.paragraphs.is_empty());
        assert!(dto.hide_footer);
        assert!(validate_reformat_dto(&dto).is_ok());
    }
}
