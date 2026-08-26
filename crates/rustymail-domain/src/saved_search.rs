//! Vues de recherche enregistrées (critères persistés + état UI).

use serde::{Deserialize, Serialize};

use crate::SearchQuery;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchUiState {
    pub list_filter: Option<String>,
    pub search_scope: Option<String>,
    pub search_nl_mode: Option<String>,
    /// Texte brut barre de recherche (réaffichage).
    pub search_draft: Option<String>,
    pub newsletter_domain: Option<String>,
    pub newsletter_local_part: Option<String>,
    #[serde(default)]
    pub search_modifiers_touched: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearch {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub query: SearchQuery,
    #[serde(default)]
    pub ui_state: SavedSearchUiState,
    pub pinned: bool,
    pub sort_order: i32,
    /// Glyph / clé d’icône courte (ex. « Vu », « 📥 », « arc »).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Raccourci clavier (`KeyboardEvent.code`, ex. `Digit1`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shortcut: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_seen_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchListItem {
    #[serde(flatten)]
    pub search: SavedSearch,
    /// Fils correspondant à la vue depuis `last_seen_at` (surveillance).
    #[serde(default)]
    pub new_count: usize,
    /// Fils non lus correspondant à la vue.
    #[serde(default)]
    pub unread_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchUpsert {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub account_id: String,
    pub name: String,
    pub query: SearchQuery,
    #[serde(default)]
    pub ui_state: SavedSearchUiState,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort_order: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shortcut: Option<String>,
}

/// Entrée d’historique de recherche (suggestions).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHistoryEntry {
    pub id: i64,
    pub account_id: String,
    pub query_text: String,
    pub query_json: String,
    pub used_at: String,
}
