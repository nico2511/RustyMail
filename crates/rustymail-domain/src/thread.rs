use crate::{Attachment, EmailAddress, Entity, MailSecuritySignals, Message, Tag};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct ThreadId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Thread {
    pub id: ThreadId,
    pub subject: String,
    pub messages: Vec<Message>,
    pub tags: Vec<Tag>,
    pub entities: Vec<Entity>,
    /// Suivi local (drapeau SQLite `threads.is_followed`) — indépendant des flags IMAP.
    #[serde(default)]
    pub followed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadListItem {
    pub id: ThreadId,
    pub subject: String,
    pub preview: String,
    pub participants: Vec<String>,
    pub last_activity: String,
    pub message_count: usize,
    pub unread: bool,
    /// Suivi local SQLite (`threads.is_followed`) — ce que reflète le bouton « Suivre ce fil ».
    #[serde(default)]
    pub followed: bool,
    /// Mis en avant : suivi local **ou** au moins un message marqué épinglé côté IMAP.
    pub pinned: bool,
    pub tags: Vec<Tag>,
    /// Dossier IMAP où vit le fil (liste, recherche multi-dossiers).
    #[serde(default)]
    pub mailbox: String,
    /// Compte propriétaire du fil (liste unifiée / badge UI). Absent sur les chemins legacy.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    /// Nombre total d’entrées `attachments` sur les messages du fil (SQLite).
    #[serde(default)]
    pub attachment_count: usize,
    /// Dernier message entrant couvert par une règle « expéditeur automatique » (liste / recherche).
    #[serde(default)]
    pub is_newsletter_thread: bool,
}

/// Qui a réellement structuré le HTML (hors sanitation générique seule).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HtmlCleaningProviderKind {
    #[default]
    Generic,
    Amazon,
    Deblock,
    #[serde(rename = "github")]
    GitHub,
}

impl Thread {
    pub fn list_item(&self, mailbox: impl Into<String>) -> ThreadListItem {
        let last = self.messages.last();
        let mut participants = Vec::new();
        for message in &self.messages {
            let name = message.display_sender();
            if !participants.contains(&name) {
                participants.push(name);
            }
        }

        let attachment_count: usize = self.messages.iter().map(|m| m.attachments.len()).sum();
        let any_msg_pinned = self.messages.iter().any(|message| message.is_pinned);

        ThreadListItem {
            id: self.id.clone(),
            subject: self.subject.clone(),
            preview: last
                .map(|message| {
                    message
                        .plain_body
                        .lines()
                        .next()
                        .unwrap_or_default()
                        .to_string()
                })
                .unwrap_or_default(),
            participants,
            last_activity: last
                .map(|message| message.received_at.clone())
                .unwrap_or_default(),
            message_count: self.messages.len(),
            unread: self.messages.iter().any(|message| !message.is_read),
            followed: self.followed,
            pinned: self.followed || any_msg_pinned,
            tags: self.tags.clone(),
            mailbox: mailbox.into(),
            account_id: None,
            attachment_count,
            is_newsletter_thread: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CleanedMessageView {
    pub message_id: String,
    pub sender: String,
    /// Adresse expéditeur brute (pour règles « expéditeur automatique »).
    #[serde(default)]
    pub sender_email: String,
    #[serde(default)]
    pub is_newsletter: bool,
    /// Langue du corps (SQLite / sync IMAP), ISO 639-1 ou `und` ; absent si inconnu.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detected_lang: Option<String>,
    pub received_at: String,
    pub source_text: String,
    pub cleaned_text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html_body: Option<String>,
    /// HTML après nettoyage générique + plugin expéditeur (prêt pour conversion HTML→Markdown).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cleaned_html_body: Option<String>,
    /// Présent seulement s’il y avait une partie HTML : plugin qui domine après la résolution registry (`Generic` = sanitation seule).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html_cleaning_provider: Option<HtmlCleaningProviderKind>,
    pub collapsed_quotes: Vec<String>,
    pub dimmed_blocks: Vec<String>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    /// Destinataires To + Cc fusionnés (aligné sur `Message::recipients`), pour diff d’enveloppe entre messages.
    #[serde(default)]
    pub recipients: Vec<EmailAddress>,
    pub tags: Vec<Tag>,
    pub entities: Vec<Entity>,
    pub mail_security: MailSecuritySignals,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscussionThreadView {
    pub id: ThreadId,
    pub subject: String,
    pub messages: Vec<CleanedMessageView>,
    pub tags: Vec<Tag>,
    pub entities: Vec<Entity>,
    /// Dernier message entrant couvert par une règle « expéditeur automatique » (domaine + locale).
    #[serde(default)]
    pub is_newsletter_thread: bool,
    /// Au moins un message non lu (barre d’outils quand le fil n’est pas dans la liste affichée).
    #[serde(default)]
    pub unread: bool,
}
