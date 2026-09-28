//! Préférences applicatives (JSON à côté de la base SQLite) — langue mère, dictée, compagnon local.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use unicode_normalization::UnicodeNormalization;

use crate::imap::ops::mailbox_logical_path_key;

pub const LOCK_DELETE_MSG: &str = "Dossier verrouillé — déverrouillez-le pour supprimer.";
pub const LOCK_DELETE_CHILD_MSG: &str =
    "Un sous-dossier est verrouillé — déverrouillez-le avant de supprimer ce dossier.";
pub const LOCK_ARCHIVE_MSG: &str = "Dossier verrouillé — déverrouillez-le pour archiver.";
pub const LOCK_RENAME_MSG: &str =
    "Dossier verrouillé — déverrouillez-le pour le renommer ou le déplacer.";
pub const LOCK_RENAME_PARENT_MSG: &str =
    "Dossier couvert par un loquet parent — déverrouillez le parent pour le renommer ou le déplacer.";
pub const LOCK_PREFS_UNREADABLE: &str =
    "Préférences illisibles — opération annulée pour ne pas ignorer un cadenas.";
pub const LOCK_PREFS_INVALID: &str =
    "Préférences invalides — opération annulée pour ne pas ignorer un cadenas.";

pub use rustymail_domain::{AutoArchiveRule, OrgKeywordRule};

pub const APP_PREFS_FILE: &str = "app_prefs.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPrefs {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub general: GeneralPrefs,
    #[serde(default)]
    pub ai: AiPrefs,
}

fn default_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralPrefs {
    #[serde(default = "default_mother_language")]
    pub mother_language: String,
    /// Carnet `@` : recherche unifiée sur tous les comptes (dédup par e-mail).
    #[serde(default)]
    pub address_book_global_scope: bool,
    /// Filtre liste boîte au démarrage / changement de dossier : `all`, `unread`, `starred`, `focused`, `auto`.
    #[serde(default = "default_list_filter")]
    pub default_list_filter: String,
    /// Compte IMAP ouvert au démarrage (id compte SQLite ; vide = premier compte).
    #[serde(default)]
    pub default_account_id: String,
    /// `flat` ou `hierarchical` (défaut hiérarchique).
    #[serde(default = "default_archive_layout")]
    pub archive_layout: String,
    #[serde(default = "default_archive_root")]
    pub archive_root: String,
    #[serde(default)]
    pub org_keyword_rules: Vec<OrgKeywordRule>,
    /// Âge (jours) pour la carte Organize « inbox stale ».
    #[serde(default = "default_stale_inbox_days")]
    pub stale_inbox_days: i64,
    /// Pondération lexicale mode hybride (0–1).
    #[serde(default = "default_hybrid_lexical_weight")]
    pub hybrid_lexical_weight: f32,
    /// Archivage automatique opt-in.
    #[serde(default)]
    pub auto_archive_enabled: bool,
    #[serde(default)]
    pub auto_archive_rules: Vec<AutoArchiveRule>,
    /// Dialog d’accueil minimal (winget llama) déjà fermé.
    #[serde(default = "default_first_run_dismissed")]
    pub first_run_dismissed: bool,
    /// MiniLM + Whisper bootstrap téléchargés au moins une fois.
    #[serde(default)]
    pub bootstrap_models_completed: bool,
    /// Suggestions de vues + télémétrie activité locale (100 % on-device).
    #[serde(default = "default_activity_suggestions_enabled")]
    pub activity_suggestions_enabled: bool,
    /// `light`, `dark`, ou `system`.
    #[serde(default = "default_color_scheme")]
    pub color_scheme: String,
    #[serde(default = "default_session_comfort")]
    pub session_comfort: bool,
    #[serde(default)]
    pub contrast_plus: bool,
    #[serde(default)]
    pub accent_lavender: bool,
    /// Dossiers verrouillés par compte (préférence locale, même `app_prefs.json`).
    /// Un loquet couvre le dossier et ses descendants : pas de suppression, d’archivage
    /// ni de renommage. Un descendant verrouillé empêche de supprimer l’ancêtre.
    /// Le renommage d’un dossier libre réécrit les clés des descendants verrouillés.
    #[serde(default)]
    pub locked_mailboxes_by_account: HashMap<String, Vec<String>>,
}

fn default_activity_suggestions_enabled() -> bool {
    true
}

fn default_color_scheme() -> String {
    "light".to_string()
}

fn default_session_comfort() -> bool {
    true
}

fn default_first_run_dismissed() -> bool {
    false
}

fn default_archive_layout() -> String {
    "hierarchical".to_string()
}

fn default_archive_root() -> String {
    "Archive".to_string()
}

fn default_list_filter() -> String {
    "all".to_string()
}

