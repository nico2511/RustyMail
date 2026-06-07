//! Organiser V2 — file d’actions avec mémoire des décisions.

use serde::{Deserialize, Serialize};

use crate::organization::{OrgMailboxStructure, OrgProposal, OrgScanStats};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgV2ScanReport {
    pub proposals: Vec<OrgProposal>,
    pub stats: OrgScanStats,
    pub mailbox_structure: OrgMailboxStructure,
    pub memory: OrgV2MemorySummary,
    /// Périmètre actuel du scan V2 (documenté côté UI).
    pub focus_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgV2RecordDecisionResult {
    pub ok: bool,
    pub fingerprint: String,
}
