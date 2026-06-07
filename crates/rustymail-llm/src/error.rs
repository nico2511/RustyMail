use thiserror::Error;

#[derive(Debug, Error)]
pub enum LlmError {
    #[error("LLM HTTP indisponible : activez la feature `http` sur rustymail-llm ou configurez OpenRouter / llama-server.")]
    NotAvailable,

    #[error("erreur générique LLM : {0}")]
    Msg(String),

    #[error("entrée trop grande pour le contexte ({tokens} tokens, n_ctx={n_ctx})")]
    InputTooLarge { tokens: usize, n_ctx: u32 },

    #[error("mémoire insuffisante pour charger le modèle")]
    OutOfMemory,

    #[error("schéma / JSON invalide : {0}")]
    InvalidJson(String),
}