fn default_mother_language() -> String {
    "fr".to_string()
}

fn default_stale_inbox_days() -> i64 {
    90
}

fn default_hybrid_lexical_weight() -> f32 {
    0.55
}

impl Default for GeneralPrefs {
    fn default() -> Self {
        Self {
            mother_language: default_mother_language(),
            address_book_global_scope: false,
            default_list_filter: default_list_filter(),
            default_account_id: String::new(),
            archive_layout: default_archive_layout(),
            archive_root: default_archive_root(),
            org_keyword_rules: Vec::new(),
            stale_inbox_days: default_stale_inbox_days(),
            hybrid_lexical_weight: default_hybrid_lexical_weight(),
            auto_archive_enabled: false,
            auto_archive_rules: Vec::new(),
            first_run_dismissed: default_first_run_dismissed(),
            bootstrap_models_completed: false,
            activity_suggestions_enabled: default_activity_suggestions_enabled(),
            color_scheme: default_color_scheme(),
            session_comfort: default_session_comfort(),
            contrast_plus: false,
            accent_lavender: false,
            locked_mailboxes_by_account: HashMap::new(),
        }
    }
}

pub fn list_locked_mailboxes_for_account(prefs: &AppPrefs, account_id: &str) -> Vec<String> {
    prefs
        .general
        .locked_mailboxes_by_account
        .get(account_id.trim())
        .cloned()
        .unwrap_or_default()
}

pub fn is_mailbox_locked_in_prefs(prefs: &AppPrefs, account_id: &str, mailbox: &str) -> bool {
    let mb = mailbox.trim();
    if mb.is_empty() {
        return false;
    }
    list_locked_mailboxes_for_account(prefs, account_id)
        .iter()
        .any(|m| m.eq_ignore_ascii_case(mb))
}

pub fn set_mailbox_locked_in_prefs(
    prefs: &mut AppPrefs,
    account_id: &str,
    mailbox: &str,
    locked: bool,
) -> Result<(), String> {
    let aid = account_id.trim();
    let mb = mailbox.trim();
    if aid.is_empty() || mb.is_empty() {
        return Err("Compte ou dossier vide.".into());
    }
    let entry = prefs
        .general
        .locked_mailboxes_by_account
        .entry(aid.to_string())
        .or_default();
    if locked {
        if !entry.iter().any(|m| m.eq_ignore_ascii_case(mb)) {
            entry.push(mb.to_string());
        }
    } else {
        entry.retain(|m| !m.eq_ignore_ascii_case(mb));
    }
    Ok(())
}

fn logical_segments_preserve_case(name: &str) -> Vec<String> {
    let normalized: String = name.nfc().collect();
    let mut segs: Vec<String> = normalized
        .split(|c| c == '/' || c == '.')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    if segs
        .first()
        .is_some_and(|s| s.eq_ignore_ascii_case("inbox"))
    {
        segs.remove(0);
    }
    segs
}

fn keys_equal(a: &[String], b: &[String]) -> bool {
    !a.is_empty() && a == b
}

fn is_strict_prefix(prefix: &[String], full: &[String]) -> bool {
    !prefix.is_empty() && prefix.len() < full.len() && full.starts_with(prefix)
}

fn lock_keys<'a>(prefs: &'a AppPrefs, account_id: &str) -> Vec<Vec<String>> {
    list_locked_mailboxes_for_account(prefs, account_id)
        .into_iter()
        .map(|name| mailbox_logical_path_key(&name))
        .filter(|key| !key.is_empty())
        .collect()
}

/// Le dossier, ou un ancêtre, est verrouillé.
pub fn mailbox_covered_by_lock(prefs: &AppPrefs, account_id: &str, mailbox: &str) -> bool {
    let mb = mailbox_logical_path_key(mailbox);
    if mb.is_empty() {
        return false;
    }
    lock_keys(prefs, account_id)
        .into_iter()
        .any(|lock| keys_equal(&lock, &mb) || is_strict_prefix(&lock, &mb))
}

/// Un descendant (pas le dossier lui-même) est verrouillé.
pub fn mailbox_has_locked_descendant(prefs: &AppPrefs, account_id: &str, mailbox: &str) -> bool {
    let mb = mailbox_logical_path_key(mailbox);
    if mb.is_empty() {
        return false;
    }
    lock_keys(prefs, account_id)
        .into_iter()
        .any(|lock| is_strict_prefix(&mb, &lock))
}

pub fn mailbox_delete_block_reason(
    prefs: &AppPrefs,
    account_id: &str,
    mailbox: &str,
) -> Option<String> {
    if mailbox_covered_by_lock(prefs, account_id, mailbox) {
        return Some(LOCK_DELETE_MSG.to_string());
    }
    if mailbox_has_locked_descendant(prefs, account_id, mailbox) {
        return Some(LOCK_DELETE_CHILD_MSG.to_string());
    }
    None
}

