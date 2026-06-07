//! Moteur d’inférence : client HTTP chat/completions (OpenRouter, llama-server, …) ou stub sans `reqwest`.

#[cfg(feature = "http")]
mod http_chat;
#[cfg(not(feature = "http"))]
mod stub;

use crate::{LlmError, LlmGenParams};
use serde::de::DeserializeOwned;
use std::fmt::Display;
use std::ops::ControlFlow;

/// Routage HTTP unique (plusieurs backends via [`HttpChatEngine`](http_chat::HttpChatEngine)).
pub enum LlmEngine {
    #[cfg(feature = "http")]
    Http(http_chat::HttpChatEngine),
    #[cfg(not(feature = "http"))]
    Stub(stub::StubLlmEngine),
}

#[cfg(not(feature = "http"))]
impl Default for LlmEngine {
    fn default() -> Self {
        LlmEngine::Stub(Default::default())
    }
}

impl LlmEngine {
    #[cfg(feature = "http")]
    pub fn open_router(api_key: String, base_url: String, model: String) -> Result<Self, LlmError> {
        Ok(LlmEngine::Http(http_chat::HttpChatEngine::new_open_router(
            api_key, base_url, model,
        )?))
    }

    /// llama-server et serveurs compatibles OpenAI (`/v1/chat/completions`). Clé Bearer optionnelle.
    #[cfg(feature = "http")]
    pub fn open_ai_compatible(
        base_url: String,
        model: String,
        api_key: String,
    ) -> Result<Self, LlmError> {
        Ok(LlmEngine::Http(
            http_chat::HttpChatEngine::new_open_ai_compatible(base_url, model, api_key)?,
        ))
    }

    #[cfg(not(feature = "http"))]
    pub fn open_router(
        _api_key: String,
        _base_url: String,
        _model: String,
    ) -> Result<Self, LlmError> {
        Err(LlmError::NotAvailable)
    }

    #[cfg(not(feature = "http"))]
    pub fn open_ai_compatible(
        _base_url: String,
        _model: String,
        _api_key: String,
    ) -> Result<Self, LlmError> {
        Err(LlmError::NotAvailable)
    }

    pub fn generate(
        &mut self,
        system: &str,
        user: &str,
        p: &LlmGenParams,
    ) -> Result<String, LlmError> {
        self.generate_with_schema(system, user, p, "")
    }

    /// Comme [`generate`](Self::generate) avec grammaire GBNF optionnelle (llama-server).
    pub fn generate_with_schema(
        &mut self,
        system: &str,
        user: &str,
        p: &LlmGenParams,
        schema_gbnf: &str,
    ) -> Result<String, LlmError> {
        match self {
            #[cfg(feature = "http")]
            LlmEngine::Http(e) => e.generate(system, user, p, schema_gbnf),
            #[cfg(not(feature = "http"))]
            LlmEngine::Stub(e) => e.generate(system, user, p),
        }
    }

    pub fn generate_json<T: DeserializeOwned>(
        &mut self,
        system: &str,
        user: &str,
        schema_gbnf: &str,
        p: &LlmGenParams,
    ) -> Result<T, LlmError> {
        match self {
            #[cfg(feature = "http")]
            LlmEngine::Http(e) => e.generate_json(system, user, schema_gbnf, p),
            #[cfg(not(feature = "http"))]
            LlmEngine::Stub(e) => e.generate_json(system, user, schema_gbnf, p),
        }
    }

    pub fn generate_streaming<E: Display>(
        &mut self,
        system: &str,
        user: &str,
        p: &LlmGenParams,
        on_chunk: impl FnMut(&str) -> ControlFlow<Result<(), E>>,
    ) -> Result<String, LlmError> {
        self.generate_streaming_with_schema(system, user, p, "", on_chunk)
    }

    /// Comme [`generate_streaming`](Self::generate_streaming) avec grammaire GBNF optionnelle (llama-server).
    pub fn generate_streaming_with_schema<E: Display>(
        &mut self,
        system: &str,
        user: &str,
        p: &LlmGenParams,
        schema_gbnf: &str,
        on_chunk: impl FnMut(&str) -> ControlFlow<Result<(), E>>,
    ) -> Result<String, LlmError> {
        match self {
            #[cfg(feature = "http")]
            LlmEngine::Http(e) => e.generate_streaming(system, user, p, schema_gbnf, on_chunk),
            #[cfg(not(feature = "http"))]
            LlmEngine::Stub(e) => e.generate_streaming(system, user, p, schema_gbnf, on_chunk),
        }
    }

    pub fn token_count(&self, s: &str) -> usize {
        match self {
            #[cfg(feature = "http")]
            LlmEngine::Http(e) => e.token_count(s),
            #[cfg(not(feature = "http"))]
            LlmEngine::Stub(e) => e.token_count(s),
        }
    }

    pub fn n_ctx(&self) -> u32 {
        match self {
            #[cfg(feature = "http")]
            LlmEngine::Http(e) => e.n_ctx(),
            #[cfg(not(feature = "http"))]
            LlmEngine::Stub(e) => e.n_ctx(),
        }
    }

    /// Met en cache le `n_ctx` serveur (sonde boot llama-server).
    #[cfg(feature = "http")]
    pub fn set_n_ctx_probe(&mut self, n_ctx: u32) {
        let LlmEngine::Http(e) = self;
        e.set_n_ctx_probe(n_ctx);
    }
}
