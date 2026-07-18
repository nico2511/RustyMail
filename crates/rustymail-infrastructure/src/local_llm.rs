//! Cache disque GGUF Hugging Face + statut **guidage** pour llama-server / OpenRouter (pas d’inférence in-process).

use std::borrow::Cow;
use std::collections::BTreeSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

static LLM_GGUF_DOWNLOAD_CANCEL: AtomicBool = AtomicBool::new(false);

/// Demande l’arrêt du téléchargement GGUF en cours (boucle `ensure_local_llm_gguf_download`).
pub fn llm_gguf_download_cancel_request() {
    LLM_GGUF_DOWNLOAD_CANCEL.store(true, Ordering::SeqCst);
}

pub fn llm_gguf_download_cancel_clear() {
    LLM_GGUF_DOWNLOAD_CANCEL.store(false, Ordering::SeqCst);
}

fn llm_gguf_download_cancel_requested() -> bool {
    LLM_GGUF_DOWNLOAD_CANCEL.load(Ordering::SeqCst)
}

use crate::hf_download::hf_resolve_url;
use crate::{AiPrefs, AppPrefs};
use rustymail_llm::hardware::{
    detect_profile, host_memory_gib, llama_server_gpu_gate_ok, Accelerator, HardwareModelProfile,
    HardwareModelTier,
};
use serde::Serialize;

/// Déduit la carte Qwen2.5 Instruct à partir du nom de fichier GGUF officiel (`…-Nb-instruct…`).
fn qwen_variant_from_gguf_filename(filename: &str) -> Option<&'static str> {
    let n = filename.trim().to_ascii_lowercase();
    if !n.ends_with(".gguf") || !n.contains("qwen2.5") {
        return None;
    }
    // Ordre : le plus précis en premier (`14b` avant toute substring ambiguë).
    if n.contains("14b") {
        return Some("14b");
    }
    if n.contains("7b") {
        return Some("7b");
    }
    if n.contains("3b") {
        return Some("3b");
    }
    if n.contains("1.5b") || n.contains("1_5b") {
        return Some("1.5b");
    }
    None
}

fn canonical_qwen_instruct_hf_repo(variant: &str) -> Option<&'static str> {
    Some(match variant {
        "14b" => "Qwen/Qwen2.5-14B-Instruct-GGUF",
        "7b" => "Qwen/Qwen2.5-7B-Instruct-GGUF",
        "3b" => "Qwen/Qwen2.5-3B-Instruct-GGUF",
        "1.5b" => "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        _ => return None,
    })
}

fn qwen_variant_from_repo(repo: &str) -> Option<&'static str> {
    let r = repo.to_ascii_lowercase();
    if r.contains("14b") {
        return Some("14b");
    }
    if r.contains("7b") {
        return Some("7b");
    }
    if r.contains("3b") {
        return Some("3b");
    }
    if r.contains("1.5b") || r.contains("1_5") {
        return Some("1.5b");
    }
    None
}

fn is_monolithic_qwen_instruct_q4_k_m(filename: &str) -> bool {
    let n = filename.trim().to_ascii_lowercase();
    n.ends_with(".gguf")
        && n.contains("qwen2.5")
        && n.contains("instruct")
        && n.contains("q4_k_m")
        && !n.contains("-of-")
}

fn official_qwen_instruct_repo_lacks_monolithic_q4_k_m(repo: &str) -> bool {
    let r = repo.trim().trim_matches('/').to_ascii_lowercase();
    r == "qwen/qwen2.5-7b-instruct-gguf" || r == "qwen/qwen2.5-14b-instruct-gguf"
}

fn monolithic_q4_k_m_mirror_repo(variant: &str) -> Option<&'static str> {
    match variant {
        "7b" => Some("TheRains/Qwen2.5-7B-Instruct-Q4_K_M-GGUF"),
        "14b" => Some("TheRains/Qwen2.5-14B-Instruct-Q4_K_M-GGUF"),
        _ => None,
    }
}

