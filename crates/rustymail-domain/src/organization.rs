//! Centre d'organisation : propositions de triage et consolidation.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OrgProposalKind {
    UnreadOutsideInbox,
    StaleInboxRead,
    UnsubscribeNewsletter,
    /// List-Unsubscribe + signal transactionnel (factures, commandes, alertes…).
    UnsubscribeTransactional,
    NewsletterRuleUnfiled,
    /// Expéditeur transactionnel (hors corbeille) — distinct des règles newsletter / ESP.
    TransactionalNotification,
    BulkTrashCandidate,
    CustomKeywordCluster,
    DuplicateThreadCrossMailbox,
    OrphanThreadRepair,
    StaleTags,
    SemanticTagRefresh,
    EmptyMailbox,
    FlatMailboxTree,
    LlmCluster,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OrgSuggestedAction {
    Move,
    Archive,
    Trash,
    MarkRead,
    Retag,
    RepairThreading,
    DeleteMailbox,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OrgProposalSource {
    Heuristic,
    Llm,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgThreadRef {
    pub thread_id: String,
    pub mailbox: String,
    pub subject: String,
    /// Expéditeur affiché (liste inbox).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_activity: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unread: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_email: Option<String>,
    /// URLs de désinscription indexées pour ce fil (si présentes dans `messages.unsubscribe_urls`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub unsubscribe_links: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgProposal {
    pub id: String,
    pub kind: OrgProposalKind,
    pub section: String,
    pub title: String,
    pub rationale: String,
    pub thread_refs: Vec<OrgThreadRef>,
    pub thread_ids: Vec<String>,
    pub suggested_action: OrgSuggestedAction,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_mailbox: Option<String>,
    pub confidence: f32,
    pub source: OrgProposalSource,
    pub total_count: usize,
    /// `false` = conseil affiché sans bouton d’application (ex. arbre de dossiers plat).
    #[serde(default = "default_true")]
    pub applicable: bool,
    /// Mots-clés de repli pour cartes LLM (recherche locale si `threadIds` vides).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub llm_search_keywords: Vec<String>,
    /// Identifiant de règle heuristique (ex. `stale-inbox-read`, `keyword-0`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explain_rule_id: Option<String>,
    /// Signaux courts affichés dans l’UI (dossier, âge, mots-clés…).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub explain_signals: Vec<String>,
    /// Liens « se désinscrire » détectés (HTML `href`), pour cartes marketing.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub unsubscribe_links: Vec<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgScanStats {
    pub thread_count: usize,
    pub mailbox_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgMailboxEntry {
    pub mailbox: String,
    pub thread_count: usize,
    pub message_count: usize,
    pub depth: u32,
    pub is_system: bool,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgMailboxStructure {
    pub total_folders: usize,
    pub folders_with_messages: usize,
    pub root_personal_count: usize,
    pub max_depth: u32,
    pub summary_lines: Vec<String>,
    pub entries: Vec<OrgMailboxEntry>,
}

/// Résultat de l’analyse IA optionnelle lors du scan Organiser.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgScanLlmStatus {
    #[serde(default)]
    pub requested: bool,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub succeeded: bool,
    #[serde(default)]
    pub proposal_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgScanReport {
    pub proposals: Vec<OrgProposal>,
    pub stats: OrgScanStats,
    pub mailbox_structure: OrgMailboxStructure,
    #[serde(default)]
    pub llm_status: OrgScanLlmStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgApplyProgress {
    pub done: usize,
    pub total: usize,
    pub message: String,
    #[serde(default)]
    pub errors: Vec<String>,
    #[serde(default)]
    pub mailboxes_to_sync: Vec<String>,
    /// Fils déplacés ou modifiés — retag ciblé après sync IMAP.
    #[serde(default)]
    pub threads_affected: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgKeywordRule {
    pub label: String,
    pub keywords: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_mailbox: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ArchiveLayout {
    Flat,
    Hierarchical,
}

impl Default for ArchiveLayout {
    fn default() -> Self {
        Self::Hierarchical
    }
}
