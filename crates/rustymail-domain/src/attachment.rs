use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct AttachmentId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AttachmentKind {
    Inline,
    Regular,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: AttachmentId,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub kind: AttachmentKind,
    /// Identifiant `Content-ID` normalisé (sans `<>`), correspond à `cid:` dans le HTML.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_id: Option<String>,
}
