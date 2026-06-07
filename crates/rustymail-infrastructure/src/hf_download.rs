//! Téléchargements Hugging Face (URLs `/resolve/…`, cache fichier local).

use std::io::Read;
use std::path::Path;

/// URL `https://huggingface.co/{repo}/resolve/{revision}/{file}`.
pub fn hf_resolve_url(repo_id: &str, revision: &str, file: &str) -> String {
    format!(
        "https://huggingface.co/{}/resolve/{}/{}",
        repo_id.trim().trim_matches('/'),
        revision.trim(),
        file.trim_start_matches('/')
    )
}

/// Télécharge dans `dest` si absent ou vide. `user_agent_tag` identifie le sous-système (ex. `minilm-semantic`).
pub fn download_hf_file_if_needed(
    url: &str,
    dest: &Path,
    user_agent_tag: &str,
) -> Result<(), String> {
    if let Ok(m) = std::fs::metadata(dest) {
        if m.len() > 0 {
            return Ok(());
        }
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let ua = format!(
        "RustyMail/0.1; {}; +https://huggingface.co/docs/hub/api",
        user_agent_tag.trim()
    );
    let resp = ureq::get(url)
        .set("User-Agent", &ua)
        .call()
        .map_err(|e| format!("requête HTTP: {e}"))?;
    let status = resp.status();
    if !(200..300).contains(&status) {
        return Err(format!("HTTP {status}"));
    }
    let mut reader = resp.into_reader();
    let mut body = Vec::new();
    reader
        .read_to_end(&mut body)
        .map_err(|e| format!("lecture réponse: {e}"))?;
    std::fs::write(dest, &body).map_err(|e| format!("écriture {}: {e}", dest.display()))?;
    Ok(())
}
