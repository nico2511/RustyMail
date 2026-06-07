use serde::{Deserialize, Serialize};

use crate::ai_budget::TokenBudgetReport;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum MailSecurityFindingKind {
    #[default]
    Heuristic,
    LlmIntent,
}

/// Niveau global affiché à l’utilisateur (aide à la vigilance, pas verdict juridique).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MailSecuritySeverity {
    Ok,
    Attention,
    Suspicion,
}

/// Sévérité d’un signalement individuel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MailSecurityFindingSeverity {
    Info,
    Attention,
    Suspicion,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailSecurityFinding {
    #[serde(default)]
    pub kind: MailSecurityFindingKind,
    pub code: String,
    pub severity: MailSecurityFindingSeverity,
    /// Texte court pour l’UI (français).
    pub message_fr: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailSecuritySignals {
    pub severity: MailSecuritySeverity,
    pub summary_fr: String,
    pub findings: Vec<MailSecurityFinding>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub llm_budget: Option<TokenBudgetReport>,
}

impl MailSecuritySignals {
    pub fn empty_ok() -> Self {
        Self {
            severity: MailSecuritySeverity::Ok,
            summary_fr: "Rien d’inhabituel détecté selon les règles locales.".to_string(),
            findings: Vec::new(),
            llm_budget: None,
        }
    }
}
