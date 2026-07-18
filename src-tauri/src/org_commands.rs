//! IPC centre d'organisation.

use rustymail_domain::{
    OrgApplyProgress, OrgProposal, OrgScanLlmStatus, OrgScanReport, OrgSuggestedAction,
    OrgV2DecisionKind, OrgV2RecordDecisionResult, OrgV2ScanReport,
};
use rustymail_infrastructure::{
    ai_feature_enabled, enrich_org_report_llm_refs, ignore_mailbox, load_accounts, load_app_prefs,
    open_sqlite_migrated_public, org_apply_proposal_with, org_llm_proposals_for_account,
    org_resolve_archive_path, org_retag_account, org_retag_threads, org_scan_account,
    org_v2_scan_account, post_move_heuristic_refresh, prepare_org_proposal_for_apply,
    record_proposal_decision, resolve_apply_action, unignore_mailbox,
    validate_org_apply_thread_ids, AiFeature,
};
use tauri::State;

use crate::ipc_guard;
use crate::llm_commands::build_llm_engine;
use crate::AppPaths;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgScanPayload {
    pub account_id: String,
    #[serde(default)]
    pub include_llm: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgApplyPayload {
    pub account_id: String,
    pub proposal_id: String,
    #[serde(default)]
    pub thread_ids: Option<Vec<String>>,
    #[serde(default)]
    pub trash_ack: Option<String>,
    /// `delete-mailbox` — suppression de dossiers vides (carte `empty-mailboxes`).
    #[serde(default)]
    pub delete_mailbox_ack: Option<String>,
    /// `trash` | `archive` | `markRead` — remplace l’action de la carte pour ce lot.
    #[serde(default)]
    pub action_override: Option<String>,
    /// Carte affichée côté UI (obligatoire pour `llm-*`, recommandé pour toutes les cartes).
    #[serde(default)]
    pub proposal_snapshot: Option<OrgProposal>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgRetagPayload {
    pub account_id: String,
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgRetagThreadsPayload {
    pub account_id: String,
    pub thread_ids: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgArchivePathPayload {
    pub thread_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgV2ScanPayload {
    pub account_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgV2DecisionPayload {
    pub account_id: String,
    pub proposal_snapshot: OrgProposal,
    /// `applied` | `dismissed` | `snoozed`
    pub decision: String,
    #[serde(default)]
    pub snooze_days: Option<u32>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgV2MailboxPayload {
    pub account_id: String,
    pub mailbox: String,
}

fn parse_v2_decision(s: &str) -> Result<OrgV2DecisionKind, String> {
    match s.trim().to_ascii_lowercase().as_str() {
        "applied" => Ok(OrgV2DecisionKind::Applied),
        "dismissed" => Ok(OrgV2DecisionKind::Dismissed),
        "snoozed" => Ok(OrgV2DecisionKind::Snoozed),
        other => Err(format!("Décision V2 inconnue : {other}")),
    }
}

/// Scan + propositions LLM optionnelles — tout le chemin bloquant (reqwest) reste hors runtime async.
fn org_scan_account_compute(
    paths: &AppPaths,
    account_id: &str,
    include_llm: bool,
) -> Result<OrgScanReport, String> {
    let mut report = org_scan_account(&paths.db_path, account_id, false)?;
    let mut llm_status = OrgScanLlmStatus {
        requested: include_llm,
        ..OrgScanLlmStatus::default()
    };
    if include_llm {
        let prefs = load_app_prefs(&paths.prefs_path);
        if ai_feature_enabled(&prefs.ai, AiFeature::OrgProposals) {
            llm_status.enabled = true;
            match build_llm_engine(&prefs, paths) {
                Ok(mut engine) => {
                    let lang = prefs.general.mother_language.as_str();
                    match org_llm_proposals_for_account(
                        &paths.db_path,
                        account_id,
                        report.proposals.len(),
                        &mut engine,
                        lang,
                    ) {
                        Ok(llm_cards) => {
                            llm_status.proposal_count = llm_cards.len();
                            llm_status.succeeded = true;
                            report.proposals.extend(llm_cards);
                        }
                        Err(e) => {
                            llm_status.message = Some(format!("Analyse IA indisponible : {e}"));
                        }
                    }
                }
                Err(e) => {
                    llm_status.message = Some(format!("Analyse IA indisponible : {e}"));
                }
            }
        } else {
            llm_status.message = Some(
                "Analyse IA désactivée — activez « Propositions Organiser » dans Paramètres → IA."
                    .into(),
            );
        }
    }
    report.llm_status = llm_status;
    enrich_org_report_llm_refs(&paths.db_path, account_id, &mut report)?;
    Ok(report)
}

fn validate_thread_ids_for_proposal(
    db_path: &std::path::Path,
    account_id: &str,
    proposal: &OrgProposal,
    thread_ids: Option<&[String]>,
) -> Result<(), String> {
    let Some(ids) = thread_ids else {
        return Ok(());
    };
    ipc_guard::validate_org_thread_ids(Some(ids))?;
    validate_org_apply_thread_ids(db_path, account_id, proposal, ids)
}

fn resolve_proposal_for_apply(
    paths: &AppPaths,
    account_id: &str,
    proposal_id: &str,
    snapshot: Option<OrgProposal>,
) -> Result<OrgProposal, String> {
    if let Some(snap) = snapshot {
        return prepare_org_proposal_for_apply(&paths.db_path, account_id, proposal_id, snap);
    }
    let include_llm = proposal_id.starts_with("llm-");
    let report = org_scan_account_compute(paths, account_id, include_llm)?;
    report
        .proposals
        .into_iter()
        .find(|p| p.id == proposal_id)
        .ok_or_else(|| format!("Proposition introuvable : {proposal_id}"))
}

#[tauri::command]
pub async fn org_scan_account_cmd(
    paths: State<'_, AppPaths>,
    payload: OrgScanPayload,
) -> Result<OrgScanReport, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let paths = std::clone::Clone::clone(&*paths);
    let account_id = payload.account_id.trim().to_string();
    let include_llm = payload.include_llm;
    tauri::async_runtime::spawn_blocking(move || {
        org_scan_account_compute(&paths, &account_id, include_llm)
    })
    .await
    .map_err(|e| format!("org scan join: {e}"))?
}

#[tauri::command]
pub async fn org_apply_proposal_cmd(
    paths: State<'_, AppPaths>,
    payload: OrgApplyPayload,
) -> Result<OrgApplyProgress, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let account_id = payload.account_id.trim().to_string();
    let proposal_id = payload.proposal_id.trim().to_string();
    ipc_guard::validate_proposal_id(&proposal_id)?;
    if proposal_id.starts_with("llm-") && payload.proposal_snapshot.is_none() {
        return Err(
            "proposalSnapshot requis pour une carte IA (relancez l’analyse puis réessayez).".into(),
        );
    }

    let paths_clone = std::clone::Clone::clone(&*paths);
    let proposal_snapshot = payload.proposal_snapshot.clone();
    let account_id_resolve = account_id.clone();
    let proposal_id_resolve = proposal_id.clone();
    let proposal = tauri::async_runtime::spawn_blocking(move || {
        resolve_proposal_for_apply(
            &paths_clone,
            &account_id_resolve,
            &proposal_id_resolve,
            proposal_snapshot,
        )
    })
    .await
    .map_err(|e| format!("org resolve proposal join: {e}"))??;

    validate_thread_ids_for_proposal(
        &paths.db_path,
        &account_id,
        &proposal,
        payload.thread_ids.as_deref(),
    )?;

    let effective_action = resolve_apply_action(&proposal, payload.action_override.as_deref());

    if effective_action == OrgSuggestedAction::Trash {
        ipc_guard::validate_bulk_trash_org_ack(payload.trash_ack.as_deref())?;
    }
    if effective_action == OrgSuggestedAction::DeleteMailbox {
        ipc_guard::validate_delete_mailbox_ack(payload.delete_mailbox_ack.as_deref())?;
    }

    let db = paths.db_path.clone();
    let thread_ids = payload.thread_ids.clone();
    let progress = org_apply_proposal_with(
        &db,
        &account_id,
        proposal,
        thread_ids,
        payload.action_override.as_deref(),
    )
    .await?;

    let needs_pipeline =
        !progress.mailboxes_to_sync.is_empty() || !progress.threads_affected.is_empty();
    if needs_pipeline {
        if let Ok(accounts) = load_accounts(&db) {
            if let Some(acc) = accounts.into_iter().find(|a| a.id.0 == account_id) {
                let sync_ids = progress.mailboxes_to_sync.clone();
                let thread_ids = progress.threads_affected.clone();
                // Pas de reset last_uid ici : les destinations ont déjà été syncées
                // via les moves ; un reset source ferait réapparaître des UIDs.
                let _ = post_move_heuristic_refresh(
                    &db,
                    &acc,
                    sync_ids,
                    Vec::<String>::new(),
                    thread_ids,
                    Some(80),
                )
                .await;
            }
        }
    }
    Ok(progress)
}

#[tauri::command]
pub async fn org_retag_account_cmd(
    paths: State<'_, AppPaths>,
    payload: OrgRetagPayload,
) -> Result<OrgApplyProgress, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    let dry_run = payload.dry_run;
    tauri::async_runtime::spawn_blocking(move || org_retag_account(&db, &account_id, dry_run))
        .await
        .map_err(|e| format!("org retag join: {e}"))?
}

#[tauri::command]
pub async fn org_retag_threads_cmd(
    paths: State<'_, AppPaths>,
    payload: OrgRetagThreadsPayload,
) -> Result<usize, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    if payload.thread_ids.is_empty() {
        return Ok(0);
    }
    for tid in &payload.thread_ids {
        ipc_guard::validate_thread_id(tid)?;
    }
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    let thread_ids = payload.thread_ids.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = open_sqlite_migrated_public(&db).map_err(|e| e.to_string())?;
        org_retag_threads(&conn, &account_id, &thread_ids)
    })
    .await
    .map_err(|e| format!("org retag threads join: {e}"))?
}

#[tauri::command]
pub async fn org_resolve_archive_path_cmd(
    paths: State<'_, AppPaths>,
    payload: OrgArchivePathPayload,
) -> Result<String, String> {
    ipc_guard::validate_thread_id(&payload.thread_id)?;
    let db = paths.db_path.clone();
    let thread_id = payload.thread_id.clone();
    tauri::async_runtime::spawn_blocking(move || org_resolve_archive_path(&db, &thread_id))
        .await
        .map_err(|e| format!("org archive path join: {e}"))?
}

#[tauri::command]
pub async fn org_v2_scan_account_cmd(
    paths: State<'_, AppPaths>,
    payload: OrgV2ScanPayload,
) -> Result<OrgV2ScanReport, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || org_v2_scan_account(&db, &account_id))
        .await
        .map_err(|e| format!("org v2 scan join: {e}"))?
}

