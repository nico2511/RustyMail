mod session;

mod idle_push;
pub mod ops;
mod sent_append;
mod sync;

pub use idle_push::{ImapIdleCoordinator, ImapPushEvent};
pub use ops::list_mailboxes;
pub use sent_append::{imap_append_sent_copy, ImapSentCopyOutcome};
pub use session::{login_session, login_session_for_account, map_imap_error, ImapSession};
pub use sync::{
    sync_inbox, sync_mailboxes_single_session, ImapSyncResult, SyncMailboxAlias,
    SyncMailboxesOutcome,
};
