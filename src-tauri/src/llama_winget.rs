//! Détection et installation optionnelle de `llama-server` via winget (Windows).

use std::path::Path;
use std::process::{Command, Stdio};

pub const WINGET_LLAMA_PACKAGE_ID: &str = "ggml.llamacpp";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaServerDetectResult {
    pub on_path: bool,
    pub winget_installed: bool,
    pub resolved_path: Option<String>,
}

fn program_on_path(name: &str) -> bool {
    let b = name.trim();
    if b.is_empty() {
        return false;
    }
    if b.contains('/') || b.contains('\\') {
        return Path::new(b).is_file();
    }
    #[cfg(windows)]
    {
        Command::new("where")
            .arg(b)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        Command::new("which")
            .arg(b)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

fn winget_list_has_package(id: &str) -> bool {
    let out = Command::new("winget")
        .args(["list", "-e", "--id", id])
        .output();
    match out {
        Ok(o) => o.status.success(),
        Err(_) => false,
    }
}

/// Résout le chemin affiché pour l’UI (PATH ou binaire explicite).
pub fn detect_llama_server(binary_hint: &str) -> LlamaServerDetectResult {
    let hint = binary_hint.trim();
    let probe = if hint.is_empty() {
        "llama-server"
    } else {
        hint
    };
    let on_path = program_on_path(probe);
    let winget_installed = winget_list_has_package(WINGET_LLAMA_PACKAGE_ID);
    let resolved_path = if on_path {
        Some(probe.to_string())
    } else if winget_installed {
        Some("llama-server".to_string())
    } else {
        None
    };
    LlamaServerDetectResult {
        on_path,
        winget_installed,
        resolved_path,
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaServerWingetInstallResult {
    pub success: bool,
    pub message: String,
}

/// Lance `winget install` (peut demander une élévation UAC).
#[cfg(windows)]
pub fn install_llama_server_via_winget() -> LlamaServerWingetInstallResult {
    let child = Command::new("winget")
        .args([
            "install",
            "-e",
            "--id",
            WINGET_LLAMA_PACKAGE_ID,
            "--accept-package-agreements",
            "--accept-source-agreements",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let cmd = match child {
        Ok(c) => c,
        Err(e) => {
            return LlamaServerWingetInstallResult {
                success: false,
                message: format!("Impossible de lancer winget : {e}"),
            };
        }
    };

    let out = cmd.wait_with_output();
    match out {
        Ok(o) if o.status.success() => LlamaServerWingetInstallResult {
            success: true,
            message:
                "Installation winget terminée. Vérifiez que « llama-server » est dans le PATH."
                    .into(),
        },
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            let stdout = String::from_utf8_lossy(&o.stdout);
            LlamaServerWingetInstallResult {
                success: false,
                message: format!(
                    "winget a échoué (code {:?}).\n{stdout}\n{stderr}",
                    o.status.code()
                ),
            }
        }
        Err(e) => LlamaServerWingetInstallResult {
            success: false,
            message: format!("Erreur d’attente winget : {e}"),
        },
    }
}

#[cfg(not(windows))]
pub fn install_llama_server_via_winget() -> LlamaServerWingetInstallResult {
    LlamaServerWingetInstallResult {
        success: false,
        message: "Installation winget : Windows uniquement.".into(),
    }
}