#[tauri::command]
pub async fn org_v2_record_decision_cmd(
    paths: State<'_, AppPaths>,
    payload: OrgV2DecisionPayload,
) -> Result<OrgV2RecordDecisionResult, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let account_id = payload.account_id.trim().to_string();
    let decision = parse_v2_decision(&payload.decision)?;
    let db = paths.db_path.clone();
    let proposal = payload.proposal_snapshot;
    let snooze_days = payload.snooze_days;
    let fingerprint = tauri::async_runtime::spawn_blocking(move || {
        record_proposal_decision(&db, &account_id, &proposal, decision, snooze_days)
    })
    .await
    .map_err(|e| format!("org v2 record join: {e}"))??;
    Ok(OrgV2RecordDecisionResult {
        ok: true,
        fingerprint,
    })
}

#[tauri::command]
pub async fn org_v2_ignore_mailbox_cmd(
    paths: State<'_, AppPaths>,
    payload: OrgV2MailboxPayload,
) -> Result<(), String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let mb = payload.mailbox.trim().to_string();
    if mb.is_empty() {
        return Err("Dossier vide.".into());
    }
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || ignore_mailbox(&db, &account_id, &mb))
        .await
        .map_err(|e| format!("org v2 ignore mailbox join: {e}"))?
}

#[tauri::command]
pub async fn org_v2_unignore_mailbox_cmd(
    paths: State<'_, AppPaths>,
    payload: OrgV2MailboxPayload,
) -> Result<(), String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let mb = payload.mailbox.trim().to_string();
    if mb.is_empty() {
        return Err("Dossier vide.".into());
    }
    let db = paths.db_path.clone();
    let account_id = payload.account_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || unignore_mailbox(&db, &account_id, &mb))
        .await
        .map_err(|e| format!("org v2 unignore mailbox join: {e}"))?
}
