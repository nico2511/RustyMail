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
    /// Phrase pour un novice. Absente du YAML de fixture.
    #[serde(default)]
    pub explanation_fr: String,
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
///
/// Le HTML passé au moteur de fixture est celui après nettoyage générique,
/// le même que l'aperçu. Fonctionne pour n'importe quel mail, pas seulement Deblock.
pub fn analyze_html_structure_heuristic(html: &str, sender_email: &str) -> DigestCutProposal {
    let working = prepared_html(html);
    let mut proposal = try_deblock_proposal(&working, sender_email).unwrap_or_else(|| {
        generic_proposal_from_dom(&working, sender_email).unwrap_or_else(|| {
            generic_proposal_from_outline(&build_structure_outline(&working), sender_email)
        })
    });
    ensure_shown_zones_have_anchors(&mut proposal);
    if proposal.explanation_fr.trim().is_empty() {
        proposal.explanation_fr = french_explanation(&proposal);
    }
    proposal
}

/// Un corps (ou un en-tête affiché) sans ancre ne rend rien : dernier filet de sécurité.
fn ensure_shown_zones_have_anchors(proposal: &mut DigestCutProposal) {
    if proposal.zones.body.anchors.is_empty() {
        proposal.zones.body.anchors = vec![anchor("p", Some(0), None, None)];
        proposal
            .zones
            .body
            .rationale
            .get_or_insert_with(|| "Premier paragraphe de substance.".to_string());
    }
    if proposal.zones.header.anchors.is_empty() && proposal.zones.header.action != ZoneAction::Hide
    {
        proposal.zones.header.anchors = vec![anchor("h1", Some(0), None, Some(AnchorRole::Title))];
        proposal
            .zones
            .header
            .rationale
            .get_or_insert_with(|| "Premier titre repéré dans la racine.".to_string());
    }
}

pub fn structure_outline_for_llm(html: &str) -> String {
    build_structure_outline(&prepared_html(html))
}

pub fn french_explanation(proposal: &DigestCutProposal) -> String {
    let domain = proposal
        .match_
        .sender_domains
        .iter()
        .find_map(|rule| {
            rule.exact
                .as_deref()
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .or_else(|| {
                    rule.suffix
                        .as_deref()
                        .filter(|value| !value.is_empty())
                        .map(str::to_string)
                })
        })
        .unwrap_or_else(|| "ce domaine".to_string());
    let text = format!(
        "Proposition pour {domain}. {} {} {} Ajustez Afficher, Masquer ou Replier, puis l'aperçu. Affiner redemande au modèle local. La lecture des mails ne change pas ici.",
        zone_sentence("L'en-tête", &proposal.zones.header),
        zone_sentence("Le corps", &proposal.zones.body),
        zone_sentence("Le pied", &proposal.zones.footer),
    );
    text.chars().take(500).collect()
}

fn zone_sentence(label: &str, zone: &DigestCutZone) -> String {
    let action = match zone.action {
        ZoneAction::Show => "est affiché",
        ZoneAction::Hide => "est masqué",
        ZoneAction::Collapse => "est replié",
    };
    if let Some(why) = zone
        .rationale
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        format!("{label} {action} : {why}")
    } else {
        format!("{label} {action}.")
    }
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
                    anchor(
                        "div",
                        None,
                        Some("code".to_string()),
                        Some(AnchorRole::Amount),
                    ),
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
                    text_contains_any: vec!["détails".into(), "details".into(), "👇".into()],
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
        explanation_fr: String::new(),
    })
}

fn prepared_html(html: &str) -> String {
    let clipped = clip_html(html);
    let cleaned = crate::mail_cleaning::generic::generic_html_clean(&clipped);
    if cleaned.trim().is_empty() {
        clipped
    } else {
        cleaned
    }
}

/// Sous-chaînes (minuscules ASCII) cherchées dans `class` / `id` d'un bloc.
const FOOTER_NEEDLES: &[&str] = &[
    "footer",
    "unsub",
    "legal",
    "disclaimer",
    "warning",
    "pied",
    "mention",
    "copyright",
    "desabon",
    "desinscri",
    "optout",
    "opt-out",
    "privacy",
    "gdpr",
    "rgpd",
];