pub fn mailbox_archive_block_reason(
    prefs: &AppPrefs,
    account_id: &str,
    mailbox: &str,
) -> Option<String> {
    if mailbox_covered_by_lock(prefs, account_id, mailbox) {
        Some(LOCK_ARCHIVE_MSG.to_string())
    } else {
        None
    }
}

pub fn mailbox_rename_block_reason(
    prefs: &AppPrefs,
    account_id: &str,
    mailbox: &str,
) -> Option<String> {
    let mb = mailbox_logical_path_key(mailbox);
    if mb.is_empty() {
        return None;
    }
    let keys = lock_keys(prefs, account_id);
    if keys.iter().any(|lock| keys_equal(lock, &mb)) {
        return Some(LOCK_RENAME_MSG.to_string());
    }
    if keys.iter().any(|lock| is_strict_prefix(lock, &mb)) {
        return Some(LOCK_RENAME_PARENT_MSG.to_string());
    }
    None
}

fn rewrite_lock_name(from: &str, to: &str, locked: &str) -> Option<String> {
    let from_key = mailbox_logical_path_key(from);
    let locked_key = mailbox_logical_path_key(locked);
    if from_key.is_empty() || locked_key.len() < from_key.len() {
        return None;
    }
    if locked_key[..from_key.len()] != from_key[..] {
        return None;
    }
    if locked_key.len() == from_key.len() {
        return Some(to.trim().to_string());
    }
    let segs = logical_segments_preserve_case(locked);
    if segs.len() != locked_key.len() {
        return None;
    }
    let suffix = segs[from_key.len()..].to_vec();
    let mut out = logical_segments_preserve_case(to);
    out.extend(suffix);
    let delim = if locked.contains('/') || to.contains('/') {
        '/'
    } else {
        '.'
    };
    Some(out.join(&delim.to_string()))
}

/// Après un RENAME autorisé : les clés sous `from` suivent `to`.
/// Les clés hors du préfixe restent. Retourne vrai si la liste a changé.
pub fn migrate_locked_mailboxes_after_rename(
    prefs: &mut AppPrefs,
    account_id: &str,
    from_mailbox: &str,
    to_mailbox: &str,
) -> bool {
    let aid = account_id.trim();
    let from = from_mailbox.trim();
    let to = to_mailbox.trim();
    if aid.is_empty() || from.is_empty() || to.is_empty() {
        return false;
    }
    let Some(entry) = prefs.general.locked_mailboxes_by_account.get_mut(aid) else {
        return false;
    };
    let mut changed = false;
    for name in entry.iter_mut() {
        if let Some(next) = rewrite_lock_name(from, to, name) {
            if next != *name {
                *name = next;
                changed = true;
            }
        }
    }
    let mut seen: Vec<String> = Vec::new();
    let before = entry.len();
    entry.retain(|name| {
        if seen.iter().any(|s| s.eq_ignore_ascii_case(name)) {
            false
        } else {
            seen.push(name.clone());
            true
        }
    });
    changed || entry.len() != before
}

/// Aligne la langue des brouillons IA sur la langue mère.
pub fn sync_draft_language_from_mother(prefs: &mut AppPrefs) {
    let ml = prefs.general.mother_language.trim();
    if !ml.is_empty() {
        prefs.ai.draft_language = ml.to_string();
    }
}

