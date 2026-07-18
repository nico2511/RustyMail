//! Veille IMAP IDLE (INBOX) + sync périodique des dossiers secondaires / focus UI.
//!
//! - **IDLE** reste sur INBOX (une connexion IDLE classique).
//! - Après chaque cycle IDLE / poll INBOX, on synchronise aussi :
//!   - le dossier **focalisé** (sélection UI), s’il n’est pas INBOX ;
//!   - les dossiers secondaires détectés via LIST (Sent, Drafts, Trash) — moins souvent.
//!
//! Le dispatcher de commandes doit être lancé via [`ImapIdleCoordinator::run_dispatcher`]
//! depuis une runtime async (ex. `tauri::async_runtime::spawn`).

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use async_imap::extensions::idle::IdleResponse;
use rustymail_domain::Account;
use tokio::sync::{mpsc, Mutex};
use tokio::time::sleep;

use super::ops::{imap_session_select_mailbox, list_selectable_mailboxes, mailbox_name_match_key};
use super::session::{login_session_for_account, map_imap_error};
use super::sync::sync_inbox;
use crate::mail_ops::{is_sent_like_mailbox, is_trash_like_mailbox, pick_trash_folder};

const POLL_FALLBACK_SECS: u64 = 90;
const BACKOFF_INITIAL_SECS: u64 = 5;
const BACKOFF_CAP_SECS: u64 = 300;
const IDLE_MAX_WAIT: Duration = Duration::from_secs(28 * 60);
/// Tous les N cycles INBOX, resync Sent/Drafts/Trash (en plus du focus UI).
const SECONDARY_EVERY_N_CYCLES: u32 = 3;
const EXTRA_SYNC_LIMIT: usize = 40;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImapPushEvent {
    pub account_id: String,
    pub mailbox: String,
    pub reason: String,
}

enum WatchCommand {
    Restart { account: Account },
    SetFocusedMailbox { account_id: String, mailbox: String },
    Stop { account_id: String },
    StopAll,
}

/// Coordonne une tâche tokio par compte (IDLE ou polling de repli).
pub struct ImapIdleCoordinator {
    db_path: Arc<PathBuf>,
    on_push: Arc<dyn Fn(ImapPushEvent) + Send + Sync>,
    cmd_tx: mpsc::UnboundedSender<WatchCommand>,
    cmd_rx: Mutex<Option<mpsc::UnboundedReceiver<WatchCommand>>>,
    handles: Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
    /// Dossier actuellement affiché dans l’UI (par compte).
    focused_mailboxes: Arc<Mutex<HashMap<String, String>>>,
}

