use crate::EmailAddress;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct DraftId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DraftKind {
    New,
    Reply,
    Forward,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: DraftId,
    pub kind: DraftKind,
    pub to: Vec<EmailAddress>,
    #[serde(default)]
    pub cc: Vec<EmailAddress>,
    #[serde(default)]
    pub bcc: Vec<EmailAddress>,
    pub subject: String,
    pub markdown_body: String,
    #[serde(default)]
    pub send_html: bool,
    #[serde(default)]
    pub in_reply_to: Option<String>,
    #[serde(default)]
    pub references: Vec<String>,
    #[serde(default, alias = "attachment_paths")]
    pub attachment_paths: Vec<String>,
    /// Fil SQLite/courriel auquel rattacher une copie locale du message envoyé (réponses, transferts depuis un fil).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
}

impl Draft {
    pub fn validate(&self) -> Result<(), DraftValidationError> {
        if self.to.is_empty() {
            return Err(DraftValidationError::MissingRecipient);
        }
        if self.subject.trim().is_empty() {
            return Err(DraftValidationError::MissingSubject);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DraftValidationError {
    MissingRecipient,
    MissingSubject,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DraftPreview {
    pub text_plain: String,
    pub html: String,
}
