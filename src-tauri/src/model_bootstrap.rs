//! Téléchargement des « petits » modèles au premier démarrage (MiniLM + Whisper léger).

use std::path::Path;

use crate::minilm_download;
use crate::whisper_dictation;

/// Taille / profil fixes pour le bootstrap install (pas les prefs utilisateur).
pub const BOOTSTRAP_WHISPER_SIZE: &str = "tiny";
pub const BOOTSTRAP_WHISPER_PROFILE: &str = "fast";
pub const BOOTSTRAP_WHISPER_LANG: &str = "fr";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelBootstrapProgress {
    pub phase: String,
    pub percent: u8,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelBootstrapReport {
    pub minilm_ok: bool,
    pub whisper_ok: bool,
    pub error: Option<String>,
}

pub fn bootstrap_small_models(
    minilm_dir: &Path,
    mut on_progress: impl FnMut(ModelBootstrapProgress),
) -> ModelBootstrapReport {
    let mut minilm_ok = bootstrap_models_present(minilm_dir);
    let mut whisper_ok = false;
    let mut last_err: Option<String> = None;

    if minilm_ok {
        on_progress(ModelBootstrapProgress {
            phase: "minilm_done".into(),
            percent: 45,
        });
    } else {
        on_progress(ModelBootstrapProgress {
            phase: "minilm".into(),
            percent: 5,
        });
        match minilm_download::ensure_minilm_onnx_assets(minilm_dir) {
            Ok(_) => {
                minilm_ok = true;
                on_progress(ModelBootstrapProgress {
                    phase: "minilm_done".into(),
                    percent: 45,
                });
            }
            Err(e) => {
                last_err = Some(format!("MiniLM : {e}"));
                on_progress(ModelBootstrapProgress {
                    phase: "minilm_error".into(),
                    percent: 45,
                });
            }
        }
    }

    on_progress(ModelBootstrapProgress {
        phase: "whisper".into(),
        percent: 50,
    });
    match whisper_dictation::ensure_ggml_weights(
        whisper_dictation::DEFAULT_WHISPER_GGML_HF_REPO,
        "main",
        BOOTSTRAP_WHISPER_SIZE,
        BOOTSTRAP_WHISPER_PROFILE,
        BOOTSTRAP_WHISPER_LANG,
    ) {
        Ok(_) => {
            whisper_ok = true;
            on_progress(ModelBootstrapProgress {
                phase: "done".into(),
                percent: 100,
            });
        }
        Err(e) => {
            if last_err.is_none() {
                last_err = Some(format!("Whisper : {e}"));
            }
            on_progress(ModelBootstrapProgress {
                phase: "whisper_error".into(),
                percent: 100,
            });
        }
    }

    ModelBootstrapReport {
        minilm_ok,
        whisper_ok,
        error: last_err,
    }
}

pub fn bootstrap_models_present(minilm_dir: &Path) -> bool {
    let onnx = minilm_dir.join("model.onnx");
    let tok = minilm_dir.join("tokenizer.json");
    onnx.is_file()
        && tok.is_file()
        && std::fs::metadata(&onnx)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
        && std::fs::metadata(&tok)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
}