/// `dictation_backend` : `demo`, `whisper_cpp` (seul moteur local), `cloud`, `local_http`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPrefs {
    #[serde(default)]
    pub dictation_enabled: bool,
    #[serde(default = "default_dictation_backend")]
    pub dictation_backend: String,
    #[serde(default = "default_openai_base")]
    pub openai_base_url: String,
    #[serde(default)]
    pub local_companion_base_url: String,
    #[serde(default = "default_whisper_model")]
    pub whisper_model: String,
    #[serde(default = "default_translate_model")]
    pub translate_model: String,
    /// Langue parlée pour API cloud dictée (`whisper-1`, etc.).
    #[serde(default = "default_speech_language")]
    pub speech_language: String,
    #[serde(default = "default_draft_language")]
    pub draft_language: String,

    #[serde(default = "default_whisper_hf_repo_id")]
    pub whisper_hf_repo_id: String,
    #[serde(default = "default_whisper_hf_revision")]
    pub whisper_hf_revision: String,
    #[serde(default = "default_whisper_cpp_language")]
    pub whisper_cpp_language: String,

    #[serde(default = "default_whisper_model_size")]
    pub whisper_model_size: String,
    #[serde(default = "default_whisper_processing_unit")]
    pub whisper_processing_unit: String,
    #[serde(default = "default_whisper_transcription_profile")]
    pub whisper_transcription_profile: String,
    #[serde(default = "default_whisper_max_record_seconds")]
    pub whisper_max_record_seconds: u32,
    #[serde(
        default = "default_whisper_cloud_fallback",
        alias = "onnxCloudFallback"
    )]
    pub whisper_cloud_fallback: bool,

    /// Code touche physique `KeyboardEvent.code` (ex. `F9`). Chaîne vide = pas de push-to-talk clavier.
    #[serde(default = "default_whisper_ptt_key_code")]
    pub whisper_ptt_key_code: String,

    /// Après dictée : un passage LLM réécrit **uniquement le segment dicté** selon le style (ton du compositeur). Latence / coût supplémentaires.
    #[serde(default)]
    pub dictation_rewrite_with_style: bool,

    #[serde(default = "default_semantic_search_enabled")]
    pub semantic_search_enabled: bool,

    /// Active l’UI « poids GGUF » (téléchargement HF, chemin disque) pour alimenter **llama-server** hors process.
    #[serde(default)]
    pub local_llm_enabled: bool,
    /// Dépôt Hugging Face pour le fichier GGUF principal.
    #[serde(default = "default_local_llm_hf_repo_id")]
    pub local_llm_hf_repo_id: String,
    #[serde(default = "default_local_llm_hf_revision")]
    pub local_llm_hf_revision: String,
    #[serde(default = "default_local_llm_gguf_file")]
    pub local_llm_gguf_file: String,
    /// Taille de contexte indicative (chargement futur llama.cpp).
    #[serde(default = "default_local_llm_context_size")]
    pub local_llm_context_size: u32,
    /// Préférence GPU lorsque la liaison native le supportera.
    #[serde(default)]
    pub local_llm_gpu_preferred: bool,

    /// Largeur du panneau droit « Détails » (px). Mappée à la variable CSS `--ai-width`.
    #[serde(default = "default_ai_panel_width_px")]
    pub ai_panel_width_px: u32,
    /// Lecture fil : `classic`, `capsule`, ou `reading` (flux vertical document + panneau IA ouvert sur le fil).
    #[serde(default = "default_thread_layout")]
    pub thread_layout: String,

    /// Places réservées arrière‑plan — index auto / préchargement GGUF worker.
    #[serde(default)]
    pub ai_background_auto_semantic_index: bool,
    #[serde(default)]
    pub ai_background_llm_prefetch: bool,
    /// Quand l’UI est au calme : préremplir le cache SQLite (`ai_cache`) avec synthèses / traductions de fil pour les conversations visibles en liste (sans ouvrir le panneau IA).
    #[serde(default)]
    pub ai_background_idle_llm_cache_prefetch: bool,

    /// Repli cloud (chat) pour quelques fonctionnalités IA — désactivé par défaut hors dictée déjà existante.
    #[serde(default)]
    pub ai_cloud_llm_fallback: bool,

    /// Inférence cloud via [OpenRouter](https://openrouter.ai/) (API OpenAI-compatible). La clé API est dans le **trousseau**, pas ici.
    #[serde(default)]
    pub openrouter_enabled: bool,
    /// Ex. `https://openrouter.ai/api/v1` (sans slash final).
    #[serde(default = "default_openrouter_base_url")]
    pub openrouter_base_url: String,
    /// Ex. `openai/gpt-4o-mini` ou `anthropic/claude-3.5-sonnet`.
    #[serde(default = "default_openrouter_model")]
    pub openrouter_model: String,

    /// Appels HTTP vers **llama-server** (ou autre serveur compatible `/v1/chat/completions`). Clé Bearer optionnelle dans le trousseau.
    #[serde(default)]
    pub llama_server_enabled: bool,
    /// Ex. `http://127.0.0.1:8080/v1` (sans slash final).
    #[serde(default = "default_llama_server_base_url")]
    pub llama_server_base_url: String,
    /// Nom du modèle tel qu’exposé par le serveur (`--model` côté llama-server).
    #[serde(default = "default_llama_server_model")]
    pub llama_server_model: String,
    /// Autoriser llama-server même si le profil matériel suggère uniquement du CPU (faux négatifs rares).
    #[serde(default)]
    pub llama_server_allow_cpu_override: bool,
    /// Lance `llama-server` en sous-processus avec le GGUF du cache RustyMail (loopback uniquement).
    #[serde(default)]
    pub llama_server_spawn_enabled: bool,
    /// Commande sur le `PATH` (ex. `llama-server` après winget) **ou** chemin absolu vers `llama-server.exe`.
    #[serde(default)]
    pub llama_server_binary_path: String,

    /// `auto` (priorité OpenRouter puis llama-server, puis Ollama si activé), `openrouter`, `llama-server` ou `ollama`.
    #[serde(default = "default_chat_backend")]
    pub chat_backend: String,
    /// Ollama local (`/v1`). Utilisé si `chat_backend` vaut `ollama`, ou en secours quand `auto` et les autres moteurs sont incomplets.
    #[serde(default)]
    pub ollama_enabled: bool,
    /// Ex. `http://127.0.0.1:11434/v1` (sans slash final).
    #[serde(default = "default_ollama_base_url")]
    pub ollama_base_url: String,
    /// Nom vu par `ollama list` (ex. `llama3.2`).
    #[serde(default)]
    pub ollama_model: String,

    #[serde(default = "default_feature_thread_summary_enabled")]
    pub feature_thread_summary_enabled: bool,
    #[serde(default = "default_feature_thread_translate_enabled")]
    pub feature_thread_translate_enabled: bool,
    #[serde(default = "default_feature_message_translate_enabled")]
    pub feature_message_translate_enabled: bool,
    #[serde(default = "default_feature_compose_rewrite_enabled")]
    pub feature_compose_rewrite_enabled: bool,
    #[serde(default = "default_feature_compose_grammar_enabled")]
    pub feature_compose_grammar_enabled: bool,
    #[serde(default = "default_feature_quick_reply_thread_enabled")]
    pub feature_quick_reply_thread_enabled: bool,
    #[serde(default = "default_feature_quick_reply_compose_enabled")]
    pub feature_quick_reply_compose_enabled: bool,
    #[serde(default = "default_feature_inbox_digest_enabled")]
    pub feature_inbox_digest_enabled: bool,
    #[serde(default = "default_feature_search_nl_enabled")]
    pub feature_search_nl_enabled: bool,
    #[serde(default = "default_feature_thread_qa_enabled")]
    pub feature_thread_qa_enabled: bool,
    #[serde(default = "default_feature_security_llm_enabled")]
    pub feature_security_llm_enabled: bool,
    #[serde(default = "default_feature_address_autocomplete_enabled")]
    pub feature_address_autocomplete_enabled: bool,
    /// Synthèse automatique à l’ouverture d’un fil (désactivé par défaut).
    #[serde(default)]
    pub feature_auto_thread_summary_enabled: bool,
    /// Agent multi-étapes « Préparer une réponse » (désactivé par défaut).
    #[serde(default)]
    pub feature_agent_prepare_reply_enabled: bool,
    /// Profil IA sur fiche contact (désactivé par défaut).
    #[serde(default)]
    pub feature_contact_profile_enabled: bool,
    /// Propositions centre d'organisation via LLM.
    #[serde(default = "default_feature_org_proposals_enabled")]
    pub feature_org_proposals_enabled: bool,
    /// Nombre minimal de messages dans le fil pour déclencher la synthèse auto.
    #[serde(default = "default_auto_thread_summary_min_messages")]
    pub auto_thread_summary_min_messages: u32,
}