impl ImapIdleCoordinator {
    pub fn new(
        db_path: Arc<PathBuf>,
        on_push: Arc<dyn Fn(ImapPushEvent) + Send + Sync>,
    ) -> Arc<Self> {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        Arc::new(Self {
            db_path,
            on_push,
            cmd_tx,
            cmd_rx: Mutex::new(Some(cmd_rx)),
            handles: Arc::new(Mutex::new(HashMap::new())),
            focused_mailboxes: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// Boucle de commandes — à lancer **une fois** dans une runtime tokio (Tauri async).
    pub async fn run_dispatcher(self: Arc<Self>) {
        let mut rx = match self.cmd_rx.lock().await.take() {
            Some(rx) => rx,
            None => {
                log::warn!(
                    target: "rustymail::audit",
                    "imap_idle dispatcher already running"
                );
                return;
            }
        };

        let db = Arc::clone(&self.db_path);
        let push = Arc::clone(&self.on_push);
        let handles_bg = Arc::clone(&self.handles);
        let focused = Arc::clone(&self.focused_mailboxes);

        while let Some(cmd) = rx.recv().await {
            match cmd {
                WatchCommand::Restart { account } => {
                    let id = account.id.0.clone();
                    let mut guard = handles_bg.lock().await;
                    if let Some(h) = guard.remove(&id) {
                        h.abort();
                    }
                    let db_c = Arc::clone(&db);
                    let push_c = Arc::clone(&push);
                    let focused_c = Arc::clone(&focused);
                    let handle = tokio::spawn(async move {
                        watch_account_loop(db_c, account, push_c, focused_c).await;
                    });
                    guard.insert(id, handle);
                }
                WatchCommand::SetFocusedMailbox {
                    account_id,
                    mailbox,
                } => {
                    let mut map = focused.lock().await;
                    let mb = mailbox.trim().to_string();
                    if mb.is_empty() {
                        map.remove(account_id.trim());
                    } else {
                        map.insert(account_id.trim().to_string(), mb);
                    }
                }
                WatchCommand::Stop { account_id } => {
                    let mut guard = handles_bg.lock().await;
                    if let Some(h) = guard.remove(&account_id) {
                        h.abort();
                    }
                }
                WatchCommand::StopAll => {
                    let mut guard = handles_bg.lock().await;
                    for (_, h) in guard.drain() {
                        h.abort();
                    }
                }
            }
        }
    }

    pub fn restart_account(&self, account: Account) {
        let _ = self.cmd_tx.send(WatchCommand::Restart { account });
    }

    /// Informe la veille du dossier actuellement ouvert dans l’UI (hors virtual / local).
    pub fn set_focused_mailbox(&self, account_id: &str, mailbox: &str) {
        let _ = self.cmd_tx.send(WatchCommand::SetFocusedMailbox {
            account_id: account_id.trim().to_string(),
            mailbox: mailbox.trim().to_string(),
        });
    }

    pub fn stop_account(&self, account_id: &str) {
        let _ = self.cmd_tx.send(WatchCommand::Stop {
            account_id: account_id.to_string(),
        });
    }

    pub fn stop_all(&self) {
        let _ = self.cmd_tx.send(WatchCommand::StopAll);
    }

    /// (Re)lance la veille pour chaque compte enregistré.
    pub fn sync_accounts(&self, accounts: &[Account]) {
        for account in accounts {
            self.restart_account(account.clone());
        }
    }
}

fn is_inbox_name(name: &str) -> bool {
    name.trim().eq_ignore_ascii_case("INBOX")
}

fn is_drafts_like_mailbox(name: &str) -> bool {
    let n = name.trim().to_ascii_lowercase();
    n == "drafts"
        || n.ends_with("/drafts")
        || n.ends_with(".drafts")
        || n.contains("[gmail]/drafts")
        || n == "brouillons"
        || n.ends_with("/brouillons")
}

fn pick_sent_folder(list: &[String]) -> Option<String> {
    list.iter()
        .find(|n| is_sent_like_mailbox(n))
        .cloned()
        .or_else(|| {
            list.iter()
                .find(|n| {
                    let l = n.to_ascii_lowercase();
                    l.contains("sent") || l.contains("envoyé") || l.contains("envoyes")
                })
                .cloned()
        })
}

fn pick_drafts_folder(list: &[String]) -> Option<String> {
    list.iter().find(|n| is_drafts_like_mailbox(n)).cloned()
}

async fn resolve_secondary_mailboxes(account: &Account) -> Vec<String> {
    let Ok(list) = list_selectable_mailboxes(account).await else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for candidate in [
        pick_sent_folder(&list),
        pick_drafts_folder(&list),
        pick_trash_folder(&list),
    ]
    .into_iter()
    .flatten()
    {
        let key = mailbox_name_match_key(&candidate);
        if is_inbox_name(&candidate) || !seen.insert(key) {
            continue;
        }
        out.push(candidate);
    }
    out
}

async fn sync_and_maybe_push(
    db_path: &PathBuf,
    account: &Account,
    mailbox: &str,
    reason: &str,
    on_push: &Arc<dyn Fn(ImapPushEvent) + Send + Sync>,
) {
    match sync_inbox(db_path, account, mailbox, Some(EXTRA_SYNC_LIMIT)).await {
        Ok(res) if res.fetched_uids > 0 => {
            on_push(ImapPushEvent {
                account_id: account.id.0.clone(),
                mailbox: res.mailbox,
                reason: reason.into(),
            });
        }
        Ok(_) => {}
        Err(e) => {
            log::warn!(
                target: "rustymail::audit",
                "imap_extra_sync account={} mailbox={} err={}",
                account.id.0,
                mailbox,
                e
            );
        }
    }
}

async fn sync_extra_mailboxes(
    db_path: &PathBuf,
    account: &Account,
    on_push: &Arc<dyn Fn(ImapPushEvent) + Send + Sync>,
    focused: &Arc<Mutex<HashMap<String, String>>>,
    secondary: &[String],
    include_secondary: bool,
) {
    let mut plan: Vec<(String, &'static str)> = Vec::new();
    let mut seen = HashSet::new();

    let focus_snapshot = {
        let map = focused.lock().await;
        map.get(account.id.0.as_str()).cloned()
    };
    if let Some(focus) = focus_snapshot {
        let focus = focus.trim().to_string();
        if !focus.is_empty() && !is_inbox_name(&focus) {
            let key = mailbox_name_match_key(&focus);
            if seen.insert(key) {
                plan.push((focus, "focus-sync"));
            }
        }
    }

    if include_secondary {
        for mb in secondary {
            let key = mailbox_name_match_key(mb);
            if is_inbox_name(mb) || !seen.insert(key) {
                continue;
            }
            let reason = if is_trash_like_mailbox(mb) {
                "secondary-trash-sync"
            } else if is_sent_like_mailbox(mb) {
                "secondary-sent-sync"
            } else if is_drafts_like_mailbox(mb) {
                "secondary-drafts-sync"
            } else {
                "secondary-sync"
            };
            plan.push((mb.clone(), reason));
        }
    }

    for (mb, reason) in plan {
        sync_and_maybe_push(db_path, account, &mb, reason, on_push).await;
    }
}

async fn watch_account_loop(
    db_path: Arc<PathBuf>,
    account: Account,
    on_push: Arc<dyn Fn(ImapPushEvent) + Send + Sync>,
    focused: Arc<Mutex<HashMap<String, String>>>,
) {
    let account_id = account.id.0.clone();
    let inbox = "INBOX".to_string();
    let mut backoff_secs = BACKOFF_INITIAL_SECS;
    let mut use_polling = false;
    let mut cycle: u32 = 0;
    let secondary = resolve_secondary_mailboxes(&account).await;
    if !secondary.is_empty() {
        log::info!(
            target: "rustymail::audit",
            "imap_watch account={} secondary={:?}",
            account_id,
            secondary
        );
    }

    loop {
        cycle = cycle.wrapping_add(1);
        let include_secondary = cycle % SECONDARY_EVERY_N_CYCLES == 0;

        if use_polling {
            match sync_inbox(db_path.as_ref(), &account, &inbox, Some(EXTRA_SYNC_LIMIT)).await {
                Ok(res) if res.fetched_uids > 0 => {
                    on_push(ImapPushEvent {
                        account_id: account_id.clone(),
                        mailbox: inbox.clone(),
                        reason: "poll-new-messages".into(),
                    });
                    backoff_secs = BACKOFF_INITIAL_SECS;
                }
                Ok(_) => {
                    backoff_secs = BACKOFF_INITIAL_SECS;
                }
                Err(e) => {
                    log::warn!(
                        target: "rustymail::audit",
                        "imap_poll account={} err={}",
                        account_id,
                        e
                    );
                    sleep(Duration::from_secs(backoff_secs)).await;
                    backoff_secs = (backoff_secs * 2).min(BACKOFF_CAP_SECS);
                }
            }
            sync_extra_mailboxes(
                db_path.as_ref(),
                &account,
                &on_push,
                &focused,
                &secondary,
                true,
            )
            .await;
            sleep(Duration::from_secs(POLL_FALLBACK_SECS)).await;
            continue;
        }

        match idle_mailbox_once(&account, &inbox).await {
            Ok(IdleOutcome::NewMail) => {
                backoff_secs = BACKOFF_INITIAL_SECS;
                if let Ok(res) =
                    sync_inbox(db_path.as_ref(), &account, &inbox, Some(EXTRA_SYNC_LIMIT)).await
                {
                    if res.fetched_uids > 0 {
                        on_push(ImapPushEvent {
                            account_id: account_id.clone(),
                            mailbox: inbox.clone(),
                            reason: "idle-exists".into(),
                        });
                    }
                }
                sync_extra_mailboxes(
                    db_path.as_ref(),
                    &account,
                    &on_push,
                    &focused,
                    &secondary,
                    include_secondary,
                )
                .await;
            }
            Ok(IdleOutcome::Timeout | IdleOutcome::Interrupted) => {
                backoff_secs = BACKOFF_INITIAL_SECS;
                if let Ok(res) =
                    sync_inbox(db_path.as_ref(), &account, &inbox, Some(EXTRA_SYNC_LIMIT)).await
                {
                    if res.fetched_uids > 0 {
                        on_push(ImapPushEvent {
                            account_id: account_id.clone(),
                            mailbox: inbox.clone(),
                            reason: "idle-timeout-sync".into(),
                        });
                    }
                }
                // Timeout IDLE (~28 min) : toujours inclure secondaires + focus.
                sync_extra_mailboxes(
                    db_path.as_ref(),
                    &account,
                    &on_push,
                    &focused,
                    &secondary,
                    true,
                )
                .await;
            }
            Err(e) => {
                let low = e.to_ascii_lowercase();
                if low.contains("idle") && (low.contains("not") || low.contains("capability")) {
                    log::info!(
                        target: "rustymail::audit",
                        "imap_idle unsupported account={} — polling fallback",
                        account_id
                    );
                    use_polling = true;
                    continue;
                }
                log::warn!(
                    target: "rustymail::audit",
                    "imap_idle account={} err={} backoff={}s",
                    account_id,
                    e,
                    backoff_secs
                );
                sleep(Duration::from_secs(backoff_secs)).await;
                backoff_secs = (backoff_secs * 2).min(BACKOFF_CAP_SECS);
                use_polling = true;
            }
        }
    }
}

enum IdleOutcome {
    NewMail,
    Timeout,
    Interrupted,
}

async fn idle_mailbox_once(account: &Account, mailbox: &str) -> Result<IdleOutcome, String> {
    let mut session = login_session_for_account(account).await?;
    imap_session_select_mailbox(&mut session, mailbox).await?;

    let mut handle = session.idle();
    handle.init().await.map_err(map_imap_error)?;
    let (wait, _stop) = handle.wait_with_timeout(IDLE_MAX_WAIT);
    let outcome = match wait.await.map_err(map_imap_error)? {
        IdleResponse::NewData(_) => IdleOutcome::NewMail,
        IdleResponse::Timeout => IdleOutcome::Timeout,
        IdleResponse::ManualInterrupt => IdleOutcome::Interrupted,
    };
    let mut session = handle.done().await.map_err(map_imap_error)?;
    let _ = session.logout().await;
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inbox_detection_is_case_insensitive() {
        assert!(is_inbox_name("INBOX"));
        assert!(is_inbox_name("inbox"));
        assert!(!is_inbox_name("INBOX/Work"));
    }

    #[test]
    fn drafts_heuristic_matches_common_names() {
        assert!(is_drafts_like_mailbox("Drafts"));
        assert!(is_drafts_like_mailbox("[Gmail]/Drafts"));
        assert!(is_drafts_like_mailbox("Brouillons"));
        assert!(!is_drafts_like_mailbox("INBOX"));
    }
}
