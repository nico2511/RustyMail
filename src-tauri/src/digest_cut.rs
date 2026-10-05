//! Éditeur de découpe digest (aperçu + proposition de zones). N'écrit pas la lecture.

use rustymail_modules::ai_digest_cut::propose_digest_cut_zones;
use rustymail_modules::ai_digest_cut_reformat::reformat_digest_cut_reading;
use rustymail_modules::mail_cleaning::digest_fixtures::{
    proposal_to_fixture_yaml, DigestCutProposal,
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
    /// Proposition déjà ajustée. Conservée si le modèle ne répond pas.
    #[serde(default)]
    pub current: Option<DigestCutProposal>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutEmlPayload {
    pub eml_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutProposeView {
    pub proposal: DigestCutProposal,
    pub from_model: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_reason: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutReformatPayload {
    pub html: String,
    pub sender_email: String,
    pub current: DigestCutProposal,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestCutReformatView {
    pub proposal: DigestCutProposal,
    pub reading_html: String,
    pub from_model: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_reason: Option<String>,
}

/// Conservé pour un test interne. L'écran ne l'appelle pas : le mail vient de la boîte, du message ouvert, ou d'un `.eml`.
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
) -> Result<DigestCutProposeView, String> {
    validate_html(&payload.html)?;
    validate_sender(&payload.sender_email)?;
    let prefs = rustymail_infrastructure::load_app_prefs(&paths.prefs_path);
    let lang = prefs.ai.draft_language.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let current = payload.current.as_ref();
    let outcome = if payload.use_llm {
        match build_llm_engine(&prefs, &paths) {
            Ok(mut engine) => propose_digest_cut_zones(
                Some(&mut engine),
                &payload.html,
                &payload.sender_email,
                lang,
                current,
            ),
            Err(e) => {
                let mut out = propose_digest_cut_zones(
                    None,
                    &payload.html,
                    &payload.sender_email,
                    lang,
                    current,
                );
                out.fallback_reason = Some(format!(
                    "Moteur IA indisponible pour la découpe : {e}. Même chemin que Paramètres → IA → Tester la connexion."
                ));
                out
            }
        }
    } else {
        propose_digest_cut_zones(None, &payload.html, &payload.sender_email, lang, None)
    };
    Ok(DigestCutProposeView {
        proposal: outcome.proposal,
        from_model: outcome.from_model,
        fallback_reason: outcome.fallback_reason,
    })
}

/// Import optionnel d'un fichier `.eml` choisi par l'utilisateur. Ne charge aucun échantillon embarqué.
#[tauri::command]
pub fn digest_cut_parse_eml(payload: DigestCutEmlPayload) -> Result<DigestCutSampleView, String> {
    let parsed = rustymail_infrastructure::parse_eml_base64(&payload.eml_base64)?;
    validate_html(&parsed.html)?;
    validate_sender(&parsed.sender_email)?;
    Ok(DigestCutSampleView {
        html: parsed.html,
        sender_email: parsed.sender_email,
        subject: parsed.subject,
    })
}

#[tauri::command]
pub fn digest_cut_proposal_yaml(
    payload: DigestCutYamlPayload,
) -> Result<DigestCutYamlView, String> {
    let yaml = proposal_to_fixture_yaml(&payload.proposal).map_err(|e| e.to_string())?;
    validate_yaml(&yaml)?;
    Ok(DigestCutYamlView { yaml })
}

#[tauri::command]
pub fn digest_cut_preview(
    payload: DigestPreviewPayload,
) -> Result<crate::digest_bench::DigestPreviewView, String> {
    crate::digest_bench::digest_fixture_preview(payload)
}

/// Après les zones : réécrit / reformate le texte pour la lecture (IA ou repli local).
#[tauri::command]
pub fn digest_cut_reformat(
    paths: State<'_, AppPaths>,
    payload: DigestCutReformatPayload,
) -> Result<DigestCutReformatView, String> {
    validate_html(&payload.html)?;
    validate_sender(&payload.sender_email)?;
    let prefs = rustymail_infrastructure::load_app_prefs(&paths.prefs_path);
    let lang = prefs.ai.draft_language.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let outcome = match build_llm_engine(&prefs, &paths) {
        Ok(mut engine) => reformat_digest_cut_reading(
            Some(&mut engine),
            &payload.html,
            &payload.sender_email,
            lang,
            &payload.current,
        ),
        Err(e) => {
            let mut out = reformat_digest_cut_reading(
                None,
                &payload.html,
                &payload.sender_email,
                lang,
                &payload.current,
            );
            out.fallback_reason = Some(format!(
                "Moteur IA indisponible pour le reformatage : {e}. Même chemin que Paramètres → IA."
            ));
            out
        }
    };
    Ok(DigestCutReformatView {
        proposal: outcome.proposal,
        reading_html: outcome.reading_html,
        from_model: outcome.from_model,
        fallback_reason: outcome.fallback_reason,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_modules::mail_cleaning::digest_fixtures::{
        analyze_html_structure_heuristic, installed_reading_fixture_id,
        set_installed_reading_fixture,
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