/// Sous-chaînes (minuscules) cherchées dans le texte visible d'un bloc court :
/// signature typique de pied marketing quand les classes ne disent rien.
const FOOTER_TEXT_NEEDLES: &[&str] = &[
    "unsubscribe",
    "désabonn",
    "desabonn",
    "se désinscrire",
    "désinscri",
    "desinscri",
    "mentions légales",
    "mentions legales",
    "copyright",
    "©",
    "all rights reserved",
    "tous droits réservés",
    "ne plus recevoir",
    "no longer wish to receive",
    "politique de confidentialité",
    "privacy policy",
    "manage your preferences",
    "gérer vos préférences",
];

/// Un pied de page est court : au-delà, un « unsubscribe » est probablement dans le corps.
const FOOTER_TEXT_MAX_CHARS: usize = 900;
const MAX_BODY_ANCHORS: usize = 6;
const MAX_FOOTER_ANCHORS: usize = 3;
const MAX_UNWRAP_DEPTH: usize = 24;

/// Plan de découpe des blocs enfants d'une racine (indices dans `children`).
struct ChildPlan {
    header: usize,
    body: Vec<usize>,
    footer: Vec<usize>,
}

fn generic_proposal_from_dom(html: &str, sender_email: &str) -> Option<DigestCutProposal> {
    let document = Html::parse_fragment(html);
    let (root_selector, root) = pick_structure_root(&document)?;
    let children = direct_children(root);
    if children.len() < 2 {
        return None;
    }
    let plan = classify_children(&children);
    let header_i = plan.header;
    let body_i = plan.body[0];
    let header_text = node_text(&children[header_i]);
    let body_text = node_text(&children[body_i]);
    let domain = email_domain(sender_email).unwrap_or_else(|| "example.com".to_string());
    let body_anchors = dedup_anchors(
        plan.body
            .iter()
            .map(|index| anchor_for_child(&children, *index))
            .collect(),
    );
    let body_rationale = if plan.body.len() > 1 {
        format!(
            "Le passage « {} » et {} autre(s) bloc(s) du message.",
            quote_clip(&body_text),
            plan.body.len() - 1
        )
    } else {
        format!("Le passage « {} ».", quote_clip(&body_text))
    };
    let footer = match plan.footer.first().copied() {
        Some(index) => DigestCutZone {
            action: ZoneAction::Hide,
            presentation: None,
            anchors: dedup_anchors(
                plan.footer
                    .iter()
                    .map(|i| anchor_for_child(&children, *i))
                    .collect(),
            ),
            details_heading: None,
            row_selector: None,
            rationale: Some(format!(
                "Bloc de fin « {} ».",
                quote_clip(&node_text(&children[index]))
            )),
        },
        None => DigestCutZone {
            action: ZoneAction::Hide,
            presentation: None,
            anchors: vec![],
            details_heading: None,
            row_selector: None,
            rationale: Some(
                "Aucun pied séparé repéré : le masquage ne retire rien tant qu'une ancre ne vise pas un bloc."
                    .to_string(),
            ),
        },
    };
    Some(DigestCutProposal {
        fixture_id: slug_from_domain(&domain),
        rule_set_version: "1".to_string(),
        source: ProposalSource::Heuristic,
        match_: DigestCutMatch {
            sender_domains: vec![DomainRuleDto {
                exact: Some(domain),
                suffix: None,
            }],
            structure_root: root_selector,
            min_children: 2,
        },
        zones: DigestCutZones {
            header: DigestCutZone {
                action: ZoneAction::Show,
                presentation: Some(ZonePresentation::AsIs),
                anchors: vec![anchor_for_child(&children, header_i)],
                details_heading: None,
                row_selector: None,
                rationale: Some(format!("Le titre « {} ».", quote_clip(&header_text))),
            },
            body: DigestCutZone {
                action: ZoneAction::Show,
                presentation: Some(ZonePresentation::AsIs),
                anchors: body_anchors,
                details_heading: None,
                row_selector: None,
                rationale: Some(body_rationale),
            },
            footer,
        },
        explanation_fr: String::new(),
    })
}

