//! LLM « Affiner » — un dossier titre pour structurer un flux (vue enregistrée).

use crate::ai_llm_util::{gen_params_json_for_prompt, parse_model_json};
use rustymail_domain::{FluxAffinerResult, FluxAffinerSample};
use rustymail_llm::LlmEngine;
use serde::Deserialize;

const MIN_AFFINER_CONFIDENCE: f32 = 0.35;
const MIN_RATIONALE_CHARS: usize = 12;
const MAX_RATIONALE_CHARS: usize = 400;
const MAX_FOLDER_TITLE_CHARS: usize = 80;

const GENERIC_FOLDER_BLOCKLIST: &[&str] = &[
    "recherche",
    "search",
    "inbox",
    "flux",
    "flux courant",
    "dossier",
    "folder",
    "misc",
    "divers",
    "autre",
    "autres",
];

#[derive(Debug, Deserialize)]
struct LlmFluxAffinerRow {
    #[serde(default, rename = "folderTitle")]
    folder_title: String,
    #[serde(default)]
    confidence: f32,
    #[serde(default)]
    rationale: String,
}

fn build_catalog(samples: &[FluxAffinerSample]) -> String {
    samples
        .iter()
        .take(50)
        .map(|s| {
            format!(
                "{};{};{}",
                s.mailbox.trim(),
                s.sender.trim(),
                s.subject.trim().replace(';', ",")
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn fold_label(s: &str) -> String {
    s.trim()
        .chars()
        .map(|c| match c {
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'à' | 'â' | 'ä' | 'á' => 'a',
            'ù' | 'û' | 'ü' | 'ú' => 'u',
            'î' | 'ï' | 'í' => 'i',
            'ô' | 'ö' | 'ó' => 'o',
            'ç' => 'c',
            other => other.to_ascii_lowercase(),
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Valide le résultat Affiner avant création IMAP.
pub fn validate_flux_affiner_result(
    result: &FluxAffinerResult,
    view_label: &str,
    existing_mailboxes: &[String],
) -> Result<(), String> {
    let title = result.folder_title.trim();
    let title_n = title.chars().count();
    if title.is_empty() || title_n > MAX_FOLDER_TITLE_CHARS {
        return Err("Le LLM n'a pas proposé de titre de dossier valide.".into());
    }
    if title.contains('/') || title.contains('\\') || title.contains('\n') {
        return Err("Le titre de dossier ne doit pas contenir de séparateur de chemin.".into());
    }
    let folded = fold_label(title);
    let view_folded = fold_label(view_label);
    if !view_folded.is_empty() && folded == view_folded {
        return Err(
            "Le titre proposé reprend le nom de la vue — choisissez un libellé sémantique.".into(),
        );
    }
    if GENERIC_FOLDER_BLOCKLIST
        .iter()
        .any(|b| folded == *b || folded.starts_with(&format!("{b} ")))
    {
        return Err(
            "Titre trop générique (ex. « Recherche ») — proposez un dossier thématique.".into(),
        );
    }
    if existing_mailboxes.iter().any(|m| fold_label(m) == folded) {
        return Err("Ce dossier existe déjà — choisissez un autre nom ou déplacez sans créer.".into());
    }
    if result.confidence < MIN_AFFINER_CONFIDENCE {
        return Err(format!(
            "Confiance trop faible ({:.0} % — minimum {:.0} %). Relancez Affiner ou renommez manuellement.",
            result.confidence * 100.0,
            MIN_AFFINER_CONFIDENCE * 100.0
        ));
    }
    let rationale_n = result.rationale.trim().chars().count();
    if rationale_n < MIN_RATIONALE_CHARS || rationale_n > MAX_RATIONALE_CHARS {
        return Err("Justification Affiner hors bornes — relancez la proposition.".into());
    }
    Ok(())
}

pub fn affiner_flux_with_llm(
    engine: &mut LlmEngine,
    view_label: &str,
    samples: &[FluxAffinerSample],
    existing_mailboxes: &[String],
    output_language: &str,
) -> Result<FluxAffinerResult, String> {
    if samples.is_empty() {
        return Err("Aucun fil à analyser.".into());
    }
    let catalog = build_catalog(samples);
    let mailboxes = existing_mailboxes
        .iter()
        .map(|m| m.trim())
        .filter(|m| !m.is_empty())
        .take(80)
        .collect::<Vec<_>>()
        .join("\n");
    let system = crate::prompts::system_prompt_for_language("flux_affiner", output_language);
    let user = format!(
        "View / stream label (do NOT reuse as folderTitle): {view_label}\n\
         Existing IMAP folders (avoid duplicate meaning):\n{mailboxes}\n\
         Sample (mailbox;sender;subject) — max 50 lines:\n{catalog}\n"
    );
    let raw = engine
        .generate(
            system.as_str(),
            &user,
            &gen_params_json_for_prompt(engine, system.as_str(), &user, 128, 512),
        )
        .map_err(|e| e.to_string())?;
    let row: LlmFluxAffinerRow =
        parse_model_json(&raw).map_err(|e: rustymail_llm::LlmError| e.to_string())?;
    let result = FluxAffinerResult {
        folder_title: row.folder_title.trim().to_string(),
        confidence: row.confidence.clamp(0.0, 1.0),
        rationale: row.rationale.trim().to_string(),
    };
    validate_flux_affiner_result(&result, view_label, existing_mailboxes)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_ok() -> FluxAffinerResult {
        FluxAffinerResult {
            folder_title: "Factures Amazon".into(),
            confidence: 0.72,
            rationale: "Les sujets concernent des factures Amazon récentes.".into(),
        }
    }

    #[test]
    fn rejects_generic_recherche_title() {
        let bad = FluxAffinerResult {
            folder_title: "Recherche".into(),
            confidence: 0.9,
            rationale: "Nom générique recopié depuis la vue.".into(),
        };
        assert!(validate_flux_affiner_result(&bad, "Recherche", &[]).is_err());
    }

    #[test]
    fn rejects_zero_confidence() {
        let bad = FluxAffinerResult {
            folder_title: "Voyages".into(),
            confidence: 0.0,
            rationale: "Les sujets évoquent des billets et hôtels.".into(),
        };
        assert!(validate_flux_affiner_result(&bad, "Flux voyages", &[]).is_err());
    }

    #[test]
    fn accepts_semantic_title() {
        assert!(validate_flux_affiner_result(&sample_ok(), "Flux courant", &[]).is_ok());
    }

    #[test]
    fn rejects_existing_mailbox() {
        let bad = FluxAffinerResult {
            folder_title: "Finance".into(),
            confidence: 0.8,
            rationale: "Regroupe les factures et reçus du flux.".into(),
        };
        assert!(validate_flux_affiner_result(&bad, "Flux", &["Finance".into()]).is_err());
    }
}
