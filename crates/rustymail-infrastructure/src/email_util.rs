//! Normalisation d’adresses e-mail pour le carnet et les contacts.

/// Adresse normalisée (trim + minuscules) si non vide et contient `@`.
pub fn normalize_email(raw: &str) -> Option<String> {
    let e = raw.trim().to_ascii_lowercase();
    if e.is_empty() || !e.contains('@') {
        return None;
    }
    Some(e)
}
