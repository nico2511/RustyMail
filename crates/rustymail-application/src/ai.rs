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

/// Conditions minimales pour autoriser un appel modules `ai_*` : **OpenRouter** et/ou **llama-server** (HTTP).
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
) -> Result<(), &'static str> {
    let openrouter_ok =
        openrouter_enabled && openrouter_key_present && openrouter_model_nonempty;
    let llama_spawn_ready = llama_server_spawn_enabled
        && llama_server_binary_nonempty
        && llama_server_gguf_cached;
    let llama_ok = llama_server_enabled
        && llama_server_url_nonempty
        && llama_server_gpu_ok
        && (llama_server_model_nonempty || llama_spawn_ready);
    if openrouter_ok || llama_ok {
        return Ok(());
    }
    if openrouter_enabled && !openrouter_key_present {
        return Err("OpenRouter activé : enregistrez une clé API (trousseau OS) dans Paramètres → IA → OpenRouter.");
    }
    if openrouter_enabled && !openrouter_model_nonempty {
        return Err("OpenRouter activé : renseignez un identifiant de modèle.");
    }
    if llama_server_enabled && !llama_server_url_nonempty {
        return Err("llama-server activé : renseignez une URL de base (ex. http://127.0.0.1:8080/v1).");
    }
    if llama_server_enabled && !llama_server_model_nonempty && !llama_spawn_ready {
        return Err(
            "llama-server activé : renseignez le nom de modèle, ou activez « Lancer llama-server » avec binaire + GGUF en cache.",
        );
    }
    if llama_server_enabled && llama_server_spawn_enabled && !llama_server_binary_nonempty {
        return Err(
            "Lancement llama-server : indiquez la commande (ex. llama-server sur le PATH) ou le chemin complet vers l’exécutable (Paramètres → IA → Sur mon PC & cloud).",
        );
    }
    if llama_server_enabled && llama_server_spawn_enabled && llama_server_binary_nonempty && !llama_server_gguf_cached
    {
        return Err(
            "Lancement llama-server : aucun GGUF trouvé dans le cache RustyMail — téléchargez ou vérifiez dépôt / fichier.",
        );
    }
    if llama_server_enabled && llama_server_url_nonempty && (llama_server_model_nonempty || llama_spawn_ready) && !llama_server_gpu_ok {
        return Err(
            "llama-server : profil matériel insuffisant ou accélérateur non détecté — activez l’override CPU avancé si vous savez ce que vous faites.",
        );
    }
    Err("Aucun moteur IA disponible : activez OpenRouter (clé + modèle) ou llama-server (URL + modèle + GPU, ou lancement auto).")
}