fn default_dictation_backend() -> String {
    "demo".to_string()
}

fn default_openai_base() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_whisper_model() -> String {
    "whisper-1".to_string()
}

fn default_translate_model() -> String {
    "gpt-4o-mini".to_string()
}

fn default_speech_language() -> String {
    "fr".to_string()
}

fn default_draft_language() -> String {
    "fr".to_string()
}

fn default_semantic_search_enabled() -> bool {
    true
}

fn default_whisper_hf_repo_id() -> String {
    "ggerganov/whisper.cpp".to_string()
}

fn default_whisper_hf_revision() -> String {
    "main".to_string()
}

fn default_whisper_cpp_language() -> String {
    "fr".to_string()
}

fn default_whisper_model_size() -> String {
    // `base` est souvent trop faible pour une dictée FR fiable (hallucinations sur audio court/silence).
    "small".to_string()
}

fn default_whisper_processing_unit() -> String {
    "auto".to_string()
}

fn default_whisper_transcription_profile() -> String {
    // Profil plus stable par défaut ; `fast` reste disponible pour les machines rapides.
    "balanced".to_string()
}

fn default_whisper_max_record_seconds() -> u32 {
    25
}

fn default_whisper_cloud_fallback() -> bool {
    false
}

fn default_whisper_ptt_key_code() -> String {
    "F9".to_string()
}

fn default_local_llm_hf_repo_id() -> String {
    "Qwen/Qwen2.5-3B-Instruct-GGUF".to_string()
}

fn default_local_llm_hf_revision() -> String {
    "main".to_string()
}

fn default_local_llm_gguf_file() -> String {
    "qwen2.5-3b-instruct-q4_k_m.gguf".to_string()
}

