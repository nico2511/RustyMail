//! Activité utilisateur locale (télémétrie produit, 100 % on-device).

use serde::{Deserialize, Serialize};

use crate::SearchQuery;

/// Types d'événements enregistrés (whitelist côté infra).
pub const EVENT_THREAD_OPENED: &str = "thread_opened";
pub const EVENT_THREAD_CLOSED: &str = "thread_closed";
pub const EVENT_MESSAGE_SENT: &str = "message_sent";
pub const EVENT_SEARCH_COMMITTED: &str = "search_committed";
pub const EVENT_SAVED_VIEW_CREATED: &str = "saved_view_created";
pub const EVENT_SAVED_VIEW_APPLIED: &str = "saved_view_applied";
pub const EVENT_SAVED_VIEW_SEEN: &str = "saved_view_seen";
pub const EVENT_BULK_MARK_READ: &str = "bulk_mark_read";
pub const EVENT_BULK_ARCHIVE: &str = "bulk_archive";
pub const EVENT_AFFINER_APPLIED: &str = "affiner_applied";
pub const EVENT_CONTACT_OPENED: &str = "contact_opened";
pub const EVENT_SUGGESTION_SHOWN: &str = "suggestion_shown";
pub const EVENT_SUGGESTION_CLICKED: &str = "suggestion_clicked";

pub const CARD_KIND_SAVED_VIEW: &str = "saved_view";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEventInput {
    pub event_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mailbox: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta_json: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SuggestionDecision {
    Dismiss,
    Snooze,
    Accepted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedSavedView {
    pub sender_email: String,
    pub display_name: String,
    pub score: i32,
    pub rationale_fr: String,
    pub suggested_name: String,
    pub query: SearchQuery,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityCardPolicy {
    pub min_score: i32,
    pub min_opens_30d: i32,
    pub min_replies_30d: i32,
    pub max_suggestions: usize,
    pub snooze_days: i64,
    pub weight_opens: i32,
    pub weight_replies: i32,
    pub weight_dwell_minutes: i32,
    pub weight_favorite: i32,
}

impl Default for ActivityCardPolicy {
    fn default() -> Self {
        Self {
            min_score: 8,
            min_opens_30d: 3,
            min_replies_30d: 0,
            max_suggestions: 3,
            snooze_days: 7,
            weight_opens: 2,
            weight_replies: 5,
            weight_dwell_minutes: 1,
            weight_favorite: 3,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityCardCalibrationStats {
    pub suggestions_shown: u32,
    pub suggestions_clicked: u32,
    pub suggestions_accepted: u32,
    pub suggestions_dismissed: u32,
    pub suggestions_snoozed: u32,
}
