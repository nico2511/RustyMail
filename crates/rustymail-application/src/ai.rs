//! Orchestration IA / LLM : budgets, garde-fous.

use rustymail_domain::{LlmFeature, TokenBudgetReport};

/// Conservé pour compatibilité : plus de liaison `llama.cpp` dans le binaire.
#[must_use]
pub fn native_llm_backend_linked() -> bool {
    false
}

/// Réserve pour l’agrégation diagnostics.
pub fn token_budget_for(feature: LlmFeature, n_ctx_hint: u32) -> TokenBudgetReport {
    let mut b = TokenBudgetReport::empty_stub();
    b.n_ctx = n_ctx_hint;
    let _ = feature;
    b
}

fn chat_backend_kind(raw: &str) -> &'static str {
    match raw.trim() {
        "openrouter" => "openrouter",
        "llama-server" => "llama-server",
        "ollama" => "ollama",
        _ => "auto",
    }
}

fn openrouter_block_reason(
    openrouter_enabled: bool,
    openrouter_key_present: bool,
    openrouter_model_nonempty: bool,
) -> Option<&'static str> {
    if openrouter_enabled && !openrouter_key_present {
        return Some("OpenRouter activé : enregistrez une clé API (trousseau OS) dans Paramètres → IA → OpenRouter.");
    }
    if openrouter_enabled && !openrouter_model_nonempty {
        return Some("OpenRouter activé : renseignez un identifiant de modèle.");
    }
    None
}

fn llama_block_reason(
    llama_server_enabled: bool,
    llama_server_url_nonempty: bool,
    llama_server_model_nonempty: bool,
    llama_server_gpu_ok: bool,
    llama_server_spawn_enabled: bool,
    llama_server_binary_nonempty: bool,
    llama_server_gguf_cached: bool,
    llama_spawn_ready: bool,
) -> Option<&'static str> {
    if llama_server_enabled && !llama_server_url_nonempty {
        return Some(
            "llama-server activé : renseignez une URL de base (ex. http://127.0.0.1:8080/v1).",
        );
    }
    if llama_server_enabled && !llama_server_model_nonempty && !llama_spawn_ready {
        return Some(
            "llama-server activé : renseignez le nom de modèle, ou activez « Lancer llama-server » avec binaire + GGUF en cache.",
        );
    }
    if llama_server_enabled && llama_server_spawn_enabled && !llama_server_binary_nonempty {
        return Some(
            "Lancement llama-server : indiquez la commande (ex. llama-server sur le PATH) ou le chemin complet vers l’exécutable (Paramètres → IA → Sur mon PC & cloud).",
        );
    }
    if llama_server_enabled
        && llama_server_spawn_enabled
        && llama_server_binary_nonempty
        && !llama_server_gguf_cached
    {
        return Some(
            "Lancement llama-server : aucun GGUF trouvé dans le cache RustyMail — téléchargez ou vérifiez dépôt / fichier.",
        );
    }
    if llama_server_enabled
        && llama_server_url_nonempty
        && (llama_server_model_nonempty || llama_spawn_ready)
        && !llama_server_gpu_ok
    {
        return Some(
            "llama-server : profil matériel insuffisant ou accélérateur non détecté — activez l’override CPU avancé si vous savez ce que vous faites.",
        );
    }
    None
}

fn ollama_block_reason(ollama_url_nonempty: bool, ollama_model_nonempty: bool) -> &'static str {
    if !ollama_url_nonempty {
        "Ollama : renseignez l’URL (souvent http://127.0.0.1:11434/v1)."
    } else if !ollama_model_nonempty {
        "Ollama : renseignez le nom de modèle (`ollama list`)."
    } else {
        "Ollama : configuration incomplète."
    }
}

