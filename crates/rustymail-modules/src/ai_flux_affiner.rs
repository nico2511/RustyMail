//! LLM « Affiner » — un dossier titre pour structurer un flux (vue enregistrée).

use crate::ai_llm_util::{gen_params_json_for_prompt, parse_model_json};
use rustymail_domain::{FluxAffinerResult, FluxAffinerSample};
use rustymail_llm::LlmEngine;
use serde::Deserialize;

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
        "View / stream: {view_label}\n\
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
    let title = row.folder_title.trim();
    if title.is_empty() || title.len() > 120 {
        return Err("Le LLM n'a pas proposé de titre de dossier valide.".into());
    }
    let confidence = row.confidence.clamp(0.0, 1.0);
    Ok(FluxAffinerResult {
        folder_title: title.to_string(),
        confidence,
        rationale: row.rationale.trim().to_string(),
    })
}
