//! Sélection du magasin de secrets natif (remplace `keyring::use_native_store(false)` de keyring 4.0.0).

use std::collections::HashMap;

pub(crate) fn use_native_store() -> keyring_core::Result<()> {
    let config: HashMap<&str, &str> = HashMap::new();
    #[cfg(target_os = "windows")]
    keyring_core::set_default_store(windows_native_keyring_store::Store::new_with_configuration(
        &config,
    )?);
    #[cfg(target_os = "macos")]
    keyring_core::set_default_store(
        apple_native_keyring_store::keychain::Store::new_with_configuration(&config)?,
    );
    #[cfg(target_os = "linux")]
    keyring_core::set_default_store(linux_keyutils_keyring_store::Store::new_with_configuration(
        &config,
    )?);
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = &config;
        return Err(keyring_core::Error::NotSupportedByStore(
            "plateforme sans magasin natif".into(),
        ));
    }
    #[allow(unreachable_code)]
    Ok(())
}
