//! Clé API OpenRouter (OpenAI-compatible) — **uniquement dans le trousseau**, jamais dans `app_prefs.json`.

pub const OPENROUTER_KEYRING_USERNAME: &str = "__rustymail_openrouter__";

pub fn openrouter_api_key_get() -> Result<Option<String>, String> {
    keyring::use_native_store(false).map_err(|e| format!("keyring: {e}"))?;
    let entry = keyring_core::Entry::new(crate::KEYRING_SERVICE, OPENROUTER_KEYRING_USERNAME)
        .map_err(|e| format!("keyring entry: {e}"))?;
    match entry.get_password() {
        Ok(s) if !s.trim().is_empty() => Ok(Some(s)),
        Ok(_) => Ok(None),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring read: {e}")),
    }
}

pub fn openrouter_api_key_set(secret: &str) -> Result<(), String> {
    keyring::use_native_store(false).map_err(|e| format!("keyring: {e}"))?;
    let entry = keyring_core::Entry::new(crate::KEYRING_SERVICE, OPENROUTER_KEYRING_USERNAME)
        .map_err(|e| format!("keyring entry: {e}"))?;
    entry
        .set_password(secret)
        .map_err(|e| format!("keyring write: {e}"))
}

pub fn openrouter_api_key_clear() {
    let Ok(_) = keyring::use_native_store(false) else {
        return;
    };
    let Ok(entry) = keyring_core::Entry::new(crate::KEYRING_SERVICE, OPENROUTER_KEYRING_USERNAME)
    else {
        return;
    };
    let _ = entry.delete_credential();
}

pub fn openrouter_api_key_present() -> bool {
    openrouter_api_key_get().ok().flatten().is_some()
}
