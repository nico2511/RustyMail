//! Organiser V2 — file d’actions avec mémoire des décisions.

use serde::{Deserialize, Serialize};

use crate::organization::{OrgMailboxStructure, OrgProposal, OrgScanLlmStatus, OrgScanStats};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OrgV2DecisionKind {
    Applied,
    Dismissed,
    Snoozed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgV2MemorySummary {
    /// Propositions masquées par la mémoire (déjà traitées / ignorées / en pause).
    pub suppressed_count: usize,
    /// Dossiers exclus manuellement des analyses « à ranger ».
    #[serde(default)]
    pub ignored_mailboxes: Vec<String>,
}

/// Orientation LLM : diagnostic + recommandations. Les actions proposées sont les `proposals` du rapport.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgOrientation {
    pub diagnosis: String,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgV2ScanReport {
    pub proposals: Vec<OrgProposal>,
    pub stats: OrgScanStats,
    pub mailbox_structure: OrgMailboxStructure,
    pub memory: OrgV2MemorySummary,
    /// Périmètre actuel du scan V2 (documenté côté UI).
    pub focus_note: String,
    /// Présente seulement après une réponse LLM validée. Absente = pas d’orientation affichable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orientation: Option<OrgOrientation>,
    #[serde(default)]
    pub llm_status: OrgScanLlmStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgV2RecordDecisionResult {
    pub ok: bool,
    pub fingerprint: String,
}