fn default_local_llm_context_size() -> u32 {
    4096
}

fn default_ai_panel_width_px() -> u32 {
    340
}

fn default_thread_layout() -> String {
    "reading".to_string()
}

fn default_openrouter_base_url() -> String {
    "https://openrouter.ai/api/v1".to_string()
}

fn default_openrouter_model() -> String {
    "openai/gpt-4o-mini".to_string()
}

fn default_llama_server_base_url() -> String {
    "http://127.0.0.1:8080/v1".to_string()
}

fn default_llama_server_model() -> String {
    String::new()
}

fn default_chat_backend() -> String {
    "auto".to_string()
}

fn default_ollama_base_url() -> String {
    "http://127.0.0.1:11434/v1".to_string()
}

/// `auto`, `openrouter`, `llama-server` ou `ollama`. Toute autre valeur retombe sur `auto`.
pub fn normalized_chat_backend(raw: &str) -> &'static str {
    match raw.trim() {
        "openrouter" => "openrouter",
        "llama-server" => "llama-server",
        "ollama" => "ollama",
        _ => "auto",
    }
}

fn default_feature_thread_summary_enabled() -> bool {
    true
}

fn default_feature_thread_translate_enabled() -> bool {
    true
}

fn default_feature_message_translate_enabled() -> bool {
    true
}

fn default_feature_compose_rewrite_enabled() -> bool {
    true
}

fn default_feature_compose_grammar_enabled() -> bool {
    true
}

fn default_feature_quick_reply_thread_enabled() -> bool {
    true
}

fn default_feature_quick_reply_compose_enabled() -> bool {
    false
}

fn default_feature_inbox_digest_enabled() -> bool {
    true
}

fn default_feature_org_proposals_enabled() -> bool {
    true
}

fn default_feature_search_nl_enabled() -> bool {
    true
}

fn default_feature_thread_qa_enabled() -> bool {
    false
}

fn default_feature_security_llm_enabled() -> bool {
    false
}

fn default_feature_address_autocomplete_enabled() -> bool {
    true
}

fn default_auto_thread_summary_min_messages() -> u32 {
    6
}

impl Default for AiPrefs {
    fn default() -> Self {
        Self {
            dictation_enabled: false,
            dictation_backend: default_dictation_backend(),
            openai_base_url: default_openai_base(),
            local_companion_base_url: String::new(),
            whisper_model: default_whisper_model(),
            translate_model: default_translate_model(),
            speech_language: default_speech_language(),
            draft_language: default_draft_language(),
            whisper_hf_repo_id: default_whisper_hf_repo_id(),
            whisper_hf_revision: default_whisper_hf_revision(),
            whisper_cpp_language: default_whisper_cpp_language(),
            whisper_model_size: default_whisper_model_size(),
            whisper_processing_unit: default_whisper_processing_unit(),
            whisper_transcription_profile: default_whisper_transcription_profile(),
            whisper_max_record_seconds: default_whisper_max_record_seconds(),
            whisper_cloud_fallback: default_whisper_cloud_fallback(),
            whisper_ptt_key_code: default_whisper_ptt_key_code(),
            dictation_rewrite_with_style: false,
            semantic_search_enabled: true,
            local_llm_enabled: false,
            local_llm_hf_repo_id: default_local_llm_hf_repo_id(),
            local_llm_hf_revision: default_local_llm_hf_revision(),
            local_llm_gguf_file: default_local_llm_gguf_file(),
            local_llm_context_size: default_local_llm_context_size(),
            local_llm_gpu_preferred: false,
            ai_panel_width_px: default_ai_panel_width_px(),
            thread_layout: default_thread_layout(),
            ai_background_auto_semantic_index: false,
            ai_background_llm_prefetch: false,
            ai_background_idle_llm_cache_prefetch: false,
            ai_cloud_llm_fallback: false,
            openrouter_enabled: false,
            openrouter_base_url: default_openrouter_base_url(),
            openrouter_model: default_openrouter_model(),
            llama_server_enabled: false,
            llama_server_base_url: default_llama_server_base_url(),
            llama_server_model: default_llama_server_model(),
            llama_server_allow_cpu_override: false,
            llama_server_spawn_enabled: false,
            llama_server_binary_path: String::new(),
            chat_backend: default_chat_backend(),
            ollama_enabled: false,
            ollama_base_url: default_ollama_base_url(),
            ollama_model: String::new(),
            feature_thread_summary_enabled: default_feature_thread_summary_enabled(),
            feature_thread_translate_enabled: default_feature_thread_translate_enabled(),
            feature_message_translate_enabled: default_feature_message_translate_enabled(),
            feature_compose_rewrite_enabled: default_feature_compose_rewrite_enabled(),
            feature_compose_grammar_enabled: default_feature_compose_grammar_enabled(),
            feature_quick_reply_thread_enabled: default_feature_quick_reply_thread_enabled(),
            feature_quick_reply_compose_enabled: default_feature_quick_reply_compose_enabled(),
            feature_inbox_digest_enabled: default_feature_inbox_digest_enabled(),
            feature_search_nl_enabled: default_feature_search_nl_enabled(),
            feature_thread_qa_enabled: default_feature_thread_qa_enabled(),
            feature_security_llm_enabled: default_feature_security_llm_enabled(),
            feature_address_autocomplete_enabled: default_feature_address_autocomplete_enabled(),
            feature_auto_thread_summary_enabled: false,
            auto_thread_summary_min_messages: default_auto_thread_summary_min_messages(),
            feature_agent_prepare_reply_enabled: false,
            feature_contact_profile_enabled: false,
            feature_org_proposals_enabled: default_feature_org_proposals_enabled(),
        }
    }
}