/// Dépôt Hugging Face réel pour le téléchargement : évite les 404 quand les préférences
/// mélangent repo et fichier (ex. `…7B-Instruct-GGUF` + `…14b-instruct….gguf`).
pub fn resolved_hf_repo_for_download<'a>(prefs_repo: &'a str, filename: &'a str) -> Cow<'a, str> {
    let fv = match qwen_variant_from_gguf_filename(filename) {
        Some(v) => v,
        None => return Cow::Borrowed(prefs_repo.trim()),
    };
    let base = match qwen_variant_from_repo(prefs_repo.trim()) {
        Some(rv) if rv == fv => Cow::Borrowed(prefs_repo.trim()),
        Some(_) | None => {
            if let Some(canon) = canonical_qwen_instruct_hf_repo(fv) {
                Cow::Borrowed(canon)
            } else {
                Cow::Borrowed(prefs_repo.trim())
            }
        }
    };

    let repo_str = base.as_ref();
    if is_monolithic_qwen_instruct_q4_k_m(filename)
        && official_qwen_instruct_repo_lacks_monolithic_q4_k_m(repo_str)
    {
        if let Some(mirror) = monolithic_q4_k_m_mirror_repo(fv) {
            return Cow::Borrowed(mirror);
        }
    }

    base
}

/// Segment de chemin HF pour l’URL de téléchargement (le fichier local gardé peut rester celui des prefs).
/// Ex. dépôt `Qwen2.5-Coder-7B-Instruct-GGUF` attend `qwen2.5-coder-7b-instruct-…`, pas `qwen2.5-7b-instruct-…`.
pub fn resolved_hf_remote_gguf_path<'a>(
    prefs_repo: &'a str,
    prefs_filename: &'a str,
) -> Cow<'a, str> {
    let repo = prefs_repo.trim().to_ascii_lowercase();
    let f = prefs_filename.trim();
    let fl = f.to_ascii_lowercase();

    let is_coder_7b = repo.contains("coder-7b") || repo.contains("qwen2.5-coder-7b");
    if is_coder_7b && fl.starts_with("qwen2.5-7b-instruct-") && !fl.contains("coder") {
        const PREFIX: &str = "qwen2.5-7b-instruct-";
        let suffix = &f[PREFIX.len()..];
        return Cow::Owned(format!("qwen2.5-coder-7b-instruct-{suffix}"));
    }

    Cow::Borrowed(f)
}

/// Répertoire de cache pour un dépôt donné sous `models/local-llm/`.
pub fn llm_repo_cache_dir(models_local_llm_root: &Path, repo_id: &str) -> PathBuf {
    let slug = repo_id
        .trim()
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | ' ' => '_',
            c => c,
        })
        .collect::<String>();
    models_local_llm_root.join(slug)
}

/// Ancienne convention : dossier nommé uniquement après `prefs.local_llm_hf_repo_id` — incohérent
/// lorsque repo = 7B et fichier GGUF = 14B (téléchargement résolu vers autre HF).
fn llm_legacy_gguf_pref_path(models_local_llm_root: &Path, prefs: &AiPrefs) -> PathBuf {
    llm_repo_cache_dir(models_local_llm_root, prefs.local_llm_hf_repo_id.trim())
        .join(prefs.local_llm_gguf_file.trim().trim_start_matches('/'))
}

/// Chemin « canonique » : dossier HF = même logique que `resolved_hf_repo_for_download` pour aligner dépôt et fichier (ex. 14B → TheRains/…-14B…).
pub fn llm_expected_gguf_path(models_local_llm_root: &Path, prefs: &AiPrefs) -> PathBuf {
    let slug = resolved_hf_repo_for_download(
        prefs.local_llm_hf_repo_id.as_str(),
        prefs.local_llm_gguf_file.as_str(),
    );
    llm_repo_cache_dir(models_local_llm_root, slug.as_ref())
        .join(prefs.local_llm_gguf_file.trim().trim_start_matches('/'))
}

