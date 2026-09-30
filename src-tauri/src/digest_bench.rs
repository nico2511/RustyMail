//! Banc d'essai fixtures. Accepter enregistre un verdict. La lecture ne change
//! que si `digest_bench_enable_reading` installe explicitement ce verdict.

use std::fs;
use std::path::{Path, PathBuf};

use rustymail_modules::mail_cleaning::digest_fixtures::{
    builtin_deblock_fixture_yaml, installed_reading_fixture_id, parse_fixture,
    preview_candidate_fixture, set_installed_reading_fixture, FixturePreview,
};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ipc_guard;
use crate::AppPaths;

const MAX_FIXTURE_YAML: usize = 64 * 1024;
const MAX_PREVIEW_HTML: usize = 1_500_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestPreviewPayload {
    pub yaml: String,
    pub html: String,
    pub sender_email: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestPreviewView {
    pub applicable: bool,
    pub html: Option<String>,
    pub fixture_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestAcceptPayload {
    pub yaml: String,
    #[serde(default)]
    pub sample_thread_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestBenchStatus {
    pub accepted: bool,
    pub accepted_fixture_id: Option<String>,
    pub reading_enabled: bool,
    pub reading_fixture_id: Option<String>,
    pub builtin_yaml: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AcceptedRecord {
    verdict: String,
    yaml: String,
    fixture_id: String,
    sample_thread_id: String,
}

pub(crate) fn load_reading_fixture_from_prefs(prefs_path: &Path) {
    let path = reading_yaml_path(prefs_path);
    let Ok(yaml) = fs::read_to_string(&path) else {
        set_installed_reading_fixture(None);
        return;
    };
    match parse_fixture(&yaml) {
        Ok(fixture) => set_installed_reading_fixture(Some(fixture)),
        Err(error) => {
            eprintln!("[RustyMail] fixture lecture ignorée ({error})");
            set_installed_reading_fixture(None);
        }
    }
}

#[tauri::command]
pub fn digest_bench_status(paths: State<'_, AppPaths>) -> Result<DigestBenchStatus, String> {
    Ok(status_from_prefs(&paths.prefs_path))
}

#[tauri::command]
pub fn digest_fixture_preview(payload: DigestPreviewPayload) -> Result<DigestPreviewView, String> {
    validate_yaml(&payload.yaml)?;
    validate_html(&payload.html)?;
    validate_sender(&payload.sender_email)?;
    let preview = preview_candidate_fixture(&payload.yaml, &payload.html, &payload.sender_email);
    Ok(preview_view(preview))
}

#[tauri::command]
pub fn digest_bench_accept(
    paths: State<'_, AppPaths>,
    payload: DigestAcceptPayload,
) -> Result<DigestBenchStatus, String> {
    validate_yaml(&payload.yaml)?;
    if let Some(thread_id) = payload.sample_thread_id.as_deref() {
        if !thread_id.trim().is_empty() {
            ipc_guard::validate_thread_id(thread_id)?;
        }
    }
    let fixture = parse_fixture(&payload.yaml).map_err(|error| error.to_string())?;
    let record = AcceptedRecord {
        verdict: "accepted".to_string(),
        yaml: payload.yaml,
        fixture_id: fixture.id,
        sample_thread_id: payload
            .sample_thread_id
            .unwrap_or_default()
            .trim()
            .to_string(),
    };
    write_accepted(&paths.prefs_path, &record)?;
    Ok(status_from_prefs(&paths.prefs_path))
}

#[tauri::command]
pub fn digest_bench_reject(paths: State<'_, AppPaths>) -> Result<DigestBenchStatus, String> {
    let record = AcceptedRecord {
        verdict: "rejected".to_string(),
        yaml: String::new(),
        fixture_id: String::new(),
        sample_thread_id: String::new(),
    };
    write_accepted(&paths.prefs_path, &record)?;
    Ok(status_from_prefs(&paths.prefs_path))
}

#[tauri::command]
pub fn digest_bench_enable_reading(
    paths: State<'_, AppPaths>,
) -> Result<DigestBenchStatus, String> {
    let record = read_accepted(&paths.prefs_path)?;
    if record.verdict != "accepted" || record.yaml.trim().is_empty() {
        return Err(
            "Aucune fixture acceptée. Accepter valide le banc, ce n'est pas encore la lecture."
                .to_string(),
        );
    }
    let fixture = parse_fixture(&record.yaml).map_err(|error| error.to_string())?;
    fs::write(reading_yaml_path(&paths.prefs_path), &record.yaml)
        .map_err(|error| format!("écriture fixture lecture : {error}"))?;
    set_installed_reading_fixture(Some(fixture));
    Ok(status_from_prefs(&paths.prefs_path))
}

#[tauri::command]
pub fn digest_bench_disable_reading(
    paths: State<'_, AppPaths>,
) -> Result<DigestBenchStatus, String> {
    let path = reading_yaml_path(&paths.prefs_path);
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("retrait fixture lecture : {error}"))?;
    }
    set_installed_reading_fixture(None);
    Ok(status_from_prefs(&paths.prefs_path))
}

fn preview_view(preview: FixturePreview) -> DigestPreviewView {
    DigestPreviewView {
        applicable: preview.applicable,
        html: preview.html,
        fixture_id: preview.fixture_id,
        error: preview.error,
    }
}

fn status_from_prefs(prefs_path: &Path) -> DigestBenchStatus {
    let accepted = read_accepted(prefs_path)
        .ok()
        .filter(|record| record.verdict == "accepted" && !record.yaml.trim().is_empty());
    DigestBenchStatus {
        accepted: accepted.is_some(),
        accepted_fixture_id: accepted.map(|record| record.fixture_id),
        reading_enabled: installed_reading_fixture_id().is_some(),
        reading_fixture_id: installed_reading_fixture_id(),
        builtin_yaml: builtin_deblock_fixture_yaml().to_string(),
    }
}

pub(crate) fn validate_sender(email: &str) -> Result<(), String> {
    if email.len() > 320 || email.contains('\0') || email.contains('\n') || email.contains('\r') {
        return Err("expéditeur invalide".to_string());
    }
    Ok(())
}

pub(crate) fn validate_yaml(yaml: &str) -> Result<(), String> {
    if yaml.len() > MAX_FIXTURE_YAML {
        return Err("YAML de fixture trop long".to_string());
    }
    if yaml.contains('\0') {
        return Err("YAML de fixture invalide".to_string());
    }
    Ok(())
}

pub(crate) fn validate_html(html: &str) -> Result<(), String> {
    if html.len() > MAX_PREVIEW_HTML {
        return Err("HTML trop long pour l'aperçu".to_string());
    }
    if html.contains('\0') {
        return Err("HTML invalide".to_string());
    }
    Ok(())
}

fn accepted_path(prefs_path: &Path) -> PathBuf {
    prefs_dir(prefs_path).join("digest_bench_accepted.json")
}

fn reading_yaml_path(prefs_path: &Path) -> PathBuf {
    prefs_dir(prefs_path).join("digest_bench_reading.yaml")
}

fn prefs_dir(prefs_path: &Path) -> PathBuf {
    prefs_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn write_accepted(prefs_path: &Path, record: &AcceptedRecord) -> Result<(), String> {
    let path = accepted_path(prefs_path);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| format!("dossier banc : {error}"))?;
    }
    let body = serde_json::to_string_pretty(record).map_err(|error| error.to_string())?;
    fs::write(path, body).map_err(|error| format!("écriture verdict banc : {error}"))
}

fn read_accepted(prefs_path: &Path) -> Result<AcceptedRecord, String> {
    let path = accepted_path(prefs_path);
    let body = fs::read_to_string(&path).map_err(|_| "Aucun verdict de banc".to_string())?;
    serde_json::from_str(&body).map_err(|error| format!("verdict banc illisible : {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accept_does_not_install_reading() {
        let dir = std::env::temp_dir().join(format!(
            "rustymail-digest-bench-{}-{}",
            std::process::id(),
            "accept"
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("dir");
        let prefs = dir.join("app_prefs.json");
        set_installed_reading_fixture(None);
        let yaml = builtin_deblock_fixture_yaml();
        let fixture = parse_fixture(yaml).expect("deblock");
        write_accepted(
            &prefs,
            &AcceptedRecord {
                verdict: "accepted".to_string(),
                yaml: yaml.to_string(),
                fixture_id: fixture.id,
                sample_thread_id: "t1".to_string(),
            },
        )
        .expect("write");
        assert!(!reading_yaml_path(&prefs).exists());
        assert!(installed_reading_fixture_id().is_none());
        let status = status_from_prefs(&prefs);
        assert!(status.accepted);
        assert!(!status.reading_enabled);
        let _ = fs::remove_dir_all(&dir);
    }
}
