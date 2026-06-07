use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct MailboxId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum MailboxKind {
    Inbox,
    Sent,
    Drafts,
    Archive,
    Trash,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Mailbox {
    pub id: MailboxId,
    pub name: String,
    pub kind: MailboxKind,
    pub unread_count: u32,
    pub total_count: u32,
}
