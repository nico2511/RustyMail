//! Contrat v1 — assistance multi-étapes sur fil de discussion.

use serde::{Deserialize, Serialize};

pub const ASSIST_SCHEMA_VERSION: u32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum AssistMode {
    Quick,
    #[default]
    Deep,
    StrictSafe,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssistSkill {
    AnalyzeIntent,
    ExtractFacts,
    ActionItems,
    RiskFlagger,
    DraftReply,
    ToneAdapter,
    ConsistencyCheck,
    SlotSuggestion,
}

impl AssistSkill {
    pub fn id(self) -> &'static str {
        match self {
            Self::AnalyzeIntent => "analyze_intent",
            Self::ExtractFacts => "extract_facts",
            Self::ActionItems => "action_items",
            Self::RiskFlagger => "risk_flagger",
            Self::DraftReply => "draft_reply",
            Self::ToneAdapter => "tone_adapter",
            Self::ConsistencyCheck => "consistency_check",
            Self::SlotSuggestion => "slot_suggestion",
        }
    }

    /// Routing modèle : léger (tri/extraction) vs lourd (rédaction).
    pub fn llm_tier(self) -> AssistLlmTier {
        match self {
            Self::AnalyzeIntent
            | Self::ExtractFacts
            | Self::ActionItems
            | Self::RiskFlagger
            | Self::ConsistencyCheck
            | Self::SlotSuggestion => AssistLlmTier::Light,
            Self::DraftReply | Self::ToneAdapter => AssistLlmTier::Heavy,
        }
    }

    /// Skill optionnel : échec n’interrompt pas le pipeline principal.
    pub fn fallback_on_error(self) -> bool {
        match self {
            Self::AnalyzeIntent | Self::ExtractFacts | Self::DraftReply => false,
            Self::ActionItems
            | Self::RiskFlagger
            | Self::ToneAdapter
            | Self::ConsistencyCheck
            | Self::SlotSuggestion => true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssistLlmTier {
    Light,
    Heavy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistFact {
    pub kind: String,
    pub text: String,
    #[serde(default)]
    pub message_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistFactsSnapshot {
    pub facts: Vec<AssistFact>,
    #[serde(default)]
    pub ambiguities: Vec<String>,
    pub confidence: f32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistUserPrefs {
    #[serde(default = "default_assist_lang")]
    pub lang: String,
    #[serde(default = "default_assist_tone")]
    pub tone: String,
    #[serde(default = "default_assist_timezone")]
    pub timezone: String,
}

fn default_assist_lang() -> String {
    "fr".into()
}
fn default_assist_tone() -> String {
    "neutre".into()
}
fn default_assist_timezone() -> String {
    "Europe/Paris".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistRequest {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub thread_id: String,
    pub account_id: String,
    #[serde(default)]
    pub user_prefs: AssistUserPrefs,
    #[serde(default)]
    pub assist_mode: AssistMode,
    /// Vide = défaut selon `assist_mode`.
    #[serde(default)]
    pub enabled_skills: Vec<AssistSkill>,
}

fn default_schema_version() -> u32 {
    ASSIST_SCHEMA_VERSION
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssistPhase {
    AnalyzeIntent,
    ExtractFacts,
    ActionItems,
    RiskFlag,
    DraftReply,
    ToneAdapt,
    ConsistencyCheck,
    SuggestSlots,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistIntentSnapshot {
    pub intent: String,
    pub tone_hint: String,
    pub needs_scheduling: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistRecommendation {
    pub kind: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistPlannedStep {
    pub skill: AssistSkill,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistRoutingPlan {
    pub assist_mode: AssistMode,
    pub steps: Vec<AssistPlannedStep>,
    pub offer_slot_step: bool,
    /// Le pipeline recommande une clarification avant brouillon.
    #[serde(default)]
    pub needs_clarification: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistRunStep {
    pub skill: String,
    pub status: String,
    pub latency_ms: u64,
    #[serde(default)]
    pub input_tokens: u32,
    #[serde(default)]
    pub output_tokens: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssistResult {
    pub schema_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intent_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub draft_response: Option<String>,
    #[serde(default)]
    pub recommendations: Vec<AssistRecommendation>,
    #[serde(default)]
    pub clarification_questions: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    #[serde(default)]
    pub safety_flags: Vec<String>,
    #[serde(default)]
    pub executed_skills: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intent: Option<AssistIntentSnapshot>,
    #[serde(default)]
    pub slots: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub facts: Option<AssistFactsSnapshot>,
    #[serde(default)]
    pub consistency_issues: Vec<String>,
    /// Vrai si le brouillon a été bloqué (clarification requise).
    #[serde(default)]
    pub needs_clarification: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<AssistRoutingPlan>,
    #[serde(default)]
    pub run_steps: Vec<AssistRunStep>,
}

impl AssistResult {
    pub fn empty_v1() -> Self {
        Self {
            schema_version: ASSIST_SCHEMA_VERSION,
            intent_summary: None,
            draft_response: None,
            recommendations: Vec::new(),
            clarification_questions: Vec::new(),
            confidence: None,
            safety_flags: Vec::new(),
            executed_skills: Vec::new(),
            intent: None,
            slots: Vec::new(),
            facts: None,
            consistency_issues: Vec::new(),
            needs_clarification: false,
            plan: None,
            run_steps: Vec::new(),
        }
    }
}

/// Seuil de confiance en dessous duquel on privilégie la clarification (mode deep).
pub fn assist_clarification_threshold(mode: AssistMode) -> f32 {
    match mode {
        AssistMode::Quick => 0.0,
        AssistMode::Deep => 0.65,
        AssistMode::StrictSafe => 0.78,
    }
}