impl Default for AppPrefs {
    fn default() -> Self {
        Self {
            version: 1,
            general: GeneralPrefs::default(),
            ai: AiPrefs::default(),
        }
    }
}

pub fn prefs_path_from_db_dir(db_path: &Path) -> std::path::PathBuf {
    db_path
        .parent()
        .map(|p| p.join(APP_PREFS_FILE))
        .unwrap_or_else(|| std::path::PathBuf::from(APP_PREFS_FILE))
}

/// Fichier absent : préférences par défaut (aucun cadenas).
/// Fichier illisible ou JSON invalide : erreur, pour ne pas traiter un cadenas comme absent.
pub fn load_app_prefs_required(prefs_path: &Path) -> Result<AppPrefs, String> {
    let raw = match fs::read_to_string(prefs_path) {
        Ok(s) => s,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(AppPrefs::default()),
        Err(e) => return Err(format!("{LOCK_PREFS_UNREADABLE} ({e})")),
    };
    let prefs: AppPrefs =
        serde_json::from_str(&raw).map_err(|e| format!("{LOCK_PREFS_INVALID} ({e})"))?;
    Ok(finalize_loaded_prefs(prefs))
}

pub fn load_app_prefs(prefs_path: &Path) -> AppPrefs {
    load_app_prefs_required(prefs_path).unwrap_or_else(|_| AppPrefs::default())
}

fn finalize_loaded_prefs(mut prefs: AppPrefs) -> AppPrefs {
    match prefs.ai.dictation_backend.trim() {
        "onnx" => prefs.ai.dictation_backend = "whisper_cpp".into(),
        _ => {}
    }
    if prefs.ai.whisper_cpp_language.trim().is_empty() {
        prefs.ai.whisper_cpp_language = default_whisper_cpp_language();
    }
    if prefs.ai.local_llm_hf_repo_id.trim().is_empty() {
        prefs.ai.local_llm_hf_repo_id = default_local_llm_hf_repo_id();
    }
    if prefs.ai.local_llm_hf_revision.trim().is_empty() {
        prefs.ai.local_llm_hf_revision = default_local_llm_hf_revision();
    }
    if prefs.ai.local_llm_gguf_file.trim().is_empty() {
        prefs.ai.local_llm_gguf_file = default_local_llm_gguf_file();
    }
    if prefs.ai.local_llm_context_size == 0 {
        prefs.ai.local_llm_context_size = default_local_llm_context_size();
    }
    if prefs.ai.ai_panel_width_px == 0 {
        prefs.ai.ai_panel_width_px = default_ai_panel_width_px();
    }
    if prefs.ai.thread_layout.trim().is_empty() {
        prefs.ai.thread_layout = default_thread_layout();
    }
    if prefs.ai.openrouter_base_url.trim().is_empty() {
        prefs.ai.openrouter_base_url = default_openrouter_base_url();
    }
    if prefs.ai.openrouter_model.trim().is_empty() {
        prefs.ai.openrouter_model = default_openrouter_model();
    }
    if prefs.ai.llama_server_base_url.trim().is_empty() {
        prefs.ai.llama_server_base_url = default_llama_server_base_url();
    }
    prefs.ai.chat_backend = normalized_chat_backend(&prefs.ai.chat_backend).to_string();
    if prefs.ai.ollama_base_url.trim().is_empty() {
        prefs.ai.ollama_base_url = default_ollama_base_url();
    }
    prefs
}

