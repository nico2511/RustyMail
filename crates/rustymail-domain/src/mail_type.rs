//! Classification déterministe du type de mail (sans LLM).

use serde::{Deserialize, Serialize};

/// Type de message dérivé des heuristiques locales.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MailType {
    Conversation,
    Newsletter,
    Transactional,
    Notification,
}

impl MailType {
    pub fn as_kind_tag_value(self) -> &'static str {
        match self {
            Self::Conversation => "discussion",
            Self::Newsletter => "newsletter",
            Self::Transactional => "transactional",
            Self::Notification => "notification",
        }
    }

    pub fn from_kind_tag_value(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "discussion" | "conversation" => Some(Self::Conversation),
            "newsletter" | "marketing" => Some(Self::Newsletter),
            "transactional" | "facture" | "commande" | "livraison" | "finance" => {
                Some(Self::Transactional)
            }
            "notification" | "alerte" | "securite" => Some(Self::Notification),
            _ => None,
        }
    }
}

/// Score de priorité local d’un fil (0–100).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadPriorityScore {
    pub score: f32,
    pub unread_boost: f32,
    pub followed_boost: f32,
    pub sender_engagement: f32,
    pub semantic_boost: f32,
}

impl ThreadPriorityScore {
    pub fn total(self) -> f32 {
        self.score.clamp(0.0, 100.0)
    }

    pub fn compose(
        unread: bool,
        followed: bool,
        sender_engagement_0_100: f32,
        semantic_similarity_0_1: f32,
    ) -> Self {
        let unread_boost = if unread { 25.0 } else { 0.0 };
        let followed_boost = if followed { 30.0 } else { 0.0 };
        let sender_engagement = sender_engagement_0_100.clamp(0.0, 100.0) * 0.25;
        let semantic_boost = semantic_similarity_0_1.clamp(0.0, 1.0) * 20.0;
        let score =
            (unread_boost + followed_boost + sender_engagement + semantic_boost).clamp(0.0, 100.0);
        Self {
            score,
            unread_boost,
            followed_boost,
            sender_engagement,
            semantic_boost,
        }
    }
}
