//! Éditeur de découpe digest (aperçu + proposition de zones). N'écrit pas la lecture.

use rustymail_modules::ai_digest_cut::propose_digest_cut_zones;
use rustymail_modules::mail_cleaning::digest_fixtures::{
    analyze_html_structure_heuristic, proposal_to_fixture_yaml, DigestCutProposal,
};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::digest_bench::{validate_html, validate_sender, validate_yaml, DigestPreviewPayload};
use crate::llm_commands::build_llm_engine;
use crate::AppPaths;

const SAMPLE_HTML: &str =
    include_str!("../../crates/rustymail-modules/tests/fixtures/deblock/receive_200eur.html");
const SAMPLE_SENDER: &str = "support@deblock.com";
const SAMPLE_SUBJECT: &str = "Vous allez recevoir 200 EUR";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutSampleView {
    pub html: String,
    pub sender_email: String,
    pub subject: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutProposePayload {
    pub html: String,
    pub sender_email: String,
    #[serde(default)]
    pub use_llm: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutYamlPayload {
    pub proposal: DigestCutProposal,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutYamlView {
    pub yaml: String,
}

#[tauri::command]
pub fn digest_cut_builtin_sample() -> DigestCutSampleView {
    DigestCutSampleView {
        html: SAMPLE_HTML.to_string(),
        sender_email: SAMPLE_SENDER.to_string(),
        subject: SAMPLE_SUBJECT.to_string(),
    }
}

#[tauri::command]
pub fn digest_cut_propose_zones(
    paths: State<'_, AppPaths>,
    payload: DigestCutProposePayload,
) -> Result<DigestCutProposal, String> {
    validate_html(&payload.html)?;
    validate_sender(&payload.sender_email)?;
    let prefs = rustymail_infrastructure::load_app_prefs(&paths.prefs_path);
    let lang = prefs.ai.draft_language.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let proposal = if payload.use_llm {
        let mut engine = build_llm_engine(&prefs, &paths).map_err(|e| e.to_string())?;
        propose_digest_cut_zones(Some(&mut engine), &payload.html, &payload.sender_email, lang)
    } else {
        let engine = build_llm_engine(&prefs, &paths).ok();
        let mut engine = engine;
        propose_digest_cut_zones(
            engine.as_mut(),
            &payload.html,
            &payload.sender_email,
            lang,
        )
    };
    Ok(proposal)
}

#[tauri::command]
pub fn digest_cut_proposal_yaml(payload: DigestCutYamlPayload) -> Result<DigestCutYamlView, String> {
    let yaml = proposal_to_fixture_yaml(&payload.proposal).map_err(|e| e.to_string())?;
    validate_yaml(&yaml)?;
    Ok(DigestCutYamlView { yaml })
}

#[tauri::command]
pub fn digest_cut_preview(payload: DigestPreviewPayload) -> Result<crate::digest_bench::DigestPreviewView, String> {
    crate::digest_bench::digest_fixture_preview(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_modules::mail_cleaning::digest_fixtures::{
        installed_reading_fixture_id, set_installed_reading_fixture,
    };

    #[test]
    fn propose_does_not_install_reading_fixture() {
        set_installed_reading_fixture(None);
        let proposal = analyze_html_structure_heuristic(SAMPLE_HTML, SAMPLE_SENDER);
        let yaml = proposal_to_fixture_yaml(&proposal).expect("yaml");
        assert!(!yaml.is_empty());
        assert!(installed_reading_fixture_id().is_none());
    }
}