/// Déplace au besoin depuis l’emplacement ancien préférences vers le dossier résolu ; échoue silencieusement si hors disque / verrouillage.
pub fn llm_maybe_migrate_gguf_cache(
    models_local_llm_root: &Path,
    prefs: &AiPrefs,
) -> std::io::Result<()> {
    let dest = llm_expected_gguf_path(models_local_llm_root, prefs);
    if fs::metadata(&dest).map(|m| m.len() > 0).unwrap_or(false) {
        return Ok(());
    }
    let legacy = llm_legacy_gguf_pref_path(models_local_llm_root, prefs);
    if legacy == dest || !fs::metadata(&legacy).map(|m| m.len() > 0).unwrap_or(false) {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    if fs::rename(&legacy, &dest).is_ok() {
        return Ok(());
    }
    fs::copy(&legacy, &dest)?;
    let _ = fs::remove_file(&legacy);
    Ok(())
}

/// Chemin GGUF après tentative de mise en conformité du dossier ; repli ancien dossier si la migration impossible.
pub fn llm_gguf_path_for_runtime(models_local_llm_root: &Path, prefs: &AiPrefs) -> PathBuf {
    let _ = llm_maybe_migrate_gguf_cache(models_local_llm_root, prefs);
    let canonical = llm_expected_gguf_path(models_local_llm_root, prefs);
    if fs::metadata(&canonical)
        .map(|m| m.len() > 0)
        .unwrap_or(false)
    {
        return canonical;
    }
    let legacy = llm_legacy_gguf_pref_path(models_local_llm_root, prefs);
    if fs::metadata(&legacy).map(|m| m.len() > 0).unwrap_or(false) {
        return legacy;
    }
    canonical
}

pub fn llm_gguf_cached(models_local_llm_root: &Path, prefs: &AiPrefs) -> bool {
    llm_maybe_migrate_gguf_cache(models_local_llm_root, prefs).ok();
    fn nonempty(p: &Path) -> bool {
        fs::metadata(p).map(|m| m.len() > 0).unwrap_or(false)
    }
    let expected = llm_expected_gguf_path(models_local_llm_root, prefs);
    if nonempty(&expected) {
        return true;
    }
    let legacy = llm_legacy_gguf_pref_path(models_local_llm_root, prefs);
    legacy != expected && nonempty(&legacy)
}

const GGUF_CACHE_SCAN_MAX_DEPTH: usize = 10;

/// Fichiers `*.gguf` présents sous le répertoire cache LLM (récursif, profondeur bornée).
/// Retourne les **noms de fichiers seuls** (sans chemin), triés, sans doublon.
pub fn list_cached_gguf_filenames(models_local_llm_root: &Path) -> Result<Vec<String>, String> {
    let mut names = BTreeSet::new();
    if !models_local_llm_root.is_dir() {
        return Ok(Vec::new());
    }

    fn walk(dir: &Path, depth: usize, names: &mut BTreeSet<String>) -> std::io::Result<()> {
        if depth > GGUF_CACHE_SCAN_MAX_DEPTH {
            return Ok(());
        }
        let rd = match fs::read_dir(dir) {
            Ok(r) => r,
            Err(_) => return Ok(()),
        };
        for ent in rd {
            let ent = ent?;
            let path = ent.path();
            let md = match fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            if md.is_dir() {
                walk(&path, depth + 1, names)?;
            } else if md.is_file() {
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                if ext.eq_ignore_ascii_case("gguf") {
                    if let Some(n) = path.file_name().and_then(|s| s.to_str()) {
                        names.insert(n.to_string());
                    }
                }
            }
        }
        Ok(())
    }

    walk(models_local_llm_root, 0, &mut names).map_err(|e| format!("scan cache GGUF: {e}"))?;
    Ok(names.into_iter().collect())
}

/// Progrès grossier 0–100 pour l’UI.
pub fn ensure_local_llm_gguf_download(
    models_local_llm_root: &Path,
    prefs: &AiPrefs,
    mut on_progress: impl FnMut(u8),
) -> Result<PathBuf, String> {
    let dest = llm_expected_gguf_path(models_local_llm_root, prefs);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("dossier modèle LLM: {e}"))?;
    }
    let _ = llm_maybe_migrate_gguf_cache(models_local_llm_root, prefs);

    if fs::metadata(&dest).map(|m| m.len() > 0).unwrap_or(false) {
        on_progress(100);
        return Ok(dest);
    }

    let repo_for_url = resolved_hf_repo_for_download(
        prefs.local_llm_hf_repo_id.as_str(),
        prefs.local_llm_gguf_file.as_str(),
    );
    let remote_file = resolved_hf_remote_gguf_path(
        prefs.local_llm_hf_repo_id.as_str(),
        prefs.local_llm_gguf_file.as_str(),
    );
    let url = hf_resolve_url(
        repo_for_url.as_ref(),
        prefs.local_llm_hf_revision.trim(),
        remote_file.as_ref(),
    );
    let tmp = dest
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default()
        .join(format!(
            "{}.part",
            dest.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("model.gguf")
        ));
    let _ = fs::remove_file(&tmp);

    llm_gguf_download_cancel_clear();
    on_progress(0);
    let resp = ureq::get(url.as_str())
        .set(
            "User-Agent",
            "RustyMail/0.1; local-llm-gguf; +https://huggingface.co/docs/hub/api",
        )
        .call()
        .map_err(|e| format!("requête téléchargement LLM ({url}): {e}"))?;
    let status = resp.status();
    if !(200..300).contains(&status) {
        let hint = if status == 404 {
            " — depot / fichier incoherents : repo Coder-7B utilise qwen2.5-coder-7b-instruct-*.gguf ; repos Qwen 7B/14B-Instruct officiels = pas de fichier q4_k_m monolithique (shards ou miroirs type TheRains/...Q4_K_M-GGUF)."
        } else {
            ""
        };
        return Err(format!("HTTP {status} pour {url}{hint}"));
    }

    let total = resp
        .header("Content-Length")
        .and_then(|s: &str| s.parse::<u64>().ok());

    let mut reader = resp.into_reader();
    let mut out = fs::File::create(&tmp).map_err(|e| format!("fichier temporaire GGUF: {e}"))?;
    let mut buf = vec![0u8; 256 * 1024];
    let mut downloaded: u64 = 0;

    loop {
        if llm_gguf_download_cancel_requested() {
            drop(out);
            let _ = fs::remove_file(&tmp);
            llm_gguf_download_cancel_clear();
            return Err("Téléchargement du modèle annulé.".into());
        }
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("lecture flux GGUF: {e}"))?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n])
            .map_err(|e| format!("écriture GGUF: {e}"))?;
        downloaded = downloaded.saturating_add(n as u64);
        if let Some(t) = total {
            let pct = ((downloaded.min(t) as f64 / t.max(1) as f64) * 100.0) as u8;
            on_progress(pct.min(99));
        } else if downloaded < 2 * 1024 * 1024 {
            on_progress(25);
        } else if downloaded < 512 * 1024 * 1024 {
            on_progress(50);
        } else {
            on_progress(75);
        }
    }

    drop(out);
    fs::rename(&tmp, &dest).map_err(|e| format!("renommage GGUF final: {e}"))?;
    on_progress(100);
    Ok(dest)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmStatusPayload {
    pub hardware_tier: String,
    pub accelerator_suggested: String,
    pub total_ram_gb: f64,
    pub available_ram_gb: f64,
    pub recommended_repo: String,
    pub recommended_file: String,
    pub profile_local_runnable: bool,
    pub profile_reason: Option<String>,
    pub model_file_present: bool,
    pub expected_path_display: String,
    /// GGUF conseillé / téléchargé pour **llama-server** externe (pas chargé dans l’app).
    pub local_llm_enabled: bool,
    pub local_repo_id: String,
    pub local_revision: String,
    pub local_gguf_file: String,
    pub llm_gate_open: bool,
    /// Message explicite quand `llm_gate_open` est faux (évite un appel LLM voué à l’échec).
    pub llm_gate_hint: Option<String>,
    pub openrouter_enabled: bool,
    pub openrouter_api_key_set: bool,
    pub openrouter_model: String,
    pub llama_server_enabled: bool,
    pub llama_server_base_url: String,
    pub llama_server_model: String,
    pub llama_server_api_key_set: bool,
    pub llama_server_gpu_gate_ok: bool,
    pub llama_server_allow_cpu_override: bool,
    pub llama_server_spawn_enabled: bool,
    pub llama_server_binary_path: String,
    /// `n_ctx` lu depuis llama-server (`/props`) si le serveur répond.
    pub llama_server_n_ctx: Option<u32>,
}

