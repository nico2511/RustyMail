//! Proposition IA de zones pour l'éditeur de découpe digest (hors `clean_message`).

use serde::Deserialize;

use crate::ai_llm_util::{
    gen_params_json_for_prompt, parse_model_json, truncate_chars, untrusted_mail_for_engine,
};
use crate::mail_cleaning::digest_fixtures::proposal::{
    analyze_html_structure_heuristic, proposal_to_fixture_yaml, structure_outline_for_llm,
    DigestCutAnchor, DigestCutMatch, DigestCutProposal, DigestCutZone, DigestCutZones,
    DomainRuleDto, ProposalSource,
};
use crate::mail_cleaning::digest_fixtures::{AnchorRole, ZoneAction, ZonePresentation};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DigestCutDto {
    fixture_id: String,
    rule_set_version: String,
    #[serde(rename = "match")]
    match_: DigestCutMatchDto,
    zones: DigestCutZonesDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DigestCutMatchDto {
    sender_domains: Vec<DomainRuleDto>,
    structure_root: String,
    min_children: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DigestCutZonesDto {
    header: DigestCutZoneDto,
    body: DigestCutZoneDto,
    footer: DigestCutZoneDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DigestCutZoneDto {
    action: ZoneAction,
    presentation: Option<ZonePresentation>,
    anchors: Vec<DigestCutAnchor>,
    details_heading: Option<String>,
    row_selector: Option<String>,
    rationale: Option<String>,
}

/// Propose des zones : heuristique DOM d'abord, modèle optionnel si disponible.
pub fn propose_digest_cut_zones(
    engine: Option<&mut LlmEngine>,
    html: &str,
    sender_email: &str,
    output_language: &str,
) -> DigestCutProposal {
    let fallback = analyze_html_structure_heuristic(html, sender_email);
    if let Some(engine) = engine {
        if let Ok(llm) = propose_with_llm(engine, html, sender_email, output_language) {
            if proposal_to_fixture_yaml(&llm).is_ok() {
                return llm;
            }
        }
    }
    fallback
}

fn propose_with_llm(
    engine: &mut LlmEngine,
    html: &str,
    sender_email: &str,
    output_language: &str,
) -> Result<DigestCutProposal, LlmError> {
    let outline = structure_outline_for_llm(html);
    let clipped = truncate_chars(html, 24_000);
    let system = crate::prompts::system_prompt_for_language("digest_cut", output_language);
    let user = format!(
        "Sender email (for domain matching only): {}\n\nDOM outline (tags/classes/order):\n{}\n\n{}",
        sender_email.trim(),
        outline,
        untrusted_mail_for_engine(engine, "digest-cut-sample-html", &clipped)
    );
    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_json_for_prompt(engine, system.as_str(), &user, 256, 2_048),
    )?;
    let dto: DigestCutDto = parse_model_json(&raw)?;
    validate_digest_cut_dto(&dto)?;
    Ok(DigestCutProposal {
        fixture_id: dto.fixture_id.trim().to_string(),
        rule_set_version: dto.rule_set_version.trim().to_string(),
        source: ProposalSource::Llm,
        match_: DigestCutMatch {
            sender_domains: dto.match_.sender_domains,
            structure_root: dto.match_.structure_root.trim().to_string(),
            min_children: dto.match_.min_children,
        },
        zones: DigestCutZones {
            header: zone_from_dto(dto.zones.header),
            body: zone_from_dto(dto.zones.body),
            footer: zone_from_dto(dto.zones.footer),
        },
    })
}

fn zone_from_dto(zone: DigestCutZoneDto) -> DigestCutZone {
    DigestCutZone {
        action: zone.action,
        presentation: zone.presentation,
        anchors: zone.anchors,
        details_heading: zone.details_heading,
        row_selector: zone.row_selector,
        rationale: clip_rationale(zone.rationale),
    }
}

fn clip_rationale(value: Option<String>) -> Option<String> {
    value.map(|s| s.trim().chars().take(200).collect())
}

fn validate_digest_cut_dto(dto: &DigestCutDto) -> Result<(), LlmError> {
    if dto.fixture_id.trim().is_empty() || dto.fixture_id.len() > 40 {
        return Err(LlmError::InvalidJson("fixtureId".into()));
    }
    if !dto
        .fixture_id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(LlmError::InvalidJson("fixtureId charset".into()));
    }
    if dto.rule_set_version.trim().is_empty() {
        return Err(LlmError::InvalidJson("ruleSetVersion".into()));
    }
    if dto.match_.sender_domains.is_empty() {
        return Err(LlmError::InvalidJson("senderDomains".into()));
    }
    if dto.match_.structure_root.trim().is_empty() {
        return Err(LlmError::InvalidJson("structureRoot".into()));
    }
    if dto.match_.min_children == 0 || dto.match_.min_children > 64 {
        return Err(LlmError::InvalidJson("minChildren".into()));
    }
    for zone in [&dto.zones.header, &dto.zones.body, &dto.zones.footer] {
        for anchor in &zone.anchors {
            if let Some(sel) = &anchor.selector {
                if sel.contains('>') || sel.contains(' ') {
                    return Err(LlmError::InvalidJson("selector".into()));
                }
            }
            if let Some(r) = &zone.rationale {
                if r.to_ascii_lowercase().contains("ignore all") {
                    return Err(LlmError::InvalidJson("rationale".into()));
                }
            }
            if anchor.role == Some(AnchorRole::Title) && anchor.selector.is_none() {
                return Err(LlmError::InvalidJson("anchor".into()));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_digest_cut_dto;
    use crate::mail_cleaning::digest_fixtures::proposal::proposal_to_fixture_yaml;
    use crate::mail_cleaning::digest_fixtures::{set_installed_reading_fixture, ZoneAction};

    #[test]
    fn invalid_llm_shape_is_rejected_before_yaml() {
        let dto = super::DigestCutDto {
            fixture_id: "bad id".into(),
            rule_set_version: "1".into(),
            match_: super::DigestCutMatchDto {
                sender_domains: vec![],
                structure_root: "div".into(),
                min_children: 1,
            },
            zones: super::DigestCutZonesDto {
                header: super::DigestCutZoneDto {
                    action: ZoneAction::Show,
                    presentation: None,
                    anchors: vec![],
                    details_heading: None,
                    row_selector: None,
                    rationale: None,
                },
                body: super::DigestCutZoneDto {
                    action: ZoneAction::Show,
                    presentation: None,
                    anchors: vec![],
                    details_heading: None,
                    row_selector: None,
                    rationale: None,
                },
                footer: super::DigestCutZoneDto {
                    action: ZoneAction::Hide,
                    presentation: None,
                    anchors: vec![],
                    details_heading: None,
                    row_selector: None,
                    rationale: None,
                },
            },
        };
        assert!(validate_digest_cut_dto(&dto).is_err());
        set_installed_reading_fixture(None);
        assert!(crate::mail_cleaning::digest_fixtures::installed_reading_fixture_id().is_none());
    }

    #[test]
    fn proposal_yaml_roundtrip_does_not_touch_reading_registry() {
        set_installed_reading_fixture(None);
        let proposal = crate::mail_cleaning::digest_fixtures::analyze_html_structure_heuristic(
            include_str!("../tests/fixtures/deblock/receive_200eur.html"),
            "support@deblock.com",
        );
        let yaml = proposal_to_fixture_yaml(&proposal).expect("yaml");
        assert!(yaml.contains("id: deblock-com"));
        assert!(crate::mail_cleaning::digest_fixtures::installed_reading_fixture_id().is_none());
    }
}
