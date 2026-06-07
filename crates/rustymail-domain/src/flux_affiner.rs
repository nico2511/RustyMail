//! Phase 4 — suggestion LLM d’un dossier IMAP pour un flux (vue / recherche).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FluxAffinerSample {
    pub subject: String,
    pub sender: String,
    pub mailbox: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FluxAffinerResult {
    pub folder_title: String,
    pub confidence: f32,
    pub rationale: String,
}