pub fn save_app_prefs(prefs_path: &Path, prefs: &AppPrefs) -> Result<(), String> {
    if let Some(parent) = prefs_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    fs::write(prefs_path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod mailbox_lock_tests {
    use super::*;

    fn prefs_with(locks: &[&str]) -> AppPrefs {
        let mut prefs = AppPrefs::default();
        for lock in locks {
            set_mailbox_locked_in_prefs(&mut prefs, "a@exemple.fr", lock, true).unwrap();
        }
        prefs
    }

    #[test]
    fn delete_blocks_self_ancestor_and_descendant() {
        let prefs = prefs_with(&["Clients/Atelier"]);
        assert_eq!(
            mailbox_delete_block_reason(&prefs, "a@exemple.fr", "Clients/Atelier").as_deref(),
            Some(LOCK_DELETE_MSG)
        );
        assert_eq!(
            mailbox_delete_block_reason(&prefs, "a@exemple.fr", "clients/atelier/2024").as_deref(),
            Some(LOCK_DELETE_MSG)
        );
        assert_eq!(
            mailbox_delete_block_reason(&prefs, "a@exemple.fr", "Clients").as_deref(),
            Some(LOCK_DELETE_CHILD_MSG)
        );
        assert_eq!(
            mailbox_delete_block_reason(&prefs, "a@exemple.fr", "Notes"),
            None
        );
        assert_eq!(
            mailbox_delete_block_reason(&prefs, "autre@exemple.fr", "Clients/Atelier"),
            None
        );
        assert!(is_mailbox_locked_in_prefs(
            &prefs,
            "a@exemple.fr",
            "clients/atelier"
        ));
    }

    #[test]
    fn inbox_prefix_and_dot_delimiter_match_the_same_folder() {
        let prefs = prefs_with(&["INBOX.Clients.Atelier"]);
        assert!(mailbox_covered_by_lock(
            &prefs,
            "a@exemple.fr",
            "Clients/Atelier"
        ));
        assert_eq!(
            mailbox_archive_block_reason(&prefs, "a@exemple.fr", "Clients/Atelier/Facture")
                .as_deref(),
            Some(LOCK_ARCHIVE_MSG)
        );
        assert_eq!(
            mailbox_archive_block_reason(&prefs, "a@exemple.fr", "Clients"),
            None
        );
    }

    #[test]
    fn rename_blocks_self_and_ancestor_but_not_a_locked_child() {
        let prefs = prefs_with(&["Clients", "Notes/Perso"]);
        assert_eq!(
            mailbox_rename_block_reason(&prefs, "a@exemple.fr", "Clients").as_deref(),
            Some(LOCK_RENAME_MSG)
        );
        assert_eq!(
            mailbox_rename_block_reason(&prefs, "a@exemple.fr", "Clients/Atelier").as_deref(),
            Some(LOCK_RENAME_PARENT_MSG)
        );
        assert_eq!(
            mailbox_rename_block_reason(&prefs, "a@exemple.fr", "Notes"),
            None
        );
    }

    #[test]
    fn rename_migrates_descendant_keys_and_leaves_the_rest() {
        let mut prefs = prefs_with(&["Clients/Atelier", "Notes"]);
        assert!(migrate_locked_mailboxes_after_rename(
            &mut prefs,
            "a@exemple.fr",
            "Clients",
            "Projets/Clients"
        ));
        let locks = list_locked_mailboxes_for_account(&prefs, "a@exemple.fr");
        assert_eq!(
            locks,
            vec!["Projets/Clients/Atelier".to_string(), "Notes".to_string(),]
        );
        assert_eq!(
            mailbox_rename_block_reason(&prefs, "a@exemple.fr", "Projets/Clients/Atelier")
                .as_deref(),
            Some(LOCK_RENAME_MSG)
        );
    }

    #[test]
    fn rename_keeps_dot_delimiter_when_the_tree_uses_dots() {
        let mut prefs = prefs_with(&["Clients.Atelier"]);
        assert!(migrate_locked_mailboxes_after_rename(
            &mut prefs,
            "a@exemple.fr",
            "Clients",
            "Archives"
        ));
        assert_eq!(
            list_locked_mailboxes_for_account(&prefs, "a@exemple.fr"),
            vec!["Archives.Atelier".to_string()]
        );
    }

    #[test]
    fn required_prefs_load_fails_closed_on_bad_json_and_open_on_missing_file() {
        let dir = std::env::temp_dir().join(format!("rustymail-lock-prefs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let missing = dir.join("absent.json");
        assert!(load_app_prefs_required(&missing)
            .unwrap()
            .general
            .locked_mailboxes_by_account
            .is_empty());

        let bad = dir.join("bad.json");
        fs::write(&bad, "{").unwrap();
        let err = load_app_prefs_required(&bad).unwrap_err();
        assert!(err.starts_with(LOCK_PREFS_INVALID), "{err}");
        assert!(load_app_prefs(&bad)
            .general
            .locked_mailboxes_by_account
            .is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
