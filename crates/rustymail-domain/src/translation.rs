use serde::{Deserialize, Serialize};

use crate::ai_budget::TokenBudgetReport;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResult {
    pub source_message_id: String,
    pub source_lang: String,
    pub target_lang: String,
    pub translated_text: String,
    pub preserved_entity_ids: Vec<String>,
    #[serde(default)]
    pub budget: TokenBudgetReport,
}