fn tier_label(tier: HardwareModelTier) -> &'static str {
    match tier {
        HardwareModelTier::Insufficient => "insufficient",
        HardwareModelTier::Tiny => "tiny",
        HardwareModelTier::Small => "small",
        HardwareModelTier::Medium => "medium",
        HardwareModelTier::Large => "large",
    }
}

fn accel_label(a: Accelerator) -> &'static str {
    match a {
        Accelerator::Auto => "auto",
        Accelerator::Cpu => "cpu",
        Accelerator::Cuda => "cuda",
        Accelerator::Vulkan => "vulkan",
        Accelerator::Metal => "metal",
    }
}

pub fn build_llm_status(
    llm_models_dir: &Path,
    prefs: &AppPrefs,
    profile_override: Option<&HardwareModelProfile>,
) -> LlmStatusPayload {
    let profile = profile_override.cloned().unwrap_or_else(detect_profile);
    let (total_gb, avail_gb) = host_memory_gib();

    let model_file_present = llm_gguf_cached(llm_models_dir, &prefs.ai);

    let gguf_path_display = llm_gguf_path_for_runtime(llm_models_dir, &prefs.ai);

    let llama_srv_gpu_ok =
        llama_server_gpu_gate_ok(&profile, prefs.ai.llama_server_allow_cpu_override);
    let openrouter_gate = prefs.ai.openrouter_enabled
        && crate::openrouter::openrouter_api_key_present()
        && !prefs.ai.openrouter_model.trim().is_empty();
    let llama_spawn_ready = prefs.ai.llama_server_spawn_enabled
        && !prefs.ai.llama_server_binary_path.trim().is_empty()
        && model_file_present;
    let llama_server_gate = prefs.ai.llama_server_enabled
        && !prefs.ai.llama_server_base_url.trim().is_empty()
        && llama_srv_gpu_ok
        && (!prefs.ai.llama_server_model.trim().is_empty() || llama_spawn_ready);
    let gate = openrouter_gate || llama_server_gate;
    let llm_gate_hint = if gate {
        None
    } else {
        Some(
            rustymail_application::ai::ensure_llm_gate(
                prefs.ai.openrouter_enabled,
                crate::openrouter::openrouter_api_key_present(),
                !prefs.ai.openrouter_model.trim().is_empty(),
                prefs.ai.llama_server_enabled,
                !prefs.ai.llama_server_base_url.trim().is_empty(),
                !prefs.ai.llama_server_model.trim().is_empty(),
                llama_srv_gpu_ok,
                prefs.ai.llama_server_spawn_enabled,
                !prefs.ai.llama_server_binary_path.trim().is_empty(),
                model_file_present,
            )
            .err()
            .unwrap_or("Aucun moteur IA disponible.")
            .to_string(),
        )
    };

    LlmStatusPayload {
        hardware_tier: tier_label(profile.tier).to_string(),
        accelerator_suggested: accel_label(profile.accel_suggested).to_string(),
        total_ram_gb: (total_gb * 100.0).round() / 100.0,
        available_ram_gb: (avail_gb * 100.0).round() / 100.0,
        recommended_repo: profile.recommended_repo.clone(),
        recommended_file: profile.recommended_file.clone(),
        profile_local_runnable: profile.local_runnable,
        profile_reason: profile.reason.clone(),
        model_file_present,
        expected_path_display: gguf_path_display.display().to_string(),
        local_llm_enabled: prefs.ai.local_llm_enabled,
        local_repo_id: prefs.ai.local_llm_hf_repo_id.clone(),
        local_revision: prefs.ai.local_llm_hf_revision.clone(),
        local_gguf_file: prefs.ai.local_llm_gguf_file.clone(),
        llm_gate_open: gate,
        llm_gate_hint,
        openrouter_enabled: prefs.ai.openrouter_enabled,
        openrouter_api_key_set: crate::openrouter::openrouter_api_key_present(),
        openrouter_model: prefs.ai.openrouter_model.clone(),
        llama_server_enabled: prefs.ai.llama_server_enabled,
        llama_server_base_url: prefs.ai.llama_server_base_url.clone(),
        llama_server_model: prefs.ai.llama_server_model.clone(),
        llama_server_api_key_set: crate::llama_server::llama_server_api_key_present(),
        llama_server_gpu_gate_ok: llama_srv_gpu_ok,
        llama_server_allow_cpu_override: prefs.ai.llama_server_allow_cpu_override,
        llama_server_spawn_enabled: prefs.ai.llama_server_spawn_enabled,
        llama_server_binary_path: prefs.ai.llama_server_binary_path.clone(),
        llama_server_n_ctx: None,
    }
}

