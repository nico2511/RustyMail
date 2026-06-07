//! Inférence LLM via **HTTP** (`/v1/chat/completions`) : OpenRouter, llama-server, etc.
//! Recommandations de poids GGUF selon la RAM : [`hardware`].

mod engine;
mod error;
mod privacy;
pub mod hardware;

pub use engine::LlmEngine;
pub use error::LlmError;
pub use privacy::{redact_pii_for_exfiltration, redact_user_content_if_needed};
pub use hardware::{
    llama_server_gpu_gate_ok, Accelerator, HardwareModelProfile, HardwareModelTier,
};

/// Conservé pour compatibilité : plus de liaison `llama.cpp` dans le binaire — toujours `false`.
pub const LOCAL_LLM_NATIVE_BUILD: bool = false;

/// Conservé pour compatibilité : plus de backend GGML lié dans l’app — toujours `false`.
pub const LOCAL_LLM_GPU_BACKEND_LINKED: bool = false;

/// Plus de sonde llama.cpp — toujours `false`.
#[inline]
pub fn llama_gpu_offload_supported_runtime() -> bool {
    false
}

use serde::{Deserialize, Serialize};

/// Ancienne synchronisation in-process GGUF — **no-op** (llama-server est externe).
pub fn sync_active_llm_from_prefs(
    _gguf_path: std::path::PathBuf,
    _ctx_size: u32,
    _accel: hardware::Accelerator,
    _gpu_preferred: bool,
) {
}

/// Paramètres de génération alignés sur le plan RustyMail.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmGenParams {
    pub max_tokens: u32,
    pub temperature: f32,
    pub top_p: f32,
    pub stop: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grammar_gbnf: Option<String>,
}

impl Default for LlmGenParams {
    fn default() -> Self {
        Self {
            max_tokens: 512,
            temperature: 0.2,
            top_p: 0.9,
            stop: Vec::new(),
            grammar_gbnf: None,
        }
    }
}

/// Fusionne grammaire GBNF dans des paramètres de génération (priorité au champ déjà présent).
pub fn gen_params_with_grammar(mut p: LlmGenParams, schema_gbnf: &str) -> LlmGenParams {
    if p.grammar_gbnf.is_none() {
        let t = schema_gbnf.trim();
        if !t.is_empty() {
            p.grammar_gbnf = Some(t.to_string());
        }
    }
    p
}

/// Estimation grossière de tokens (pas de tokenizer) : mélange longueur Unicode et octets UTF-8.
#[inline]
pub fn rough_token_estimate(s: &str) -> usize {
    let c = s.chars().count();
    let b = s.len();
    ((c * 5).saturating_add(b).saturating_add(7) / 8).max(1)
}
