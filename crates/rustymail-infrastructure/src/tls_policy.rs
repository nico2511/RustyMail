//! Politique TLS : rejeter TLS « invalide accepté » hors builds de développement.

/// Dans les binaires **release**, les certificats / noms invalides ne sont jamais acceptés,
/// même si l’interface ou SQLite contiennent l’option activée (compat MITM hors prod).
///
/// Builds **debug** : l’option utilisateur peut s’appliquer (labs / certificats auto-signés).
#[inline]
pub fn effective_allow_invalid_tls(ui_and_db_requested: bool) -> bool {
    ui_and_db_requested && cfg!(debug_assertions)
}

/// Valeur stockée SQLite / envoyée depuis l’UI : en release, impose toujours `false`.
#[inline]
pub fn persist_allow_invalid_tls_from_ui_checkbox(checked_by_user: bool) -> bool {
    checked_by_user && cfg!(debug_assertions)
}
