//! Schéma YAML d'une fixture digest (phase 1).
//!
//! `match.sender` autorise d'envisager la réécriture. `match.structure` et les
//! ancres de zones décident si ce mail est le même pattern. Sans les deux, on
//! ne produit pas de digest.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum FixtureError {
    #[error("fixture YAML invalide : {0}")]
    Yaml(String),
    #[error("fixture refusée : {0}")]
    Invalid(String),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ZoneAction {
    Show,
    Hide,
    /// Zone gardée dans le HTML, fermée. Pas le repli des citations personne-à-personne.
    Collapse,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ZonePresentation {
    /// Titre en `<h2>`, second bloc en `<strong>` (header Deblock).
    Prominent,
    /// Lignes libellé / valeur en `<table>` (body Deblock).
    KeyValue,
    /// Texte échappé des ancres, sans mise en forme supplémentaire.
    AsIs,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnchorRole {
    Title,
    Amount,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DigestFixture {
    pub id: String,
    pub rule_set_version: String,
    #[serde(rename = "match")]
    pub match_: FixtureMatch,
    pub zones: FixtureZones,
    #[serde(default)]
    pub legacy_marker: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FixtureMatch {
    /// Forme phase 1 : `match.sender.domains`.
    #[serde(default)]
    pub sender: Option<SenderMatch>,
    /// Alias de l'esquisse de cadrage (`match.sender_domains`).
    #[serde(default)]
    pub sender_domains: Vec<DomainRule>,
    pub structure: StructureMatch,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SenderMatch {
    pub domains: Vec<DomainRule>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DomainRule {
    #[serde(default)]
    pub exact: Option<String>,
    #[serde(default)]
    pub suffix: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StructureMatch {
    pub root: String,
    #[serde(default)]
    pub min_children: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FixtureZones {
    pub header: ZoneSpec,
    pub body: ZoneSpec,
    pub footer: ZoneSpec,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ZoneSpec {
    #[serde(default)]
    pub action: Option<ZoneAction>,
    /// Alias cadrage : `keep: true` = show, `keep: false` = hide.
    #[serde(default)]
    pub keep: Option<bool>,
    #[serde(default)]
    pub presentation: Option<ZonePresentation>,
    #[serde(default)]
    pub anchors: Vec<Anchor>,
    #[serde(default)]
    pub details_heading: Option<String>,
    #[serde(default)]
    pub rows: Option<RowSpec>,
    /// Racine propre à la zone. Absente : `match.structure.root`.
    #[serde(default)]
    pub structure_root: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Anchor {
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

#[derive(Debug, Clone, Deserialize)]
pub struct RowSpec {
    pub selector: String,
    #[serde(default)]
    pub stop_when: Option<StopWhen>,
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StopWhen {
    #[serde(default)]
    pub class_contains: Option<String>,
    #[serde(default)]
    pub or_tag: Option<String>,
}

impl DigestFixture {
    pub fn sender_rules(&self) -> &[DomainRule] {
        if let Some(sender) = &self.match_.sender {
            if !sender.domains.is_empty() {
                return &sender.domains;
            }
        }
        &self.match_.sender_domains
    }
}

impl ZoneSpec {
    pub fn resolved_action(&self) -> ZoneAction {
        if let Some(action) = self.action {
            return action;
        }
        match self.keep {
            Some(false) => ZoneAction::Hide,
            Some(true) | None => ZoneAction::Show,
        }
    }
}

pub fn parse_fixture(yaml: &str) -> Result<DigestFixture, FixtureError> {
    let fixture: DigestFixture =
        serde_yaml::from_str(yaml).map_err(|e| FixtureError::Yaml(e.to_string()))?;
    validate_fixture(&fixture)?;
    Ok(fixture)
}

fn validate_fixture(fixture: &DigestFixture) -> Result<(), FixtureError> {
    if !is_safe_token(&fixture.id) {
        return Err(FixtureError::Invalid(format!(
            "id {:?} : jeton [a-z0-9-] attendu",
            fixture.id
        )));
    }
    if fixture.rule_set_version.trim().is_empty() {
        return Err(FixtureError::Invalid("rule_set_version vide".to_string()));
    }
    if let Some(marker) = &fixture.legacy_marker {
        if !is_safe_token(marker) {
            return Err(FixtureError::Invalid(format!(
                "legacy_marker {:?} refusé",
                marker
            )));
        }
    }
    if fixture.sender_rules().is_empty() {
        return Err(FixtureError::Invalid(
            "match.sender.domains (ou sender_domains) est vide".to_string(),
        ));
    }
    for rule in fixture.sender_rules() {
        if rule.exact.as_deref().unwrap_or("").trim().is_empty()
            && rule.suffix.as_deref().unwrap_or("").trim().is_empty()
        {
            return Err(FixtureError::Invalid(
                "règle de domaine sans exact ni suffix".to_string(),
            ));
        }
    }
    validate_selector("structure.root", &fixture.match_.structure.root)?;
    for (name, zone) in [
        ("header", &fixture.zones.header),
        ("body", &fixture.zones.body),
        ("footer", &fixture.zones.footer),
    ] {
        validate_zone(name, zone)?;
    }
    Ok(())
}

fn validate_zone(name: &str, zone: &ZoneSpec) -> Result<(), FixtureError> {
    for (i, anchor) in zone.anchors.iter().enumerate() {
        if let Some(sel) = &anchor.selector {
            validate_selector(&format!("{name}.anchors[{i}]"), sel)?;
        }
        if let Some(cls) = &anchor.class_contains {
            if cls.is_empty() {
                return Err(FixtureError::Invalid(format!(
                    "{name}.anchors[{i}].class_contains vide"
                )));
            }
        }
        if anchor
            .text_contains_any
            .iter()
            .any(|needle| needle.is_empty())
        {
            return Err(FixtureError::Invalid(format!(
                "{name}.anchors[{i}] : aiguille de texte vide"
            )));
        }
        if anchor.selector.is_none() && anchor.class_contains.is_none() {
            return Err(FixtureError::Invalid(format!(
                "{name}.anchors[{i}] : selector ou class_contains requis"
            )));
        }
    }
    if let Some(rows) = &zone.rows {
        validate_selector(&format!("{name}.rows"), &rows.selector)?;
        if !label_grammar_ok(&rows.label) || rows.value != "after_br" {
            return Err(FixtureError::Invalid(format!(
                "{name}.rows : seule la grammaire label \"b, strong\" et value after_br est acceptée"
            )));
        }
        if rows.selector != "p" {
            return Err(FixtureError::Invalid(format!(
                "{name}.rows.selector : seul \"p\" est accepté en phase 1"
            )));
        }
    }
    Ok(())
}

fn label_grammar_ok(label: &str) -> bool {
    let mut parts: Vec<&str> = label
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    parts.sort_unstable();
    parts == ["b", "strong"]
}

fn validate_selector(where_: &str, selector: &str) -> Result<(), FixtureError> {
    if simple_selector_ok(selector) {
        Ok(())
    } else {
        Err(FixtureError::Invalid(format!(
            "{where_} : sélecteur {selector:?} refusé (tag ou tag.classe seulement)"
        )))
    }
}

fn simple_selector_ok(selector: &str) -> bool {
    let mut parts = selector.split('.');
    let Some(tag) = parts.next() else {
        return false;
    };
    if tag.is_empty() || !tag.chars().all(|c| c.is_ascii_alphanumeric()) {
        return false;
    }
    match parts.next() {
        None => true,
        Some(class) => {
            !class.is_empty()
                && class
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                && parts.next().is_none()
        }
    }
}

fn is_safe_token(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return false;
    }
    value.len() <= 40
        && value
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}
