//! Proposition IA de zones pour l'éditeur de découpe digest (hors `clean_message`).

use serde::Deserialize;
use serde_json::{json, Value};

use crate::ai_llm_util::{
    gen_params_json_for_prompt, output_room_after_prompt, parse_model_json, truncate_chars,
    untrusted_mail_for_engine,
};
use crate::mail_cleaning::digest_fixtures::proposal::{
    analyze_html_structure_heuristic, email_domain, french_explanation, proposal_to_fixture_yaml,
    slug_from_domain, structure_outline_for_llm, DigestCutAnchor, DigestCutMatch,
    DigestCutProposal, DigestCutZone, DigestCutZones, DomainRuleDto, ProposalSource,
};
use crate::mail_cleaning::digest_fixtures::{AnchorRole, ZoneAction, ZonePresentation};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DigestCutDto {
    #[serde(default)]
    fixture_id: String,
    #[serde(default)]
    rule_set_version: String,
    #[serde(default)]
    explanation_fr: String,
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

/// Résultat d'une proposition. `from_model` est faux si le moteur manque ou si le JSON est refusé.
pub struct DigestCutModelOutcome {
    pub proposal: DigestCutProposal,
    pub from_model: bool,
    /// Raison courte quand `from_model` est faux (UI).
    pub fallback_reason: Option<String>,
}

/// Propose des zones. Sans moteur, ou si le JSON est refusé : heuristique, ou la proposition
/// déjà ajustée par l'utilisateur quand elle est fournie.
///
/// Le prompt est calibré pour un modèle local de la classe Llama 3.2 (contexte court).
pub fn propose_digest_cut_zones(
    engine: Option<&mut LlmEngine>,
    html: &str,
    sender_email: &str,
    subject: &str,
    output_language: &str,
    current: Option<&DigestCutProposal>,
) -> DigestCutModelOutcome {
    let fallback = current
        .cloned()
        .unwrap_or_else(|| analyze_html_structure_heuristic(html, sender_email));
    let mut fallback_reason: Option<String> = None;
    if let Some(engine) = engine {
        match propose_with_llm(engine, html, sender_email, subject, output_language, current) {
            Ok(llm) => {
                if proposal_to_fixture_yaml(&llm).is_ok() {
                    return DigestCutModelOutcome {
                        proposal: llm,
                        from_model: true,
                        fallback_reason: None,
                    };
                }
                fallback_reason = Some(
                    "Le modèle a répondu, mais la proposition JSON/YAML a été refusée.".into(),
                );
            }
            Err(e) => {
                fallback_reason = Some(match &e {
                    LlmError::InputTooLarge { tokens, n_ctx } => format!(
                        "contexte trop court pour ce mail ({tokens} jetons utilisés / n_ctx={n_ctx}). Augmentez n_ctx dans Paramètres → IA, ou chargez un mail plus court."
                    ),
                    other => format!("Le modèle n’a pas produit de découpe : {other}"),
                });
            }
        }
    } else {
        fallback_reason = Some(
            "Aucun moteur IA joignable pour la découpe (Paramètres → IA : mode + Tester la connexion)."
                .into(),
        );
    }
    let mut proposal = fallback;
    if proposal.explanation_fr.trim().is_empty() {
        proposal.explanation_fr = french_explanation(&proposal);
    }
    DigestCutModelOutcome {
        proposal,
        from_model: false,
        fallback_reason,
    }
}

/// Outline + petit extrait HTML. Llama 3.2 / n_ctx courts : shrink en cascade
/// (HTML → outline → proposition courante) pour garder de la place à la sortie JSON.
const LLM_HTML_CHARS_MAX: usize = 1_200;
const LLM_OUTLINE_CHARS_MAX: usize = 1_400;
const LLM_OUTLINE_CHARS_MIN: usize = 400;
const LLM_CURRENT_CHARS_MAX: usize = 900;
const MIN_OUTPUT_TOKENS: u32 = 512;
const MAX_OUTPUT_TOKENS: u32 = 1_536;
/// JSON de découpe typique ~350–700 jetons ; 320 laisse une marge sur n_ctx 2k/4k.
const MIN_OUTPUT_ROOM: u32 = 320;

fn propose_with_llm(
    engine: &mut LlmEngine,
    html: &str,
    sender_email: &str,
    subject: &str,
    output_language: &str,
    current: Option<&DigestCutProposal>,
) -> Result<DigestCutProposal, LlmError> {
    let outline_full = structure_outline_for_llm(html);
    let system = crate::prompts::system_prompt_for_language("digest_cut", output_language);
    let domain = email_domain(sender_email).unwrap_or_else(|| "example.com".to_string());
    let default_fixture_id = slug_from_domain(&domain);
    let current_slim = current.map(slim_current_proposal_json).unwrap_or_default();

    let mut html_budget = LLM_HTML_CHARS_MAX;
    let mut outline_budget = LLM_OUTLINE_CHARS_MAX;
    let mut current_budget = if current_slim.is_empty() {
        0
    } else {
        LLM_CURRENT_CHARS_MAX
    };

    let raw = loop {
        let outline = truncate_chars(&outline_full, outline_budget);
        let current_block = if current_budget == 0 || current_slim.is_empty() {
            String::new()
        } else {
            let clipped = truncate_chars(&current_slim, current_budget);
            format!(
                "\n\nCurrent proposal (slim JSON — keep zone actions / fixtureId / sender domain):\n{clipped}\n"
            )
        };
        let user = build_digest_cut_user(
            engine,
            sender_email,
            subject,
            &outline,
            &current_block,
            html,
            html_budget,
        );
        let room = output_room_after_prompt(engine, system.as_str(), &user, 64);
        let fully_shrunk =
            html_budget == 0 && outline_budget <= LLM_OUTLINE_CHARS_MIN && current_budget == 0;
        if room >= MIN_OUTPUT_ROOM || fully_shrunk {
            if room < MIN_OUTPUT_ROOM {
                let n_ctx = engine.n_ctx();
                return Err(LlmError::InputTooLarge {
                    tokens: (n_ctx.saturating_sub(room)) as usize,
                    n_ctx,
                });
            }
            break engine.generate(
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
        }
        // Cascade : d’abord HTML, puis outline, puis proposition courante.
        if html_budget > 0 {
            html_budget = html_budget.saturating_sub(400);
        } else if outline_budget > LLM_OUTLINE_CHARS_MIN {
            outline_budget = outline_budget
                .saturating_sub(350)
                .max(LLM_OUTLINE_CHARS_MIN);
        } else if current_budget > 0 {
            current_budget = current_budget.saturating_sub(450);
        } else {
            // Sécurité : ne pas boucler.
            let n_ctx = engine.n_ctx();
            return Err(LlmError::InputTooLarge {
                tokens: (n_ctx.saturating_sub(room)) as usize,
                n_ctx,
            });
        }
    };

    if response_is_empty_json(&raw) {
        return Err(LlmError::InvalidJson(
            "réponse vide ou tronquée (aucun objet de découpe). Vérifiez Paramètres → IA → Tester la connexion, puis réessayez Proposer."
                .into(),
        ));
    }

    let mut value: Value = parse_model_json(&raw)?;
    inject_digest_cut_defaults(&mut value, &default_fixture_id, &domain);
    let dto: DigestCutDto = serde_json::from_value(value).map_err(|e| {
        LlmError::InvalidJson(format!("objet de découpe incomplet après lecture : {e}"))
    })?;
    validate_digest_cut_dto(&dto)?;
    let mut proposal = DigestCutProposal {
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
        explanation_fr: clip_explanation(dto.explanation_fr),
    };
    if proposal.fixture_id.is_empty() {
        proposal.fixture_id = default_fixture_id;
    }
    if proposal.rule_set_version.is_empty() {
        proposal.rule_set_version = "1".into();
    }
    if proposal.explanation_fr.is_empty() {
        proposal.explanation_fr = french_explanation(&proposal);
    }
    Ok(proposal)
}

fn build_digest_cut_user(
    engine: &LlmEngine,
    sender_email: &str,
    subject: &str,
    outline: &str,
    current_block: &str,
    html: &str,
    html_budget: usize,
) -> String {
    let html_block = if html_budget == 0 {
        String::new()
    } else {
        let clipped = truncate_chars(html, html_budget);
        format!(
            "\n{}",
            untrusted_mail_for_engine(engine, "digest-cut-mail-html", &clipped)
        )
    };
    let subject_line = subject.split_whitespace().collect::<Vec<_>>().join(" ");
    format!(
        "Sender email (for domain matching and fixtureId slug only): {}\nSubject (identity hint only): {}\n\nDOM outline (tags/classes/order — primary signal):\n{}{}{}",
        sender_email.trim(),
        truncate_chars(&subject_line, 160),
        outline,
        current_block,
        html_block
    )
}

/// Proposition courante allégée : actions + ancres essentielles, sans dump massif.
fn slim_current_proposal_json(proposal: &DigestCutProposal) -> String {
    fn slim_zone(zone: &DigestCutZone) -> Value {
        let anchors: Vec<Value> = zone
            .anchors
            .iter()
            .take(4)
            .map(|a| {
                let mut o = serde_json::Map::new();
                if let Some(sel) = a
                    .selector
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                {
                    o.insert("selector".into(), json!(sel));
                }
                if let Some(idx) = a.index {
                    o.insert("index".into(), json!(idx));
                }
                if let Some(role) = &a.role {
                    o.insert("role".into(), json!(role));
                }
                Value::Object(o)
            })
            .collect();
        json!({
            "action": zone.action,
            "presentation": zone.presentation,
            "anchors": anchors,
        })
    }
    let value = json!({
        "fixtureId": proposal.fixture_id,
        "ruleSetVersion": proposal.rule_set_version,
        "match": {
            "senderDomains": proposal.match_.sender_domains,
            "structureRoot": proposal.match_.structure_root,
            "minChildren": proposal.match_.min_children,
        },
        "zones": {
            "header": slim_zone(&proposal.zones.header),
            "body": slim_zone(&proposal.zones.body),
            "footer": slim_zone(&proposal.zones.footer),
        },
    });
    serde_json::to_string(&value).unwrap_or_else(|_| "{}".into())
}

fn inject_digest_cut_defaults(value: &mut Value, default_fixture_id: &str, domain: &str) {
    let Some(obj) = value.as_object_mut() else {
        return;
    };
    let fixture_missing = match obj.get("fixtureId") {
        Some(Value::String(s)) => s.trim().is_empty(),
        Some(Value::Null) | None => true,
        _ => false,
    };
    if fixture_missing {
        obj.insert("fixtureId".into(), json!(default_fixture_id));
    }
    let version_missing = match obj.get("ruleSetVersion") {
        Some(Value::String(s)) => s.trim().is_empty(),
        Some(Value::Null) | None => true,
        _ => false,
    };
    if version_missing {
        obj.insert("ruleSetVersion".into(), json!("1"));
    }
    if let Some(Value::Object(match_obj)) = obj.get_mut("match") {
        let domains_missing = match match_obj.get("senderDomains") {
            Some(Value::Array(a)) => a.is_empty(),
            Some(Value::Null) | None => true,
            _ => false,
        };
        if domains_missing {
            match_obj.insert("senderDomains".into(), json!([{ "exact": domain }]));
        }
    }
}

fn response_is_empty_json(raw: &str) -> bool {
    let t = raw.trim();
    if t.is_empty() {
        return true;
    }
    let compact: String = t.chars().filter(|c| !c.is_whitespace()).collect();
    compact == "{" || compact == "{}" || compact == "[" || compact == "[]"
}

fn clip_explanation(value: String) -> String {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(500).collect()
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
    if dto
        .explanation_fr
        .to_ascii_lowercase()
        .contains("ignore all")
    {
        return Err(LlmError::InvalidJson("explanationFr".into()));
    }
    // Une zone affichée sans ancre ne rend rien : le corps doit toujours viser un bloc ;
    // l'en-tête aussi sauf s'il est masqué (rien à rendre alors).
    if dto.zones.body.anchors.is_empty() {
        return Err(LlmError::InvalidJson(
            "body.anchors vide : au moins une ancre de corps est requise".into(),
        ));
    }
    if dto.zones.header.anchors.is_empty() && dto.zones.header.action != ZoneAction::Hide {
        return Err(LlmError::InvalidJson(
            "header.anchors vide : au moins une ancre d'en-tête est requise".into(),
        ));
    }
    for zone in [&dto.zones.header, &dto.zones.body, &dto.zones.footer] {
        if let Some(r) = &zone.rationale {
            if r.to_ascii_lowercase().contains("ignore all") {
                return Err(LlmError::InvalidJson("rationale".into()));
            }
        }
        for anchor in &zone.anchors {
            if let Some(sel) = &anchor.selector {
                if sel.contains('>') || sel.contains(' ') {
                    return Err(LlmError::InvalidJson("selector".into()));
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
    use super::{
        inject_digest_cut_defaults, response_is_empty_json, slim_current_proposal_json,
        validate_digest_cut_dto,
    };
    use crate::mail_cleaning::digest_fixtures::proposal::proposal_to_fixture_yaml;
    use crate::mail_cleaning::digest_fixtures::{set_installed_reading_fixture, ZoneAction};
    use serde_json::json;

    #[test]
    fn invalid_llm_shape_is_rejected_before_yaml() {
        let dto = super::DigestCutDto {
            fixture_id: "bad id".into(),
            rule_set_version: "1".into(),
            explanation_fr: String::new(),
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

    #[test]
    fn empty_json_response_is_detected() {
        assert!(response_is_empty_json(""));
        assert!(response_is_empty_json("{"));
        assert!(response_is_empty_json("{ }"));
        assert!(!response_is_empty_json(r#"{"fixtureId":"x"}"#));
    }

    #[test]
    fn slim_current_keeps_actions_and_caps_anchors() {
        let proposal = crate::mail_cleaning::digest_fixtures::analyze_html_structure_heuristic(
            include_str!("../tests/fixtures/deblock/receive_200eur.html"),
            "support@deblock.com",
        );
        let slim = slim_current_proposal_json(&proposal);
        assert!(slim.contains("fixtureId"));
        assert!(slim.contains("structureRoot"));
        assert!(slim.len() < serde_json::to_string(&proposal).unwrap().len() + 8);
        let v: serde_json::Value = serde_json::from_str(&slim).expect("json");
        assert!(
            v["zones"]["header"]["action"].is_string()
                || v["zones"]["header"]["action"].is_object()
        );
    }

    #[test]
    fn defaults_fill_fixture_id_for_mailbox_mails() {
        let mut value = json!({
            "match": {
                "structureRoot": "div.main",
                "minChildren": 2
            },
            "zones": {
                "header": { "action": "show", "anchors": [{ "selector": "h1", "index": 0 }] },
                "body": { "action": "show", "anchors": [{ "selector": "p", "index": 0 }] },
                "footer": { "action": "hide", "anchors": [] }
            },
            "explanationFr": "En-tête affiché."
        });
        inject_digest_cut_defaults(&mut value, "github-com", "github.com");
        assert_eq!(value["fixtureId"], "github-com");
        assert_eq!(value["ruleSetVersion"], "1");
        assert_eq!(value["match"]["senderDomains"][0]["exact"], "github.com");
        let dto: super::DigestCutDto = serde_json::from_value(value).expect("dto");
        assert!(validate_digest_cut_dto(&dto).is_ok());
    }

    fn dto_from_zones(header: serde_json::Value, body: serde_json::Value) -> super::DigestCutDto {
        serde_json::from_value(json!({
            "fixtureId": "example-com",
            "ruleSetVersion": "1",
            "match": {
                "senderDomains": [{ "exact": "example.com" }],
                "structureRoot": "div.letter",
                "minChildren": 2
            },
            "zones": {
                "header": header,
                "body": body,
                "footer": { "action": "hide", "anchors": [] }
            }
        }))
        .expect("dto")
    }

    #[test]
    fn empty_body_anchors_are_rejected() {
        let dto = dto_from_zones(
            json!({ "action": "show", "anchors": [{ "selector": "h1", "index": 0 }] }),
            json!({ "action": "show", "anchors": [] }),
        );
        let err = validate_digest_cut_dto(&dto).expect_err("empty body must be rejected");
        assert!(err.to_string().contains("body.anchors"), "{err}");
    }

    #[test]
    fn empty_shown_header_anchors_are_rejected_but_body_ok_when_hidden_header() {
        let body = json!({ "action": "show", "anchors": [{ "selector": "p", "index": 0 }] });
        let dto = dto_from_zones(json!({ "action": "show", "anchors": [] }), body.clone());
        assert!(validate_digest_cut_dto(&dto).is_err());
        let dto = dto_from_zones(json!({ "action": "hide", "anchors": [] }), body);
        assert!(validate_digest_cut_dto(&dto).is_ok());
    }

    #[test]
    fn prompt_example_has_non_empty_header_and_body_anchors() {
        let prompt = include_str!("../prompts/digest_cut.system.txt");
        let start = prompt.find("{\"fixtureId\"").expect("example json");
        let end = prompt[start..]
            .find('\n')
            .map_or(prompt.len(), |i| start + i);
        let example: serde_json::Value =
            serde_json::from_str(prompt[start..end].trim()).expect("example parses");
        let dto: super::DigestCutDto = serde_json::from_value(example).expect("example dto");
        assert!(!dto.zones.header.anchors.is_empty());
        assert!(!dto.zones.body.anchors.is_empty());
        assert!(!dto.zones.footer.anchors.is_empty());
        assert!(validate_digest_cut_dto(&dto).is_ok());
    }
}