#[cfg(test)]
mod hf_repo_resolve_tests {
    use super::{resolved_hf_remote_gguf_path, resolved_hf_repo_for_download};

    #[test]
    fn overrides_7b_repo_when_file_is_14b() {
        assert_eq!(
            resolved_hf_repo_for_download(
                "Qwen/Qwen2.5-7B-Instruct-GGUF",
                "qwen2.5-14b-instruct-q4_k_m.gguf"
            )
            .as_ref(),
            "TheRains/Qwen2.5-14B-Instruct-Q4_K_M-GGUF"
        );
    }

    #[test]
    fn official_7b_repo_monolithic_goes_to_mirror() {
        let r = "Qwen/Qwen2.5-7B-Instruct-GGUF";
        assert_eq!(
            resolved_hf_repo_for_download(r, "qwen2.5-7b-instruct-q4_k_m.gguf").as_ref(),
            "TheRains/Qwen2.5-7B-Instruct-Q4_K_M-GGUF"
        );
    }

    #[test]
    fn official_14b_repo_monolithic_goes_to_mirror() {
        let r = "Qwen/Qwen2.5-14B-Instruct-GGUF";
        assert_eq!(
            resolved_hf_repo_for_download(r, "qwen2.5-14b-instruct-q4_k_m.gguf").as_ref(),
            "TheRains/Qwen2.5-14B-Instruct-Q4_K_M-GGUF"
        );
    }

