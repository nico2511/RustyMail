//! Mutex async par compte : sérialise MOVE / sync IMAP pour éviter qu’une sync
//! en vol réécrive des messages juste après un DELETE local.

use std::collections::HashMap;
use std::future::Future;
use std::sync::{Mutex, OnceLock};

use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

static ACCOUNT_LOCKS: OnceLock<Mutex<HashMap<String, std::sync::Arc<AsyncMutex<()>>>>> =
    OnceLock::new();

fn locks() -> &'static Mutex<HashMap<String, std::sync::Arc<AsyncMutex<()>>>> {
    ACCOUNT_LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock_for_account(account_id: &str) -> std::sync::Arc<AsyncMutex<()>> {
    let key = account_id.trim().to_string();
    let mut map = locks().lock().unwrap_or_else(|e| e.into_inner());
    map.entry(key)
        .or_insert_with(|| std::sync::Arc::new(AsyncMutex::new(())))
        .clone()
}

/// Acquiert le verrou IMAP du compte (à garder jusqu’à la fin de l’opération).
pub async fn acquire_account_imap_lock(account_id: &str) -> OwnedMutexGuard<()> {
    lock_for_account(account_id).lock_owned().await
}

/// Exécute `f` sous le verrou IMAP du compte.
pub async fn with_account_imap_lock<T, F, Fut>(account_id: &str, f: F) -> T
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = T>,
{
    let _guard = acquire_account_imap_lock(account_id).await;
    f().await
}
