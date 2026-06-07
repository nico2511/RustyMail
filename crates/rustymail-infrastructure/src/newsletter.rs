//! Détection newsletter : règles **domaine + partie locale** (`local@domaine`).
//! `local_part == "*"` signifie n’importe quelle locale sur ce suffixe de domaine (comportement historique « domaine seul »).

use std::path::Path;

use rusqlite::{params, Connection};
use rustymail_domain::{DiscussionThreadView, Thread};
use serde::{Deserialize, Serialize};

/// Règle stockée : suffixe DNS + partie locale exacte, ou `"*"` pour toutes les locales sur ce domaine.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterRule {
    pub domain: String,
    /// `"*"` = toute adresse dont le domaine matche le suffixe `domain`.
    pub local_part: String,
}

/// Domaines d’ESP / builders — insérés `(domain, '*')` à chaque migration.
pub const DEFAULT_NEWSLETTER_DOMAIN_SEEDS: &[&str] = &[
    "substack.com",
    "beehiiv.com",
    "mail.beehiiv.com",
    "convertkit.com",
    "kit.com",
    "buttondown.email",
    "ghost.org",
    "revue.co",
    "mcsv.net",
    "mailchimpapp.net",
    "mcdlv.net",
    "rsgsv.net",
    "mailchimp.com",
    "sendgrid.net",
    "sgmail.com",
    "amazonses.com",
    "mailgun.org",
    "mg.mailgun.org",
    "brevo.com",
    "mailerlite.com",
    "aweber.com",
    "campaignmonitor.com",
    "klaviyo.com",
    "omnisend.com",
    "flodesk.com",
    "getresponse.com",
    "activecampaign.com",
    "moosend.com",
    "mailjet.com",
    "postmarkapp.com",
    "tinyletter.com",
    "submail.com",
    "sendinblue.com",
    "sparkpost.com",
    "elasticemail.com",
    "pepipost.com",
    "smtp2go.com",
    "constantcontact.com",
    "icontact.com",
    "hubspotemail.net",
    "hubspot.com",
    "list-manage.com",
    "mandrillapp.com",
    "bnc3.mailjet.com",
];

/// Exemples retail : seules ces locales sont bloquées, pas `sav@…`.
const DEFAULT_NEWSLETTER_LOCAL_SEEDS: &[(&str, &str)] = &[
    ("amazon.com", "noreply"),
    ("amazon.com", "order-update"),
    ("amazon.com", "shipment-tracking"),
    ("amazon.fr", "noreply"),
    ("amazon.fr", "order-update"),
];

/// Partie domaine après `@`, normalisée en minuscules.
pub fn host_of_email(email: &str) -> Option<String> {
    rustymail_domain::host_of_email(email)
}

fn local_of_email(email: &str) -> Option<String> {
    let email = email.trim().to_ascii_lowercase();
    let (local, _) = email.rsplit_once('@')?;
    let local = local.trim().trim_matches(|c| c == '>' || c == '<');
    if local.is_empty() {
        return None;
    }
    Some(local.to_string())
}

pub fn host_matches_suffix(host: &str, domain: &str) -> bool {
    let host = host.trim().to_ascii_lowercase();
    let d = domain.trim().to_ascii_lowercase();
    if d.is_empty() {
        return false;
    }
    host == d || host.ends_with(&format!(".{d}"))
}

/// `email` complet en minuscules conseillé ; `rules` normalisées.
pub fn matches_newsletter_email(email: &str, rules: &[NewsletterRule]) -> bool {
    let email = email.trim().to_ascii_lowercase();
    let Some(host) = host_of_email(&email) else {
        return false;
    };
    let Some(local) = local_of_email(&email) else {
        return false;
    };
    for rule in rules {
        if !host_matches_suffix(&host, &rule.domain) {
            continue;
        }
        let lp = rule.local_part.trim().to_ascii_lowercase();
        if lp == "*" || lp == local {
            return true;
        }
    }
    false
}

fn sender_is_account(sender_email: &str, account_emails: &[String]) -> bool {
    let s = sender_email.trim().to_ascii_lowercase();
    account_emails.iter().any(|a| a == &s)
}

/// Dernier message non-compte : si l’adresse matche une règle → fil « newsletter ».
pub fn thread_blocks_reply(
    thread: &Thread,
    account_emails: &[String],
    rules: &[NewsletterRule],
) -> bool {
    let mut idx: Vec<usize> = (0..thread.messages.len()).collect();
    idx.sort_by(|&a, &b| {
        thread.messages[a]
            .received_at
            .cmp(&thread.messages[b].received_at)
    });
    for &i in idx.iter().rev() {
        let m = &thread.messages[i];
        let email = m.sender.email.trim();
        if sender_is_account(email, account_emails) {
            continue;
        }
        return matches_newsletter_email(email, rules);
    }
    false
}

