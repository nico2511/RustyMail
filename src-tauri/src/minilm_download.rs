//! Téléchargement des fichiers ONNX + tokenizer pour la recherche sémantique locale (Hugging Face, URLs `/resolve/`).

use std::path::{Path, PathBuf};

use rustymail_infrastructure::{download_hf_file_if_needed, hf_resolve_url};

const HF_REPO: &str = "sentence-transformers/all-MiniLM-L6-v2";
const HF_REVISION: &str = "main";

/// Assure `model.onnx` + `tokenizer.json` dans `dest_dir` (répertoire `…/models/all-MiniLM-L6-v2`).
pub fn ensure_minilm_onnx_assets(dest_dir: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dest_dir).map_err(|e| format!("création dossier modèles: {e}"))?;

    let onnx_url = hf_resolve_url(HF_REPO, HF_REVISION, "onnx/model.onnx");
    let tok_url = hf_resolve_url(HF_REPO, HF_REVISION, "tokenizer.json");

    eprintln!(
        "[RustyMail MiniLM] Téléchargement / cache — {}",
        dest_dir.display()
    );
    eprintln!("[RustyMail MiniLM]   → {onnx_url}");
    download_hf_file_if_needed(&onnx_url, &dest_dir.join("model.onnx"), "minilm-semantic")
        .map_err(|e| format!("model.onnx : {e}"))?;
    eprintln!("[RustyMail MiniLM]   → {tok_url}");
    download_hf_file_if_needed(
        &tok_url,
        &dest_dir.join("tokenizer.json"),
        "minilm-semantic",
    )
    .map_err(|e| format!("tokenizer.json : {e}"))?;

    Ok(dest_dir.to_path_buf())
}
