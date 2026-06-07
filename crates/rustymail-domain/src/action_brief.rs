//! Brief d'action boîte : sortie structurée (décisions, actions, risques) pour l'UI et l'IPC.

use serde::{Deserialize, Serialize};

use crate::ai_budget::TokenBudgetReport;

/// Mode de génération (Quick = léger, Decision = défaut, Deep = plus de contexte).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionBriefMode {
    Quick,
    #[default]
    Decision,
    Deep,
}

/// Seau de priorité global du brief.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum ActionBriefPriorityBucket {
    Critical,
    Important,
    #[default]
    Routine,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActionBriefEvidenceLink {
    pub thread_id: String,
    #[serde(default)]
    pub message_ids: Vec<String>,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActionBriefChange {
    pub id: String,
    pub summary: String,
    #[serde(default)]
    pub since_last_brief: bool,
    #[serde(default)]
    pub evidence_links: Vec<ActionBriefEvidenceLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActionBriefDecision {
    pub rank: u32,
    pub title: String,
    #[serde(default)]
    pub impact: String,
    #[serde(default)]
    pub options_hint: Vec<String>,
    #[serde(default)]
    pub evidence_links: Vec<ActionBriefEvidenceLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActionBriefRecommendedAction {
    pub rank: u32,
    pub action: String,
    #[serde(default)]
    pub suggested_owner: String,
    #[serde(default)]
    pub suggested_due: Option<String>,
    #[serde(default)]
    pub priority: String,
    #[serde(default)]
    pub evidence_links: Vec<ActionBriefEvidenceLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActionBriefRisk {
    pub label: String,
    #[serde(default)]
    pub severity: String,
    #[serde(default)]
    pub detail: String,
    #[serde(default)]
    pub evidence_links: Vec<ActionBriefEvidenceLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActionBriefAmbiguity {
    pub question: String,
    #[serde(default)]
    pub why_it_matters: String,
    #[serde(default)]
    pub evidence_links: Vec<ActionBriefEvidenceLink>,
}

/// Résultat complet renvoyé au frontend (Tauri `invoke`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActionBriefResult {
    pub account_id: String,
    pub mailbox: String,
    pub mode: ActionBriefMode,
    #[serde(default)]
    pub changes: Vec<ActionBriefChange>,
    #[serde(default)]
    pub decisions: Vec<ActionBriefDecision>,
    #[serde(default)]
    pub recommended_actions: Vec<ActionBriefRecommendedAction>,
    #[serde(default)]
    pub risks: Vec<ActionBriefRisk>,
    #[serde(default)]
    pub ambiguities: Vec<ActionBriefAmbiguity>,
    #[serde(default)]
    pub evidence_links: Vec<ActionBriefEvidenceLink>,
    /// 0.0–1.0 — confiance agrégée du modèle (post-vérification partielle côté Rust).
    #[serde(default)]
    pub confidence: f64,
    pub priority_bucket: ActionBriefPriorityBucket,
    #[serde(default)]
    pub verification_recommended: bool,
    #[serde(default)]
    pub executed_skills: Vec<String>,
    #[serde(default)]
    pub budget: TokenBudgetReport,
}
