//! Types partagés pour les capacités LLM (UI + infra).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LlmFeature {
    Translation,
    Summary,
    Rewrite,
    Grammar,
    QuickReply,
    QaThread,
    SearchNl,
    InboxDigest,
    SecurityIntent,
}

impl LlmFeature {
    pub fn as_str(&self) -> &'static str {
        match self {
            LlmFeature::Translation => "translation",
            LlmFeature::Summary => "summary",
            LlmFeature::Rewrite => "rewrite",
            LlmFeature::Grammar => "grammar",
            LlmFeature::QuickReply => "quickReply",
            LlmFeature::QaThread => "qaThread",
            LlmFeature::SearchNl => "searchNl",
            LlmFeature::InboxDigest => "inboxDigest",
            LlmFeature::SecurityIntent => "securityIntent",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "translation" => Some(Self::Translation),
            "summary" => Some(Self::Summary),
            "rewrite" => Some(Self::Rewrite),
            "grammar" => Some(Self::Grammar),
            "quickreply" => Some(Self::QuickReply),
            "qathread" => Some(Self::QaThread),
            "searchnl" => Some(Self::SearchNl),
            "inboxdigest" => Some(Self::InboxDigest),
            "securityintent" => Some(Self::SecurityIntent),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LlmFeaturesState {
    pub translation: bool,
    pub summary: bool,
    pub rewrite: bool,
    pub grammar: bool,
    pub quick_reply: bool,
    pub qa_thread: bool,
    pub search_nl: bool,
    pub inbox_digest: bool,
    pub security_intent: bool,
}