    #[test]
    fn keeps_non_monolithic_or_unmirrored_repos() {
        let r = "Qwen/Qwen2.5-7B-Instruct-GGUF";
        assert_eq!(
            resolved_hf_repo_for_download(r, "qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf")
                .as_ref(),
            r
        );
    }

    #[test]
    fn coder_repo_rewrites_generic_instruct_filename_for_url() {
        assert_eq!(
            resolved_hf_remote_gguf_path(
                "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
                "qwen2.5-7b-instruct-q4_k_m.gguf"
            )
            .as_ref(),
            "qwen2.5-coder-7b-instruct-q4_k_m.gguf"
        );
    }

    #[test]
    fn non_qwen_filenames_leave_repo_unchanged() {
        assert_eq!(
            resolved_hf_repo_for_download("Someone/Other-GGUF", "model.gguf").as_ref(),
            "Someone/Other-GGUF"
        );
    }
}

#[cfg(test)]
mod gguf_cache_path_tests {
    use super::{
        llm_expected_gguf_path, llm_gguf_cached, llm_maybe_migrate_gguf_cache, llm_repo_cache_dir,
        resolved_hf_repo_for_download,
    };
    use crate::AiPrefs;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn scratch_local_llm_root() -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "rustymail_gguf_cache_tests_{}",
            uuid::Uuid::new_v4()
        ));
        p
    }

    fn prefs_7b_repo_14b_file() -> AiPrefs {
        let mut ai = AiPrefs::default();
        ai.local_llm_hf_repo_id = "Qwen/Qwen2.5-7B-Instruct-GGUF".into();
        ai.local_llm_gguf_file = "qwen2.5-14b-instruct-q4_k_m.gguf".into();
        ai
    }

    #[test]
    fn expected_gguf_path_uses_resolved_hf_slug_not_prefs_repo_only() {
        let prefs = prefs_7b_repo_14b_file();
        let root = scratch_local_llm_root();
        let resolved = resolved_hf_repo_for_download(
            prefs.local_llm_hf_repo_id.as_str(),
            prefs.local_llm_gguf_file.as_str(),
        );
        assert!(
            resolved.as_ref().contains("14B-Instruct-Q4_K_M-GGUF"),
            "resolved repo should align mirror 14B monolithic q4_k_m, got {}",
            resolved
        );

        let p = llm_expected_gguf_path(&root, &prefs);
        let expected_parent = llm_repo_cache_dir(&root, resolved.as_ref());
        assert_eq!(
            Some(expected_parent.as_path()),
            p.parent(),
            "parent dir must match llm_repo_cache_dir(root, resolved_hf_repo)"
        );
        assert!(
            p.ends_with(prefs.local_llm_gguf_file.trim()),
            "filename must remain prefs GGUF basename"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn migrate_moves_legacy_pref_tree_to_canonical_resolved_slug() {
        let prefs = prefs_7b_repo_14b_file();
        let root = scratch_local_llm_root();

        let legacy_parent = llm_repo_cache_dir(&root, prefs.local_llm_hf_repo_id.trim());
        fs::create_dir_all(&legacy_parent).unwrap();
        let legacy_file = legacy_parent.join(prefs.local_llm_gguf_file.trim());
        fs::write(&legacy_file, b"GgufStub").unwrap();

        llm_maybe_migrate_gguf_cache(&root, &prefs).expect("migrate");

        let canonical = llm_expected_gguf_path(&root, &prefs);
        assert!(
            canonical.is_file(),
            "after migrate GGUF must exist at canonical {:?}",
            canonical
        );
        assert_eq!(fs::read(&canonical).unwrap(), b"GgufStub");
        assert!(
            fs::metadata(&legacy_file).is_err(),
            "legacy file should no longer exist at {:?}",
            legacy_file
        );
        assert!(llm_gguf_cached(&root, &prefs));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn default_3b_prefs_canonical_equals_legacy_slug() {
        let prefs = AiPrefs::default();
        let resolved = resolved_hf_repo_for_download(
            prefs.local_llm_hf_repo_id.as_str(),
            prefs.local_llm_gguf_file.as_str(),
        );
        assert_eq!(
            llm_repo_cache_dir(Path::new("_"), prefs.local_llm_hf_repo_id.trim()),
            llm_repo_cache_dir(Path::new("_"), resolved.as_ref()),
            "official 3B + monolithic q4_k_m: folder slug unchanged"
        );
    }
}
