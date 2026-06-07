use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TokenBudgetReport {
    pub n_ctx: u32,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub truncated: bool,
    pub strategy: String,
    pub items_in: u32,
    pub items_used: u32,
}

impl TokenBudgetReport {
    pub fn empty_stub() -> Self {
        Self {
            n_ctx: 0,
            input_tokens: 0,
            output_tokens: 0,
            truncated: false,
            strategy: "none".into(),
            items_in: 0,
            items_used: 0,
        }
    }
}
