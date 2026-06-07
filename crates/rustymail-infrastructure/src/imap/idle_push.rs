//! Veille IMAP IDLE (INBOX) avec repli polling + backoff exponentiel.
//!
//! Le dispatcher de commandes doit être lancé via [`ImapIdleCoordinator::run_dispatcher`]
//! depuis une runtime async (ex. `tauri::async_runtime::spawn`).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use async_imap::extensions::idle::IdleResponse;
use rustymail_domain::Account;
use tokio::sync::{mpsc, Mutex};
use tokio::time::sleep;

use super::ops::imap_session_select_mailbox;
use super::session::{login_session_for_account, map_imap_error};
use super::sync::sync_inbox;

const POLL_FALLBACK_SECS: u64 = 90;
const BACKOFF_INITIAL_SECS: u64 = 5;
const BACKOFF_CAP_SECS: u64 = 300;
const IDLE_MAX_WAIT: Duration = Duration::from_secs(28 * 60);

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImapPushEvent {
    pub account_id: String,
    pub mailbox: String,
    pub reason: String,
}

enum WatchCommand {
    Restart { account: Account },
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
                    let handle = tokio::spawn(async move {
                        watch_account_loop(db_c, account, push_c).await;
                    });
                    guard.insert(id, handle);
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

async fn watch_account_loop(
    db_path: Arc<PathBuf>,
    account: Account,
    on_push: Arc<dyn Fn(ImapPushEvent) + Send + Sync>,
) {
    let account_id = account.id.0.clone();
    let mailbox = "INBOX".to_string();
    let mut backoff_secs = BACKOFF_INITIAL_SECS;
    let mut use_polling = false;

    loop {
        if use_polling {
            match sync_inbox(db_path.as_ref(), &account, &mailbox, Some(40)).await {
                Ok(res) if res.fetched_uids > 0 => {
                    on_push(ImapPushEvent {
                        account_id: account_id.clone(),
                        mailbox: mailbox.clone(),
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
            sleep(Duration::from_secs(POLL_FALLBACK_SECS)).await;
            continue;
        }

        match idle_inbox_once(&account, &mailbox).await {
            Ok(IdleOutcome::NewMail) => {
                backoff_secs = BACKOFF_INITIAL_SECS;
                if let Ok(res) = sync_inbox(db_path.as_ref(), &account, &mailbox, Some(40)).await {
                    if res.fetched_uids > 0 {
                        on_push(ImapPushEvent {
                            account_id: account_id.clone(),
                            mailbox: mailbox.clone(),
                            reason: "idle-exists".into(),
                        });
                    }
                }
            }
            Ok(IdleOutcome::Timeout | IdleOutcome::Interrupted) => {
                backoff_secs = BACKOFF_INITIAL_SECS;
                // Rattrapage périodique (~28 min max en IDLE) : nouveaux mails sans notification EXISTS.
                if let Ok(res) = sync_inbox(db_path.as_ref(), &account, &mailbox, Some(40)).await {
                    if res.fetched_uids > 0 {
                        on_push(ImapPushEvent {
                            account_id: account_id.clone(),
                            mailbox: mailbox.clone(),
                            reason: "idle-timeout-sync".into(),
                        });
                    }
                }
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

async fn idle_inbox_once(account: &Account, mailbox: &str) -> Result<IdleOutcome, String> {
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