/// Met à jour `is_newsletter` par message et `is_newsletter_thread` sur la vue.
pub fn annotate_newsletter_thread(
    view: &mut DiscussionThreadView,
    account_emails: &[String],
    rules: &[NewsletterRule],
) {
    for m in &mut view.messages {
        let email = m.sender_email.trim();
        m.is_newsletter = matches_newsletter_email(email, rules);
    }

    let mut idx: Vec<usize> = (0..view.messages.len()).collect();
    idx.sort_by(|&a, &b| {
        view.messages[a]
            .received_at
            .cmp(&view.messages[b].received_at)
    });
    let mut blocked = false;
    for &i in idx.iter().rev() {
        let m = &view.messages[i];
        if sender_is_account(&m.sender_email, account_emails) {
            continue;
        }
        blocked = m.is_newsletter;
        break;
    }
    view.is_newsletter_thread = blocked;
}

fn table_exists(connection: &Connection, name: &str) -> Result<bool, rusqlite::Error> {
    let n: i64 = connection.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        params![name],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

pub fn newsletter_migrate(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS newsletter_rules (
            domain TEXT NOT NULL,
            local_part TEXT NOT NULL,
            PRIMARY KEY (domain, local_part)
        );
        CREATE INDEX IF NOT EXISTS idx_newsletter_rules_domain ON newsletter_rules(domain);
        ",
    )?;

    if table_exists(connection, "newsletter_domains")? {
        connection.execute(
            "INSERT OR IGNORE INTO newsletter_rules(domain, local_part) SELECT domain, '*' FROM newsletter_domains",
            [],
        )?;
        connection.execute_batch("DROP TABLE IF EXISTS newsletter_domains;")?;
    }

    seed_newsletter_rules(connection)?;
    Ok(())
}

fn seed_newsletter_rules(connection: &Connection) -> Result<(), rusqlite::Error> {
    for d in DEFAULT_NEWSLETTER_DOMAIN_SEEDS {
        connection.execute(
            "INSERT OR IGNORE INTO newsletter_rules (domain, local_part) VALUES (?1, '*')",
            params![*d],
        )?;
    }
    for (domain, local) in DEFAULT_NEWSLETTER_LOCAL_SEEDS {
        connection.execute(
            "INSERT OR IGNORE INTO newsletter_rules (domain, local_part) VALUES (?1, ?2)",
            params![*domain, *local],
        )?;
    }
    Ok(())
}

pub fn list_newsletter_rules(db_path: &Path) -> Result<Vec<NewsletterRule>, rusqlite::Error> {
    let connection = crate::open_sqlite_migrated(db_path)?;
    list_newsletter_rules_connection(&connection)
}

/// Liste les règles sans ouvrir une nouvelle connexion (partage avec le chemin liste fils).
pub fn list_newsletter_rules_connection(connection: &Connection) -> Result<Vec<NewsletterRule>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "SELECT domain, local_part FROM newsletter_rules ORDER BY lower(domain), lower(local_part)",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(NewsletterRule {
            domain: row.get(0)?,
            local_part: row.get(1)?,
        })
    })?;
    rows.collect()
}

/// Interprète `domaine` seul → `*@domaine`, ou `local@domaine`, ou `*.domaine` pour toute locale.
pub fn parse_newsletter_rule_input(raw: &str) -> Result<NewsletterRule, String> {
    let s = raw.trim().to_ascii_lowercase();
    if s.is_empty() {
        return Err("entrée vide".into());
    }
    if let Some(rest) = s.strip_prefix("*.") {
        let domain = normalize_domain_part(rest)?;
        return Ok(NewsletterRule {
            domain,
            local_part: "*".into(),
        });
    }
    if s.contains('@') {
        let (local, host) = s
            .rsplit_once('@')
            .ok_or_else(|| "adresse invalide".to_string())?;
        let local = local.trim();
        let domain = normalize_domain_part(host)?;
        if local.is_empty() {
            return Err("partie locale vide".into());
        }
        if local.contains('@') {
            return Err("trop de @".into());
        }
        return Ok(NewsletterRule {
            domain,
            local_part: local.to_string(),
        });
    }
    Ok(NewsletterRule {
        domain: normalize_domain_part(&s)?,
        local_part: "*".into(),
    })
}

