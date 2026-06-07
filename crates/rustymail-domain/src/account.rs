use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct AccountId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SecurityMode {
    StartTls,
    Tls,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerSettings {
    pub host: String,
    pub port: u16,
    pub security: SecurityMode,
    #[serde(default)]
    pub allow_invalid_tls: bool,
}

/// Mode d’authentification du compte (mot de passe IMAP classique ou OAuth2 « Modern Auth »).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum MailAuthKind {
    #[default]
    Password,
    OauthGoogle,
    OauthMicrosoft,
}

impl MailAuthKind {
    pub fn as_db_str(&self) -> &'static str {
        match self {
            MailAuthKind::Password => "password",
            MailAuthKind::OauthGoogle => "oauth_google",
            MailAuthKind::OauthMicrosoft => "oauth_microsoft",
        }
    }

    pub fn from_db_str(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "oauth_google" => MailAuthKind::OauthGoogle,
            "oauth_microsoft" => MailAuthKind::OauthMicrosoft,
            _ => MailAuthKind::Password,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: AccountId,
    pub display_name: String,
    pub email: String,
    pub imap: ServerSettings,
    pub smtp: ServerSettings,
    #[serde(default)]
    pub auth_kind: MailAuthKind,
}

impl Account {
    pub fn validate(&self) -> Result<(), AccountValidationError> {
        if !self.email.contains('@') {
            return Err(AccountValidationError::InvalidEmail);
        }
        if self.imap.host.trim().is_empty() || self.smtp.host.trim().is_empty() {
            return Err(AccountValidationError::MissingServerHost);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AccountValidationError {
    InvalidEmail,
    MissingServerHost,
}
