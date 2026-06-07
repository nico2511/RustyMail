//! Validation centralisée des URLs exposées depuis les préférences (API OpenAI-compat, compagnon HTTP).

use std::path::Path;

use crate::{save_app_prefs, AppPrefs};

const MAX_URL_BYTES: usize = 2048;

pub(crate) fn is_loopback_host(host: &str) -> bool {
    matches!(
        host.to_ascii_lowercase().as_str(),
        "localhost" | "127.0.0.1" | "::1" | "0:0:0:0:0:0:0:1"
    )
}

/// Valide une base d’API type OpenAI (`https://…` ou `http://` strictement localhost / 127.0.0.1 / ::1).
pub fn validate_openai_compatible_base_url(raw: &str) -> Result<(), String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("URL de base vide.".into());
    }
    if trimmed.len() > MAX_URL_BYTES {
        return Err(format!("URL trop longue (> {MAX_URL_BYTES} caractères)."));
    }

    let u = url::Url::parse(trimmed).map_err(|e| format!("URL invalide: {e}"))?;

    if !u.username().is_empty() || u.password().is_some() {
        return Err("Identifiants intégrés à l’URL non autorisés.".into());
    }

    let host_str = u
        .host_str()
        .ok_or_else(|| "Hôte absent (URL invalide).".to_string())?;

    match u.scheme() {
        "https" => Ok(()),
        "http" => {
            if is_loopback_host(host_str) {
                Ok(())
            } else {
                Err("Schéma http réservé à localhost ou 127.0.0.1 (compagnon local).".into())
            }
        }
        scheme => Err(format!(
            "Schéma non autorisé pour cette URL (« {scheme} »). Utilisez https: ou http sur loopback uniquement."
        )),
    }
}

/// `local_http` peut rester vide ; sinon même politique restrictive (boucle locale).
pub fn validate_local_companion_base_url(raw: &str) -> Result<(), String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    validate_openai_compatible_base_url(trimmed)
}

/// Contrôle URLs IA susceptibles de sortir réseau.
pub fn validate_app_prefs_ai_urls(prefs: &AppPrefs) -> Result<(), String> {
    validate_openai_compatible_base_url(prefs.ai.openai_base_url.as_str())?;
    validate_local_companion_base_url(prefs.ai.local_companion_base_url.as_str())?;
    let ob = prefs.ai.openrouter_base_url.trim();
    if !ob.is_empty() {
        validate_openai_compatible_base_url(ob)?;
    }
    let lb = prefs.ai.llama_server_base_url.trim();
    if !lb.is_empty() {
        validate_openai_compatible_base_url(lb)?;
    }
    Ok(())
}

/// Valide puis persiste (`set_app_prefs` Tauri doit utiliser cette entrée).
pub fn save_app_prefs_validated(path: &Path, prefs: &AppPrefs) -> Result<(), String> {
    validate_app_prefs_ai_urls(prefs)?;
    save_app_prefs(path, prefs)
}

/// Hôte et port TCP pour joindre llama-server à partir de la base API (`http://127.0.0.1:8080/v1`).
/// Réservé au **loopback** pour le lancement processus côté appli.
pub fn parse_llama_loopback_listen_addr(raw_base: &str) -> Result<(String, u16), String> {
    let trimmed = raw_base.trim();
    let u = url::Url::parse(trimmed).map_err(|e| format!("URL llama-server invalide: {e}"))?;
    let host_str = u
        .host_str()
        .ok_or_else(|| "Hôte absent dans l’URL llama-server.".to_string())?;
    if !is_loopback_host(host_str) {
        return Err(
            "Lancement auto : l’URL doit viser localhost / 127.0.0.1 / ::1 uniquement.".into(),
        );
    }
    let port = u
        .port_or_known_default()
        .ok_or_else(|| "Port TCP indéterminé (ajoutez :8080 dans l’URL).".to_string())?;
    Ok((host_str.to_string(), port))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_https_apis() {
        validate_openai_compatible_base_url("https://api.openai.com/v1").unwrap();
    }

    #[test]
    fn allows_http_loopback_only() {
        validate_openai_compatible_base_url("http://localhost:8080/v1").unwrap();
        validate_openai_compatible_base_url("http://127.0.0.1:11434/v1").unwrap();
        assert!(validate_openai_compatible_base_url("http://evil.com").is_err());
    }

    #[test]
    fn rejects_credentialed_urls() {
        assert!(validate_openai_compatible_base_url("https://user:pass@api.openai.com/v1").is_err());
    }

    #[test]
    fn parse_llama_loopback_host_port() {
        let (h, p) = parse_llama_loopback_listen_addr("http://127.0.0.1:8080/v1").unwrap();
        assert_eq!(h, "127.0.0.1");
        assert_eq!(p, 8080);
        assert!(parse_llama_loopback_listen_addr("http://192.168.1.1:8080/v1").is_err());
    }
}