fn normalize_domain_part(host: &str) -> Result<String, String> {
    let s = host.trim().to_ascii_lowercase();
    if s.is_empty() {
        return Err("domaine vide".into());
    }
    if s.contains('@') {
        return Err("domaine invalide".into());
    }
    if !s.contains('.') {
        return Err("indiquez un domaine avec au moins un point (ex. amazon.fr)".into());
    }
    if s.len() > 200 {
        return Err("domaine trop long".into());
    }
    if s.starts_with('.') || s.ends_with('.') {
        return Err("domaine invalide".into());
    }
    Ok(s)
}

pub fn add_newsletter_rule(db_path: &Path, raw: String) -> Result<(), String> {
    let rule = parse_newsletter_rule_input(&raw)?;
    let connection = crate::open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    connection
        .execute(
            "INSERT OR REPLACE INTO newsletter_rules (domain, local_part) VALUES (?1, ?2)",
            params![rule.domain, rule.local_part],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_newsletter_rule(
    db_path: &Path,
    domain: String,
    local_part: String,
) -> Result<(), String> {
    let domain = normalize_domain_part(&domain)?;
    let lp = local_part.trim().to_ascii_lowercase();
    if lp.is_empty() {
        return Err("partie locale manquante (utilisez * pour toute locale)".into());
    }
    let connection = crate::open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    connection
        .execute(
            "DELETE FROM newsletter_rules WHERE domain = ?1 AND lower(local_part) = lower(?2)",
            params![domain, lp],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::Thread;

    #[test]
    fn host_of_email_basic() {
        assert_eq!(
            host_of_email("Foo@Substack.COM"),
            Some("substack.com".into())
        );
        assert_eq!(host_of_email("<x@y.z>"), Some("y.z".into()));
        assert_eq!(host_of_email("bad"), None);
    }

    #[test]
    fn matches_wildcard_domain() {
        let rules = vec![NewsletterRule {
            domain: "mailchimp.com".into(),
            local_part: "*".into(),
        }];
        assert!(matches_newsletter_email("x@mailchimp.com", &rules));
        assert!(matches_newsletter_email("a@x.mailchimp.com", &rules));
        assert!(!matches_newsletter_email("a@evil-mailchimp.com", &rules));
    }

    #[test]
    fn amazon_noreply_vs_sav() {
        let rules = vec![
            NewsletterRule {
                domain: "amazon.fr".into(),
                local_part: "noreply".into(),
            },
            NewsletterRule {
                domain: "amazon.fr".into(),
                local_part: "order-update".into(),
            },
        ];
        assert!(matches_newsletter_email("noreply@amazon.fr", &rules));
        assert!(matches_newsletter_email("order-update@amazon.fr", &rules));
        assert!(!matches_newsletter_email("sav@amazon.fr", &rules));
    }

    #[test]
    fn thread_blocks_reply_last_inbound() {
        let mut t = Thread {
            id: rustymail_domain::ThreadId("1".into()),
            subject: "s".into(),
            tags: vec![],
            entities: vec![],
            messages: vec![
                rustymail_domain::Message {
                    id: rustymail_domain::MessageId("a".into()),
                    sender: rustymail_domain::EmailAddress {
                        name: None,
                        email: "n@substack.com".into(),
                    },
                    recipients: vec![],
                    reply_to: vec![],
                    subject: "".into(),
                    received_at: "2020-01-01T10:00:00Z".into(),
                    plain_body: "".into(),
                    html_body: None,
                    references: rustymail_domain::MessageReferences {
                        message_id_header: None,
                        in_reply_to: None,
                        references: vec![],
                    },
                    attachments: vec![],
                    tags: vec![],
                    detected_lang: None,
                    is_read: true,
                    is_pinned: false,
                    authentication_results: None,
                    return_path: None,
                },
                rustymail_domain::Message {
                    id: rustymail_domain::MessageId("b".into()),
                    sender: rustymail_domain::EmailAddress {
                        name: None,
                        email: "me@company.test".into(),
                    },
                    recipients: vec![],
                    reply_to: vec![],
                    subject: "".into(),
                    received_at: "2020-01-02T10:00:00Z".into(),
                    plain_body: "".into(),
                    html_body: None,
                    references: rustymail_domain::MessageReferences {
                        message_id_header: None,
                        in_reply_to: None,
                        references: vec![],
                    },
                    attachments: vec![],
                    tags: vec![],
                    detected_lang: None,
                    is_read: true,
                    is_pinned: false,
                    authentication_results: None,
                    return_path: None,
                },
            ],
            followed: false,
        };
        let rules = vec![NewsletterRule {
            domain: "substack.com".into(),
            local_part: "*".into(),
        }];
        let accounts = vec!["me@company.test".to_string()];
        assert!(thread_blocks_reply(&t, &accounts, &rules));
        t.messages[0].sender.email = "friend@gmail.com".into();
        assert!(!thread_blocks_reply(&t, &accounts, &rules));
    }
}
