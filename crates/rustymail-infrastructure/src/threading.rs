//! Identifiants de fil déterministes (alignés entre copie locale post-envoi et sync IMAP).

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

/// Même clé que lors de l’import IMAP (`thread_id_for_root` historique dans `imap/sync.rs`).
pub fn thread_id_for_root(account_id: &str, mailbox: &str, root: &str) -> String {
    let mut hasher = DefaultHasher::new();
    account_id.to_ascii_lowercase().hash(&mut hasher);
    mailbox.to_ascii_lowercase().hash(&mut hasher);
    root.to_ascii_lowercase().hash(&mut hasher);
    format!("t-{:016x}", hasher.finish())
}
