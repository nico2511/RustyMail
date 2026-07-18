//! Politique minimale avant ouverture OS d’une pièce jointe (signalement + accusé explicite).

use log::warn;
use std::path::Path;

pub const PREFIX_RISK_CONFIRM: &str = "ATTACHMENT_RISK_CONFIRM:";

const RISK_EXT: &[&str] = &[
    "exe", "msi", "dll", "bat", "cmd", "ps1", "scr", "vbs", "js", "jar", "com", "reg", "pif",
    "cpl", "msc", "hta", "wsf", "wsh", "lnk", "iso", "img", "app", "dmg", "pkg",
];

const MACRO_EXT: &[&str] = &[
    "docm", "dotm", "xlsm", "xltm", "pptm", "potm", "ppam", "xlam",
];

const ARCHIVE_EXT: &[&str] = &["zip", "rar", "7z", "gz", "tgz", "bz2", "xz", "cab"];

const SAFE_MIME_BY_EXT: &[(&str, &[&str])] = &[
    ("pdf", &["application/pdf"]),
    ("png", &["image/png"]),
    ("jpg", &["image/jpeg"]),
    ("jpeg", &["image/jpeg"]),
    ("gif", &["image/gif"]),
    ("webp", &["image/webp"]),
    ("txt", &["text/plain"]),
    ("csv", &["text/csv", "application/csv", "text/plain"]),
];

#[inline]
fn ext_of(file_name: &str) -> String {
    Path::new(file_name.trim())
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

/// Indique si l’accusé utilisateur doit être ré-exigé (côté UI + vérif IPC).
pub fn attachment_needs_explicit_ack(file_name: &str, mime_type: &str) -> Option<&'static str> {
    let ext = ext_of(file_name);
    if RISK_EXT.iter().any(|r| ext == *r) {
        return Some("extension à haut risque");
    }
    if MACRO_EXT.iter().any(|r| ext == *r) {
        return Some("document Office avec macros");
    }
    if ARCHIVE_EXT.iter().any(|r| ext == *r) {
        return Some("archive à inspecter avant ouverture");
    }
    if looks_like_double_extension(file_name) {
        return Some("nom avec double extension trompeuse");
    }

    let m = mime_type.trim().to_ascii_lowercase();

    let risky_prefix = [
        "application/x-ms",
        "application/x-dosexec",
        "application/x-msdownload",
        "application/x-ms-installer",
        "application/msdos-windows",
        "application/vnd.microsoft.portable-executable",
    ];
    if risky_prefix.iter().any(|p| m.starts_with(p))
        || m == "application/x-executable"
        || m == "application/x-shellscript"
        || m == "application/x-javascript"
        || m == "text/javascript"
        || m == "application/javascript"
        || m == "application/x-python-code"
        || m == "application/x-msdos-program"
    {
        return Some("MIME exécutable / script suspect");
    }

    if mime_mismatch_is_suspicious(&ext, &m) {
        return Some("extension et type MIME incohérents");
    }

    None
}

fn looks_like_double_extension(file_name: &str) -> bool {
    let parts: Vec<String> = file_name
        .trim()
        .split('.')
        .map(|s| s.to_ascii_lowercase())
        .collect();
    if parts.len() < 3 {
        return false;
    }
    let final_ext = parts.last().map(String::as_str).unwrap_or("");
    let previous = parts.iter().rev().skip(1).take(2).any(|p| {
        matches!(
            p.as_str(),
            "pdf" | "doc" | "docx" | "xls" | "xlsx" | "jpg" | "png"
        )
    });
    previous && (RISK_EXT.contains(&final_ext) || MACRO_EXT.contains(&final_ext))
}

fn mime_mismatch_is_suspicious(ext: &str, mime: &str) -> bool {
    if ext.is_empty() || mime.is_empty() || mime == "application/octet-stream" {
        return false;
    }
    SAFE_MIME_BY_EXT
        .iter()
        .find(|(e, _)| *e == ext)
        .is_some_and(|(_, allowed)| !allowed.iter().any(|m| mime.starts_with(*m)))
}

/// Journalisation minimale sans chemin utilisateur complet (nom de fichier tronqué).
pub fn log_attachment_audited(action: &str, file_hint: &str) {
    let hint = sanitize_hint(file_hint);
    warn!(target: "rustymail::audit", "{action}: {hint}");
}

fn sanitize_hint(raw: &str) -> String {
    let trim = raw.trim();
    Path::new(trim)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.chars().take(120).collect())
        .unwrap_or_else(|| "(unknown)".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_exe_extension() {
        assert!(attachment_needs_explicit_ack("report.exe", "").is_some());
        assert!(attachment_needs_explicit_ack("x", "application/x-msdownload").is_some());
        assert!(attachment_needs_explicit_ack("doc.pdf", "application/pdf").is_none());
    }

    #[test]
    fn flags_macro_archive_and_double_extension() {
        assert!(attachment_needs_explicit_ack("invoice.docm", "").is_some());
        assert!(attachment_needs_explicit_ack("archive.zip", "").is_some());
        assert!(attachment_needs_explicit_ack("invoice.pdf.exe", "").is_some());
    }

    #[test]
    fn flags_suspicious_mime_mismatch() {
        assert!(attachment_needs_explicit_ack("image.png", "application/x-msdownload").is_some());
        assert!(attachment_needs_explicit_ack("image.png", "image/png").is_none());
    }
}