/// Descend à travers les enveloppes triviales (`div > div`, `table > tbody > tr > td > table`…)
/// jusqu'à l'élément qui porte vraiment plusieurs blocs de texte.
///
/// Avec exactement deux blocs dont l'un est un gros conteneur (≥ 3 blocs) et l'autre n'est pas
/// un pied, on descend aussi dans le conteneur (cas préheader + conteneur).
fn unwrap_trivial_wrappers(start: ElementRef<'_>) -> ElementRef<'_> {
    let mut current = start;
    for _ in 0..MAX_UNWRAP_DEPTH {
        let textual = textual_children(current);
        match textual.len() {
            1 => current = textual[0],
            2 => {
                let big = textual
                    .iter()
                    .copied()
                    .filter(|kid| textual_children(*kid).len() >= 3)
                    .max_by_key(|kid| textual_children(*kid).len());
                let Some(big) = big else { break };
                let other_is_footer = textual
                    .iter()
                    .any(|kid| kid.id() != big.id() && looks_like_footer_block(*kid));
                if other_is_footer {
                    break;
                }
                current = big;
            }
            _ => break,
        }
    }
    current
}

fn textual_children(el: ElementRef<'_>) -> Vec<ElementRef<'_>> {
    direct_children(el)
        .into_iter()
        .filter(|kid| !node_text(kid).is_empty())
        .collect()
}

fn pick_structure_root(doc: &Html) -> Option<(String, ElementRef<'_>)> {
    let unwrapped = unwrap_trivial_wrappers(doc.root_element());
    if !matches!(unwrapped.value().name(), "html" | "head" | "body")
        && textual_children(unwrapped).len() >= 2
    {
        if let Some(selector) = unique_selector(doc, unwrapped) {
            return Some((selector, unwrapped));
        }
    }
    let star = Selector::parse("*").ok()?;
    let mut ranked: Vec<(i32, ElementRef<'_>)> = Vec::new();
    for el in doc.select(&star) {
        let name = el.value().name();
        if matches!(
            name,
            "html" | "head" | "body" | "script" | "style" | "thead" | "tbody" | "tfoot"
        ) {
            continue;
        }
        let kids = direct_children(el);
        let textual = kids.iter().filter(|kid| !node_text(kid).is_empty()).count();
        if textual < 2 {
            continue;
        }
        ranked.push((textual as i32 * 100 + kids.len() as i32, el));
    }
    ranked.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, el) in ranked {
        if let Some(selector) = unique_selector(doc, el) {
            return Some((selector, el));
        }
    }
    None
}

fn unique_selector(doc: &Html, el: ElementRef<'_>) -> Option<String> {
    let tag = el.value().name();
    if tag.is_empty() || !tag.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    if let Some(class_attr) = el.value().attr("class") {
        for token in class_attr.split_whitespace() {
            if token.is_empty()
                || token.len() > 40
                || !token
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                continue;
            }
            let selector = format!("{tag}.{token}");
            if selector_hits_first(doc, &selector, el) {
                return Some(selector);
            }
        }
    }
    if selector_hits_first(doc, tag, el) {
        return Some(tag.to_string());
    }
    None
}

fn selector_hits_first(doc: &Html, selector: &str, el: ElementRef<'_>) -> bool {
    let Ok(parsed) = Selector::parse(selector) else {
        return false;
    };
    doc.select(&parsed)
        .next()
        .is_some_and(|hit| hit.id() == el.id())
}

/// Mêmes blocs que le moteur d'application (un `table` expose ses `tr`).
fn direct_children(el: ElementRef<'_>) -> Vec<ElementRef<'_>> {
    super::apply::child_elements(el)
}

fn node_text(el: &ElementRef<'_>) -> String {
    el.text()
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Répartit les blocs : un en-tête, au moins un bloc de corps (jamais vide), des blocs de pied.
fn classify_children(children: &[ElementRef<'_>]) -> ChildPlan {
    let textual: Vec<usize> = children
        .iter()
        .enumerate()
        .filter(|(_, child)| !node_text(child).is_empty())
        .map(|(index, _)| index)
        .collect();
    if textual.is_empty() {
        return ChildPlan {
            header: 0,
            body: vec![0],
            footer: vec![],
        };
    }
    let header = textual
        .iter()
        .copied()
        .find(|index| is_heading(children[*index]))
        .unwrap_or(textual[0]);
    // Les derniers blocs « pied » (classe/id ou texte), dans l'ordre du document.
    let mut footer: Vec<usize> = textual
        .iter()
        .copied()
        .filter(|index| *index != header && looks_like_footer_block(children[*index]))
        .collect();
    if footer.len() > MAX_FOOTER_ANCHORS {
        footer = footer.split_off(footer.len() - MAX_FOOTER_ANCHORS);
    }
    if footer.is_empty() && textual.len() >= 3 {
        let last = *textual.last().unwrap_or(&header);
        if last != header {
            footer.push(last);
        }
    }
    let mut body: Vec<usize> = textual
        .iter()
        .copied()
        .filter(|index| *index != header && !footer.contains(index))
        .take(MAX_BODY_ANCHORS)
        .collect();
    if body.is_empty() {
        // Jamais de corps vide : on réaffecte le premier pied, sinon l'en-tête.
        if footer.is_empty() {
            body.push(header);
        } else {
            body.push(footer.remove(0));
        }
    }
    ChildPlan {
        header,
        body,
        footer,
    }
}

fn is_heading(el: ElementRef<'_>) -> bool {
    matches!(el.value().name(), "h1" | "h2" | "h3" | "h4")
}

fn looks_like_footer(el: ElementRef<'_>) -> bool {
    let class = el.value().attr("class").unwrap_or("");
    let id = el.value().attr("id").unwrap_or("");
    let blob = format!("{class} {id}").to_ascii_lowercase();
    FOOTER_NEEDLES.iter().any(|needle| blob.contains(needle))
}

/// Détection par texte (désabonnement, mentions légales, copyright, « ne plus recevoir »…)
/// sur un bloc court.
fn looks_like_footer_text(el: ElementRef<'_>) -> bool {
    let text = node_text(&el);
    if text.is_empty() || text.chars().count() > FOOTER_TEXT_MAX_CHARS {
        return false;
    }
    let folded = text.to_lowercase();
    FOOTER_TEXT_NEEDLES
        .iter()
        .any(|needle| folded.contains(needle))
}

fn looks_like_footer_block(el: ElementRef<'_>) -> bool {
    looks_like_footer(el) || looks_like_footer_text(el)
}

fn dedup_anchors(anchors: Vec<DigestCutAnchor>) -> Vec<DigestCutAnchor> {
    let mut out: Vec<DigestCutAnchor> = Vec::with_capacity(anchors.len());
    for a in anchors {
        let dup = out.iter().any(|b| {
            a.selector == b.selector
                && a.class_contains == b.class_contains
                && a.index == b.index
                && a.text_contains_any == b.text_contains_any
        });
        if !dup {
            out.push(a);
        }
    }
    out
}

fn anchor_for_child(children: &[ElementRef<'_>], index: usize) -> DigestCutAnchor {
    let el = children[index];
    let tag = el.value().name();
    let class_contains = footer_class_token(el);
    let same_tag_index = children
        .iter()
        .take(index + 1)
        .filter(|child| child.value().name() == tag)
        .count()
        .saturating_sub(1);
    DigestCutAnchor {
        selector: Some(tag.to_string()),
        class_contains: class_contains.clone(),
        index: if class_contains.is_some() {
            None
        } else {
            Some(same_tag_index)
        },
        text_contains_any: vec![],
        role: None,
    }
}

fn footer_class_token(el: ElementRef<'_>) -> Option<String> {
    let class = el.value().attr("class")?;
    for token in class.split_whitespace() {
        let lower = token.to_ascii_lowercase();
        if FOOTER_NEEDLES.iter().any(|needle| lower.contains(needle))
            && !token.is_empty()
            && token.len() <= 40
            && token
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Some(token.to_string());
        }
    }
    None
}

fn quote_clip(text: &str) -> String {
    let clipped: String = text.chars().take(48).collect();
    if text.chars().count() > 48 {
        format!("{clipped}…")
    } else {
        clipped
    }
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
        explanation_fr: String::new(),
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
        format!(
            " class={}",
            class
                .split_whitespace()
                .take(3)
                .collect::<Vec<_>>()
                .join(" ")
        )
    };
    let text_part = if text.is_empty() {
        String::new()
    } else {
        format!(" text=\"{}\"", text)
    };
    lines.push(format!("{indent}- {tag}{id_part}{class_part}{text_part}"));
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

pub(crate) fn slug_from_domain(domain: &str) -> String {
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

pub(crate) fn email_domain(email: &str) -> Option<String> {
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
    s.push_str(&format!(
        "rule_set_version: \"{}\"\n",
        proposal.rule_set_version
    ));
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
    s.push_str(&format!(
        "    min_children: {}\n",
        proposal.match_.min_children
    ));
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
        out.push_str(&format!(
            "    presentation: {}\n",
            presentation_name(presentation)
        ));
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
    if value
        .chars()
        .any(|c| c.is_whitespace() || ":{}[]&*#?|-<>=!%@`".contains(c))
    {
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
        explanation_fr: String::new(),
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
    fn generic_mail_proposal_hides_footer_and_keeps_title() {
        let html = r#"<div class="letter">
<h1>Votre commande est confirmée</h1>
<p>Le colis part demain matin.</p>
<div class="footer">Mentions légales et désinscription</div>
</div>"#;
        let proposal = analyze_html_structure_heuristic(html, "notes@exemple.fr");
        assert_eq!(proposal.fixture_id, "exemple-fr");
        assert_ne!(proposal.match_.structure_root, "div.f-fallback");
        assert!(proposal.explanation_fr.contains("exemple.fr"));
        assert!(proposal.explanation_fr.contains("masqué"));
        let yaml = proposal_to_fixture_yaml(&proposal).expect("yaml");
        let preview = preview_candidate_fixture(&yaml, html, "notes@exemple.fr");
        assert!(preview.applicable, "{:?}", preview.error);
        let cut = preview.html.expect("html");
        assert!(cut.contains("Votre commande est confirmée"));
        assert!(cut.contains("Le colis part demain matin."));
        assert!(!cut.contains("désinscription"));
    }

    const NESTED_TABLE_MARKETING: &str = r#"<table class="wrapper"><tbody><tr><td>
<table class="content"><tbody>
<tr><td><h1>Soldes d'été</h1></td></tr>
<tr><td><p>Profitez de -30% sur toute la collection.</p></td></tr>
<tr><td><p>Livraison offerte dès 50 euros.</p></td></tr>
<tr><td>Pour vous désabonner, cliquez ici. © 2026 Boutique</td></tr>
</tbody></table>
</td></tr></tbody></table>"#;

    #[test]
    fn nested_table_marketing_gets_real_header_body_footer_children() {
        let proposal = analyze_html_structure_heuristic(NESTED_TABLE_MARKETING, "news@boutique.fr");
        assert_eq!(proposal.match_.structure_root, "table.content");
        assert!(!proposal.zones.header.anchors.is_empty());
        assert!(
            proposal.zones.body.anchors.len() >= 2,
            "{:?}",
            proposal.zones.body.anchors
        );
        assert!(!proposal.zones.footer.anchors.is_empty());
        assert!(proposal
            .zones
            .body
            .anchors
            .iter()
            .all(|a| a.selector.as_deref() == Some("tr")));
        let yaml = proposal_to_fixture_yaml(&proposal).expect("yaml");
        let preview = preview_candidate_fixture(&yaml, NESTED_TABLE_MARKETING, "news@boutique.fr");
        assert!(preview.applicable, "{:?}", preview.error);
        let cut = preview.html.expect("html");
        assert!(cut.contains("Soldes d&#39;été") || cut.contains("Soldes d'été"));
        assert!(cut.contains("-30%"));
        assert!(cut.contains("Livraison offerte"));
        assert!(!cut.contains("désabonner"));
    }

    #[test]
    fn single_child_div_wrappers_are_unwrapped_and_text_footer_detected() {
        let html = r#"<div class="outer"><div class="inner">
<div class="row"><h2>Bienvenue</h2></div>
<div class="row"><p>Merci de votre inscription.</p></div>
<div class="row"><p>Pour ne plus recevoir nos messages, répondez STOP.</p></div>
</div></div>"#;
        let proposal = analyze_html_structure_heuristic(html, "hello@service.fr");
        assert_eq!(proposal.match_.structure_root, "div.inner");
        assert!(!proposal.zones.body.anchors.is_empty());
        assert_eq!(proposal.zones.footer.anchors.len(), 1);
        let yaml = proposal_to_fixture_yaml(&proposal).expect("yaml");
        let preview = preview_candidate_fixture(&yaml, html, "hello@service.fr");
        assert!(preview.applicable, "{:?}", preview.error);
        let cut = preview.html.expect("html");
        assert!(cut.contains("Merci de votre inscription."));
        assert!(!cut.contains("ne plus recevoir"));
    }

    #[test]
    fn heuristic_never_leaves_body_anchors_empty() {
        let classless_nested = "<table><tbody><tr><td><table><tbody>\
<tr><td>Titre</td></tr><tr><td>Texte du message</td></tr>\
</tbody></table></td></tr></tbody></table>";
        for html in [
            classless_nested,
            "<p>seul</p>",
            "<div></div>",
            NESTED_TABLE_MARKETING,
        ] {
            let proposal = analyze_html_structure_heuristic(html, "a@b.fr");
            assert!(!proposal.zones.body.anchors.is_empty(), "{html}");
            assert!(!proposal.zones.header.anchors.is_empty(), "{html}");
        }
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
        assert!(empty_or_invalid_proposal_does_not_apply(
            "",
            RECEIVE,
            "support@deblock.com"
        ));
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
        assert!(empty_or_invalid_proposal_does_not_apply(
            broken,
            RECEIVE,
            "support@deblock.com"
        ));
        assert!(installed_reading_fixture_id().is_none());
    }

    #[test]
    #[ignore = "docs screenshot harness (CAPTURE_DIGEST_CUT=1)"]
    fn dump_cut_stage_preview_for_docs() {
        let html = r#"<div class="letter">
<h1>Votre commande est confirmée</h1>
<p>Le colis part demain matin.</p>
<div class="footer">Mentions légales et désinscription</div>
</div>"#;
        let proposal = analyze_html_structure_heuristic(html, "notes@exemple.fr");
        let yaml = proposal_to_fixture_yaml(&proposal).expect("yaml");
        let preview = preview_candidate_fixture(&yaml, html, "notes@exemple.fr");
        let json = serde_json::to_string(&proposal).expect("json");
        eprintln!("DIGEST_CUT_HTML_START");
        eprintln!("{html}");
        eprintln!("DIGEST_CUT_HTML_END");
        eprintln!("DIGEST_CUT_PROPOSAL_START");
        eprintln!("{json}");
        eprintln!("DIGEST_CUT_PROPOSAL_END");
        eprintln!("DIGEST_CUT_YAML_START");
        eprintln!("{yaml}");
        eprintln!("DIGEST_CUT_YAML_END");
        eprintln!("DIGEST_CUT_PREVIEW_START");
        eprintln!("{}", preview.html.expect("applicable"));
        eprintln!("DIGEST_CUT_PREVIEW_END");
    }

    #[test]
    #[ignore = "docs screenshot harness (CAPTURE_DIGEST_CUT=1)"]
    fn dump_deblock_cut_preview_for_docs() {
        let proposal = analyze_html_structure_heuristic(RECEIVE, "support@deblock.com");
        let yaml = proposal_to_fixture_yaml(&proposal).expect("yaml");
        let preview = preview_candidate_fixture(&yaml, RECEIVE, "support@deblock.com");
        eprintln!("DIGEST_CUT_YAML_START");
        eprintln!("{}", yaml);
        eprintln!("DIGEST_CUT_YAML_END");
        eprintln!("DIGEST_CUT_PREVIEW_START");
        eprintln!("{}", preview.html.expect("applicable"));
        eprintln!("DIGEST_CUT_PREVIEW_END");
    }

    #[test]
    fn embedded_deblock_fixture_still_oracle() {
        let fixture = parse_fixture(DEBLOCK_FIXTURE_YAML).expect("deblock");
        let yaml = proposal_to_fixture_yaml(&super::proposal_from_fixture(&fixture)).expect("yaml");
        assert!(yaml.contains("div.f-fallback"));
    }
}
