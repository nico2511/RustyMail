use rustymail_domain::Message;

/// Stable identifier for readability / telemetry. Extend with new variants when adding plugins.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum ProviderId {
    Generic,
    Amazon,
    Deblock,
    GitHub,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum DetectionConfidence {
    None,
    Weak,
    Strong,
}

/// Inputs needed for detection and cleaning. RFC `List-Unsubscribe` (and kin) can be added once stored on [`Message`](rustymail_domain::Message).
#[derive(Debug, Clone)]
pub struct CleaningInput<'a> {
    pub sender_email: &'a str,
    pub subject: &'a str,
    pub html_preview: Option<&'a str>,
    /// Corps texte brut (MIME `text/plain` déjà décodé) pour les mails où le HTML dilue les infos métier (ex. accusé Amazon + reco).
    pub plain_body: Option<&'a str>,
}

impl<'a> CleaningInput<'a> {
    pub fn from_message(message: &'a Message) -> Self {
        let plain_trim = message.plain_body.trim();
        Self {
            sender_email: message.sender.email.as_str(),
            subject: message.subject.as_str(),
            html_preview: message.html_body.as_deref(),
            plain_body: if plain_trim.is_empty() {
                None
            } else {
                Some(message.plain_body.as_str())
            },
        }
    }
}

#[derive(Debug, Clone)]
pub struct CleanHtmlResult {
    pub html: String,
    pub resolved_provider: ProviderId,
    pub generic_rule_set_version: &'static str,
    pub provider_rule_set_version: Option<&'static str>,
    /// Optional trace (rule IDs, fallbacks). Keep small in hot paths.
    pub diagnostics: Vec<String>,
    /// Texte structuré pour l'IA quand un rapport conversationnel Outlook est produit.
    pub conversation_text: Option<String>,
}
