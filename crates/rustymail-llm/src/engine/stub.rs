//! Moteur d’inférence — stub hors feature `http` (`reqwest`).

use crate::{hardware::Accelerator, LlmError, LlmGenParams};
use serde::de::DeserializeOwned;
use std::fmt::Display;
use std::ops::ControlFlow;
use std::path::Path;

pub struct StubLlmEngine;

impl Default for StubLlmEngine {
    fn default() -> Self {
        Self
    }
}

impl StubLlmEngine {
    pub fn load(_gguf_path: &Path, _ctx_size: u32, _accel: Accelerator) -> Result<Self, LlmError> {
        Err(LlmError::NotAvailable)
    }

    pub fn generate(
        &mut self,
        _system: &str,
        _user: &str,
        _p: &LlmGenParams,
    ) -> Result<String, LlmError> {
        Err(LlmError::NotAvailable)
    }

    pub fn generate_json<T: DeserializeOwned>(
        &mut self,
        _system: &str,
        _user: &str,
        _schema_gbnf: &str,
        _p: &LlmGenParams,
    ) -> Result<T, LlmError> {
        Err(LlmError::NotAvailable)
    }

    pub fn generate_streaming<E: Display>(
        &mut self,
        _system: &str,
        _user: &str,
        _p: &LlmGenParams,
        _schema_gbnf: &str,
        _on_chunk: impl FnMut(&str) -> ControlFlow<Result<(), E>>,
    ) -> Result<String, LlmError> {
        Err(LlmError::NotAvailable)
    }

    pub fn token_count(&self, s: &str) -> usize {
        crate::rough_token_estimate(s)
    }

    pub fn n_ctx(&self) -> u32 {
        0
    }
}
