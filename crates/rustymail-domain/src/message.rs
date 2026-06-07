use crate::{Attachment, Tag};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct MessageId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EmailAddress {
    pub name: Option<String>,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MessageReferences {
    pub message_id_header: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Message {
    pub id: MessageId,
    pub sender: EmailAddress,
    pub recipients: Vec<EmailAddress>,
    /// Adresses issues de l’en-tête `Reply-To` (vide si absent).
    pub reply_to: Vec<EmailAddress>,
    pub subject: String,
    pub received_at: String,
    pub plain_body: String,
    pub html_body: Option<String>,
    pub references: MessageReferences,
    pub attachments: Vec<Attachment>,
    pub tags: Vec<Tag>,
    /// ISO 639-1 from lightweight detection (`und` if unknown). Persisted in SQLite for IMAP mail.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detected_lang: Option<String>,
    pub is_read: bool,
    pub is_pinned: bool,
    /// En-tête `Authentication-Results` brut si stocké (SPF/DKIM/DMARC côté serveur récepteur).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authentication_results: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub return_path: Option<String>,
}

impl Message {
    pub fn display_sender(&self) -> String {
        self.sender
            .name
            .clone()
            .unwrap_or_else(|| self.sender.email.clone())
    }
}