/// Conditions minimales pour autoriser un appel modules `ai_*`.
///
/// `chat_backend` : `auto` (priorité historique), `openrouter`, `llama-server` ou `ollama`.
/// Ollama n’a pas de garde GPU : URL + modèle suffisent. La joignabilité est testée à la construction du client.
pub fn ensure_llm_gate(
    openrouter_enabled: bool,
    openrouter_key_present: bool,
    openrouter_model_nonempty: bool,
    llama_server_enabled: bool,
    llama_server_url_nonempty: bool,
    llama_server_model_nonempty: bool,
    llama_server_gpu_ok: bool,
    // Lancer llama-server depuis RustyMail (`-m` sur le GGUF du cache).
    llama_server_spawn_enabled: bool,
    llama_server_binary_nonempty: bool,
    llama_server_gguf_cached: bool,
    chat_backend: &str,
    ollama_enabled: bool,
    ollama_url_nonempty: bool,
    ollama_model_nonempty: bool,
) -> Result<(), &'static str> {
    let openrouter_ok = openrouter_enabled && openrouter_key_present && openrouter_model_nonempty;
    let llama_spawn_ready =
        llama_server_spawn_enabled && llama_server_binary_nonempty && llama_server_gguf_cached;
    let llama_ok = llama_server_enabled
        && llama_server_url_nonempty
        && llama_server_gpu_ok
        && (llama_server_model_nonempty || llama_spawn_ready);
    let ollama_ok = ollama_url_nonempty && ollama_model_nonempty;
    let backend = chat_backend_kind(chat_backend);

    if backend == "ollama" {
        return if ollama_ok {
            Ok(())
        } else {
            Err(ollama_block_reason(
                ollama_url_nonempty,
                ollama_model_nonempty,
            ))
        };
    }
    if backend == "openrouter" {
        if openrouter_ok {
            return Ok(());
        }
        return Err(openrouter_block_reason(
            openrouter_enabled,
            openrouter_key_present,
            openrouter_model_nonempty,
        )
        .unwrap_or(
            "OpenRouter sélectionné : activez-le, enregistrez une clé API et un identifiant de modèle.",
        ));
    }
    if backend == "llama-server" {
        if llama_ok {
            return Ok(());
        }
        return Err(llama_block_reason(
            llama_server_enabled,
            llama_server_url_nonempty,
            llama_server_model_nonempty,
            llama_server_gpu_ok,
            llama_server_spawn_enabled,
            llama_server_binary_nonempty,
            llama_server_gguf_cached,
            llama_spawn_ready,
        )
        .unwrap_or("llama-server sélectionné : activez-le avec une URL et un modèle (ou le lancement auto)."));
    }

    if openrouter_ok || llama_ok || (ollama_enabled && ollama_ok) {
        return Ok(());
    }
    if let Some(reason) = openrouter_block_reason(
        openrouter_enabled,
        openrouter_key_present,
        openrouter_model_nonempty,
    ) {
        return Err(reason);
    }
    if let Some(reason) = llama_block_reason(
        llama_server_enabled,
        llama_server_url_nonempty,
        llama_server_model_nonempty,
        llama_server_gpu_ok,
        llama_server_spawn_enabled,
        llama_server_binary_nonempty,
        llama_server_gguf_cached,
        llama_spawn_ready,
    ) {
        return Err(reason);
    }
    if ollama_enabled {
        return Err(ollama_block_reason(
            ollama_url_nonempty,
            ollama_model_nonempty,
        ));
    }
    Err("Aucun moteur IA disponible : activez OpenRouter (clé + modèle), llama-server (URL + modèle + GPU, ou lancement auto), ou Ollama (URL + modèle).")
}

#[cfg(test)]
mod tests {
    use super::ensure_llm_gate;

    fn gate(
        chat_backend: &str,
        ollama_enabled: bool,
        ollama_url: bool,
        ollama_model: bool,
    ) -> Result<(), &'static str> {
        ensure_llm_gate(
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            chat_backend,
            ollama_enabled,
            ollama_url,
            ollama_model,
        )
    }

    #[test]
    fn ollama_backend_opens_without_gpu_gate() {
        assert!(gate("ollama", true, true, true).is_ok());
    }

    #[test]
    fn ollama_backend_requires_url_and_model() {
        let err = gate("ollama", true, false, true).unwrap_err();
        assert!(err.contains("Ollama"));
        assert!(err.contains("11434"));
        let err = gate("ollama", true, true, false).unwrap_err();
        assert!(err.contains("modèle"));
    }

    #[test]
    fn auto_uses_ollama_only_when_enabled_and_complete() {
        assert!(gate("auto", false, true, true).is_err());
        assert!(gate("auto", true, true, false).is_err());
        assert!(gate("auto", true, true, true).is_ok());
    }

    #[test]
    fn explicit_openrouter_ignores_a_ready_ollama() {
        let err = ensure_llm_gate(
            false,
            false,
            false,
            false,
            false,
            false,
            true,
            false,
            false,
            false,
            "openrouter",
            true,
            true,
            true,
        )
        .unwrap_err();
        assert!(err.contains("OpenRouter"));
    }
}
