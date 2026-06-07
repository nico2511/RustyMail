use serde::{Deserialize, Serialize};

use crate::ai_budget::TokenBudgetReport;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum RewriteStyle {
    Neutral,
    Formal,
    Casual,
    Concise,
    Polite,
    Assertive,
    Apologetic,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RewriteResult {
    pub text: String,
    pub style: RewriteStyle,
    #[serde(default)]
    pub budget: TokenBudgetReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuickReplySuggestion {
    pub text: String,
    pub tone: String,
    /// Courte justification (1 phrase) — optionnel pour rétrocompatibilité JSON.
    #[serde(default)]
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuickRepliesResult {
    pub suggestions: Vec<QuickReplySuggestion>,
    #[serde(default)]
    pub budget: TokenBudgetReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GrammarSuggestion {
    #[serde(default)]
    pub offset: u32,
    #[serde(default)]
    pub length: u32,
    pub original: String,
    pub replacement: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GrammarResult {
    pub suggestions: Vec<GrammarSuggestion>,
    #[serde(default)]
    pub budget: TokenBudgetReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadQaAnswer {
    pub answer: String,
    pub evidence_message_ids: Vec<String>,
    #[serde(default)]
    pub budget: TokenBudgetReport,
}
