//! Proposition de découpe digest (éditeur) : analyse DOM locale + conversion YAML.
//!
//! Ne touche pas au registre de lecture. Ne s'appelle pas depuis `clean_message`.

use scraper::{ElementRef, Html, Selector};
use serde::{Deserialize, Serialize};

use super::model::{
    parse_fixture, AnchorRole, DigestFixture, FixtureError, ZoneAction, ZonePresentation, ZoneSpec,
};

const MAX_HTML_SCAN: usize = 400_000;
const MAX_OUTLINE_NODES: usize = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProposalSource {
    Heuristic,
    Llm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutProposal {
    pub fixture_id: String,
    pub rule_set_version: String,
    pub source: ProposalSource,
    #[serde(rename = "match")]
    pub match_: DigestCutMatch,
    pub zones: DigestCutZones,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutMatch {
    pub sender_domains: Vec<DomainRuleDto>,
    pub structure_root: String,
    pub min_children: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainRuleDto {
    #[serde(default)]
    pub exact: Option<String>,
    #[serde(default)]
    pub suffix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutZones {
    pub header: DigestCutZone,
    pub body: DigestCutZone,
    pub footer: DigestCutZone,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutZone {
    pub action: ZoneAction,
    #[serde(default)]
    pub presentation: Option<ZonePresentation>,
    #[serde(default)]
    pub anchors: Vec<DigestCutAnchor>,
    #[serde(default)]
    pub details_heading: Option<String>,
    #[serde(default)]
    pub row_selector: Option<String>,
    #[serde(default)]
    pub rationale: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutAnchor {
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub class_contains: Option<String>,
    #[serde(default)]
    pub index: Option<usize>,
    #[serde(default)]
    pub text_contains_any: Vec<String>,
    #[serde(default)]
    pub role: Option<AnchorRole>,
}

/// Analyse structurelle locale (balises, classes, ordre). Pas de modèle.
pub fn analyze_html_structure_heuristic(html: &str, sender_email: &str) -> DigestCutProposal {
    let clipped = clip_html(html);
    let outline = build_structure_outline(&clipped);
    let deblock = try_deblock_proposal(&clipped, sender_email);
    if let Some(proposal) = deblock {
        return proposal;
    }
    generic_proposal_from_outline(&outline, sender_email)
}

pub fn structure_outline_for_llm(html: &str) -> String {
    build_structure_outline(&clip_html(html))
}

pub fn proposal_to_fixture_yaml(proposal: &DigestCutProposal) -> Result<String, FixtureError> {
    let yaml = render_yaml(proposal);
    parse_fixture(&yaml)?;
    Ok(yaml)
}

pub fn empty_or_invalid_proposal_does_not_apply(
    yaml: &str,
    html: &str,
    sender_email: &str,
) -> bool {
    yaml.trim().is_empty()
        || parse_fixture(yaml).is_err()
        || super::apply_fixture_yaml(yaml, html, sender_email)
            .ok()
            .flatten()
            .is_none()
}

fn clip_html(html: &str) -> String {
    if html.len() <= MAX_HTML_SCAN {
        html.to_string()
    } else {
        html.chars().take(MAX_HTML_SCAN).collect()
    }
}

fn try_deblock_proposal(html: &str, sender_email: &str) -> Option<DigestCutProposal> {
    let document = Html::parse_fragment(html);
    let root_sel = Selector::parse("div.f-fallback").ok()?;
    let root = document.select(&root_sel).next()?;
    if root.children().filter(|n| n.value().is_element()).count() < 3 {
        return None;
    }
    let domain = email_domain(sender_email).unwrap_or_else(|| "deblock.com".to_string());
    let sender_domains = deblock_sender_domains(&domain);
    Some(DigestCutProposal {
        fixture_id: slug_from_domain(&domain),
        rule_set_version: "1".to_string(),
        source: ProposalSource::Heuristic,
        match_: DigestCutMatch {
            sender_domains,
            structure_root: "div.f-fallback".to_string(),
            min_children: 3,
        },
        zones: DigestCutZones {
            header: DigestCutZone {
                action: ZoneAction::Show,
                presentation: Some(ZonePresentation::Prominent),
                anchors: vec![
                    anchor("h3", Some(0), None, None),
                    anchor("div", None, Some("code".to_string()), Some(AnchorRole::Amount)),
                ],
                details_heading: None,
                row_selector: None,
                rationale: Some(
                    "Premier titre et bloc montant dans div.f-fallback (structure Deblock)."
                        .to_string(),
                ),
            },
            body: DigestCutZone {
                action: ZoneAction::Show,
                presentation: Some(ZonePresentation::KeyValue),
                anchors: vec![DigestCutAnchor {
                    selector: Some("h3".to_string()),
                    class_contains: None,
                    index: Some(1),
                    text_contains_any: vec![
                        "détails".into(),
                        "details".into(),
                        "👇".into(),
                    ],
                    role: None,
                }],
                details_heading: Some("Détails".to_string()),
                row_selector: Some("p".to_string()),
                rationale: Some(
                    "Lignes libellé/valeur après le second h3 jusqu'au pied.".to_string(),
                ),
            },
            footer: DigestCutZone {
                action: ZoneAction::Hide,
                presentation: None,
                anchors: vec![DigestCutAnchor {
                    selector: Some("div".to_string()),
                    class_contains: Some("warning".to_string()),
                    index: None,
                    text_contains_any: vec![],
                    role: None,
                }],
                details_heading: None,
                row_selector: None,
                rationale: Some("Pied marketing / avertissement (div.warning).".to_string()),
            },
        },
    })
}

fn generic_proposal_from_outline(outline: &str, sender_email: &str) -> DigestCutProposal {
    let domain = email_domain(sender_email).unwrap_or_else(|| "example.com".to_string());
    let root = infer_root_selector(outline).unwrap_or_else(|| "div".to_string());
    DigestCutProposal {
        fixture_id: slug_from_domain(&domain),
        rule_set_version: "1".to_string(),
        source: ProposalSource::Heuristic,
        match_: DigestCutMatch {
            sender_domains: vec![DomainRuleDto {
                exact: Some(domain),
                suffix: None,
            }],
            structure_root: root,
            min_children: 2,
        },
        zones: DigestCutZones {
            header: DigestCutZone {
                action: ZoneAction::Show,
                presentation: Some(ZonePresentation::AsIs),
                anchors: vec![anchor("h1", Some(0), None, Some(AnchorRole::Title))],
                details_heading: None,
                row_selector: None,
                rationale: Some("Premier titre repéré dans la racine.".to_string()),
            },
            body: DigestCutZone {
                action: ZoneAction::Show,
                presentation: Some(ZonePresentation::AsIs),
                anchors: vec![anchor("p", Some(0), None, None)],
                details_heading: None,
                row_selector: None,
                rationale: Some("Premier paragraphe de substance.".to_string()),
            },
            footer: DigestCutZone {
                action: ZoneAction::Hide,
                presentation: None,
                anchors: vec![DigestCutAnchor {
                    selector: Some("div".to_string()),
                    class_contains: Some("footer".to_string()),
                    index: None,
                    text_contains_any: vec![],
                    role: None,
                }],
                details_heading: None,
                row_selector: None,
                rationale: Some("Bloc pied probable (classe footer).".to_string()),
            },
        },
    }
}

fn build_structure_outline(html: &str) -> String {
    let document = Html::parse_fragment(html);
    let body = document.root_element();
    let mut lines = Vec::new();
    walk_element(body, 0, &mut lines);
    if lines.is_empty() {
        return "(empty fragment)".to_string();
    }
    lines.join("\n")
}

fn walk_element(el: ElementRef<'_>, depth: usize, lines: &mut Vec<String>) {
    if lines.len() >= MAX_OUTLINE_NODES {
        return;
    }
    let tag = el.value().name();
    let id = el.value().attr("id").unwrap_or("");
    let class = el.value().attr("class").unwrap_or("");
    let text = el
        .text()
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .take(8)
        .collect::<Vec<_>>()
        .join(" ");
    let indent = "  ".repeat(depth);
    let id_part = if id.is_empty() {
        String::new()
    } else {
        format!(" id={}", id)
    };
    let class_part = if class.is_empty() {
        String::new()
    } else {
        format!(" class={}", class.split_whitespace().take(3).collect::<Vec<_>>().join(" "))
    };
    let text_part = if text.is_empty() {
        String::new()
    } else {
        format!(" text=\"{}\"", text)
    };
    lines.push(format!(
        "{indent}- {tag}{id_part}{class_part}{text_part}"
    ));
    for child in el.children().filter_map(ElementRef::wrap) {
        walk_element(child, depth + 1, lines);
    }
}

fn infer_root_selector(outline: &str) -> Option<String> {
    for line in outline.lines() {
        if line.contains("div class=") {
            let class = line
                .split("class=")
                .nth(1)?
                .split_whitespace()
                .next()?
                .trim_matches('"');
            if !class.is_empty() {
                return Some(format!("div.{}", class.split_whitespace().next()?));
            }
        }
    }
    None
}

fn deblock_sender_domains(domain: &str) -> Vec<DomainRuleDto> {
    if domain == "deblock.com" || domain.ends_with(".deblock.com") {
        return vec![
            DomainRuleDto {
                exact: Some("deblock.com".to_string()),
                suffix: None,
            },
            DomainRuleDto {
                exact: None,
                suffix: Some(".deblock.com".to_string()),
            },
        ];
    }
    vec![DomainRuleDto {
        exact: Some(domain.to_string()),
        suffix: None,
    }]
}

fn slug_from_domain(domain: &str) -> String {
    let slug = domain
        .trim()
        .to_ascii_lowercase()
        .replace('.', "-")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect::<String>();
    if slug.is_empty() {
        "digest-cut".to_string()
    } else {
        slug.chars().take(40).collect()
    }
}

fn anchor(
    selector: &str,
    index: Option<usize>,
    class_contains: Option<String>,
    role: Option<AnchorRole>,
) -> DigestCutAnchor {
    DigestCutAnchor {
        selector: Some(selector.to_string()),
        class_contains,
        index,
        text_contains_any: vec![],
        role,
    }
}

fn email_domain(email: &str) -> Option<String> {
    let at = email.rfind('@')?;
    let domain = email[at + 1..].trim().to_ascii_lowercase();
    if domain.is_empty() || domain.contains('@') {
        None
    } else {
        Some(domain)
    }
}

fn render_yaml(proposal: &DigestCutProposal) -> String {
    let mut s = String::new();
    s.push_str(&format!("id: {}\n", proposal.fixture_id));
    s.push_str(&format!("rule_set_version: \"{}\"\n", proposal.rule_set_version));
    s.push_str("match:\n");
    s.push_str("  sender:\n    domains:\n");
    for rule in &proposal.match_.sender_domains {
        if let Some(exact) = rule.exact.as_deref().filter(|v| !v.is_empty()) {
            s.push_str(&format!("      - exact: {}\n", exact));
        } else if let Some(suffix) = rule.suffix.as_deref().filter(|v| !v.is_empty()) {
            s.push_str(&format!("      - suffix: {}\n", suffix));
        }
    }
    s.push_str("  structure:\n");
    s.push_str(&format!("    root: {}\n", proposal.match_.structure_root));
    s.push_str(&format!("    min_children: {}\n", proposal.match_.min_children));
    s.push_str("zones:\n");
    render_zone_yaml(&mut s, "header", &proposal.zones.header);
    render_zone_yaml(&mut s, "body", &proposal.zones.body);
    render_zone_yaml(&mut s, "footer", &proposal.zones.footer);
    s
}

fn render_zone_yaml(out: &mut String, name: &str, zone: &DigestCutZone) {
    out.push_str(&format!("  {}:\n", name));
    out.push_str(&format!("    action: {}\n", action_name(zone.action)));
    if let Some(presentation) = zone.presentation {
        out.push_str(&format!("    presentation: {}\n", presentation_name(presentation)));
    }
    if !zone.anchors.is_empty() {
        out.push_str("    anchors:\n");
        for anchor in &zone.anchors {
            out.push_str("      -\n");
            if let Some(sel) = &anchor.selector {
                out.push_str(&format!("        selector: {}\n", sel));
            }
            if let Some(idx) = anchor.index {
                out.push_str(&format!("        index: {}\n", idx));
            }
            if let Some(cls) = &anchor.class_contains {
                out.push_str(&format!("        class_contains: {}\n", cls));
            }
            if !anchor.text_contains_any.is_empty() {
                out.push_str("        text_contains_any:\n");
                for needle in &anchor.text_contains_any {
                    out.push_str(&format!("          - {}\n", yaml_scalar(needle)));
                }
            }
            if let Some(role) = anchor.role {
                out.push_str(&format!("        role: {}\n", role_name(role)));
            }
        }
    }
    if let Some(heading) = &zone.details_heading {
        out.push_str(&format!("    details_heading: {}\n", yaml_scalar(heading)));
    }
    if name == "body" && zone.row_selector.as_deref() == Some("p") {
        out.push_str("    rows:\n");
        out.push_str("      selector: p\n");
        out.push_str("      stop_when:\n");
        out.push_str("        class_contains: warning\n");
        out.push_str("        or_tag: h3\n");
        out.push_str("      label: \"b, strong\"\n");
        out.push_str("      value: after_br\n");
    }
}

fn yaml_scalar(value: &str) -> String {
    if value.chars().any(|c| c.is_whitespace() || ":{}[]&*#?|-<>=!%@`".contains(c)) {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value.to_string()
    }
}

fn action_name(action: ZoneAction) -> &'static str {
    match action {
        ZoneAction::Show => "show",
        ZoneAction::Hide => "hide",
        ZoneAction::Collapse => "collapse",
    }
}

fn presentation_name(presentation: ZonePresentation) -> &'static str {
    match presentation {
        ZonePresentation::Prominent => "prominent",
        ZonePresentation::KeyValue => "key_value",
        ZonePresentation::AsIs => "as_is",
    }
}

fn role_name(role: AnchorRole) -> &'static str {
    match role {
        AnchorRole::Title => "title",
        AnchorRole::Amount => "amount",
    }
}

pub fn proposal_from_fixture(fixture: &DigestFixture) -> DigestCutProposal {
    DigestCutProposal {
        fixture_id: fixture.id.clone(),
        rule_set_version: fixture.rule_set_version.clone(),
        source: ProposalSource::Heuristic,
        match_: DigestCutMatch {
            sender_domains: fixture
                .sender_rules()
                .iter()
                .map(|rule| DomainRuleDto {
                    exact: rule.exact.clone(),
                    suffix: rule.suffix.clone(),
                })
                .collect(),
            structure_root: fixture.match_.structure.root.clone(),
            min_children: fixture.match_.structure.min_children.unwrap_or(1),
        },
        zones: DigestCutZones {
            header: zone_from_spec(&fixture.zones.header),
            body: zone_from_spec(&fixture.zones.body),
            footer: zone_from_spec(&fixture.zones.footer),
        },
    }
}

fn zone_from_spec(zone: &ZoneSpec) -> DigestCutZone {
    DigestCutZone {
        action: zone.resolved_action(),
        presentation: zone.presentation,
        anchors: zone
            .anchors
            .iter()
            .map(|a| DigestCutAnchor {
                selector: a.selector.clone(),
                class_contains: a.class_contains.clone(),
                index: a.index,
                text_contains_any: a.text_contains_any.clone(),
                role: a.role,
            })
            .collect(),
        details_heading: zone.details_heading.clone(),
        row_selector: if zone.rows.is_some() {
            Some("p".to_string())
        } else {
            None
        },
        rationale: None,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        analyze_html_structure_heuristic, empty_or_invalid_proposal_does_not_apply,
        proposal_to_fixture_yaml, structure_outline_for_llm,
    };
    use crate::mail_cleaning::digest_fixtures::{
        installed_reading_fixture_id, parse_fixture, preview_candidate_fixture,
        set_installed_reading_fixture, DEBLOCK_FIXTURE_YAML,
    };

    const RECEIVE: &str = include_str!("../../../tests/fixtures/deblock/receive_200eur.html");

    #[test]
    fn heuristic_deblock_proposal_yields_applicable_yaml() {
        let proposal = analyze_html_structure_heuristic(RECEIVE, "support@deblock.com");
        assert_eq!(proposal.fixture_id, "deblock-com");
        let yaml = proposal_to_fixture_yaml(&proposal).expect("yaml");
        let preview = preview_candidate_fixture(&yaml, RECEIVE, "support@deblock.com");
        assert!(preview.applicable);
        assert!(preview.html.unwrap().contains("+ 200 EUR"));
    }

    #[test]
    fn structure_outline_is_markup_not_a_screenshot() {
        let outline = structure_outline_for_llm(RECEIVE);
        assert!(outline.contains("div class=f-fallback"));
        assert!(outline.contains("h3"));
    }

    #[test]
    fn bad_or_empty_yaml_does_not_apply_as_reading() {
        set_installed_reading_fixture(None);
        assert!(empty_or_invalid_proposal_does_not_apply("", RECEIVE, "support@deblock.com"));
        assert!(empty_or_invalid_proposal_does_not_apply(
            "not: [valid, yaml",
            RECEIVE,
            "support@deblock.com"
        ));
        let broken = r#"
id: bad
rule_set_version: "1"
match:
  sender:
    domains:
      - exact: deblock.com
  structure:
    root: "div > p"
zones:
  header:
    action: show
  body:
    action: show
  footer:
    action: hide
"#;
        assert!(empty_or_invalid_proposal_does_not_apply(broken, RECEIVE, "support@deblock.com"));
        assert!(installed_reading_fixture_id().is_none());
    }

    #[test]
    fn embedded_deblock_fixture_still_oracle() {
        let fixture = parse_fixture(DEBLOCK_FIXTURE_YAML).expect("deblock");
        let yaml = proposal_to_fixture_yaml(&super::proposal_from_fixture(&fixture)).expect("yaml");
        assert!(yaml.contains("div.f-fallback"));
    }
}
