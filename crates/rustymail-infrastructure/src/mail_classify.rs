//! Classification déterministe du type de mail (sans LLM).

use rustymail_domain::{MailType, Tag, TagFamily, ThreadPriorityScore};

use crate::newsletter::{matches_newsletter_email, NewsletterRule};

const TRANSACTIONAL_RX: &[&str] = &[
    "facture",
    "invoice",
    "reçu",
    "recu",
    "échéance",
    "echeance",
    "paiement",
    "payment",
    "relevé",
    "releve",
    "commande",
    "order",
    "receipt",
];

/// Préfixes courants d’expéditeurs transactionnels (partie locale avant `@`).
const TRANSACTIONAL_LOCAL: &[&str] = &[
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
    "notification",
    "notifications",
    "billing",
    "invoice",
    "invoices",
    "orders",
    "order",
    "receipt",
    "receipts",
    "payment",
    "payments",
    "facturation",
    "accounting",
    "accounts",
];

/// Préfixes locaux typiques d’expéditeurs automatiques (notifications).
const NOREPLY_LOCAL: &[&str] = &[
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
    "notification",
    "notifications",
    "alert",
    "alerts",
    "mailer-daemon",
    "postmaster",
    "automated",
];

/// Mots-clés sujet typiques de notifications (alertes / sécurité / mot de passe).
#[allow(dead_code)]
const NOTIFICATION_SUBJECT_RX: &[&str] = &[
    "alert",
    "alerte",
    "security",
    "securit",
    "password",
    "mot de passe",
    "verification",
    "verify your",
    "2fa",
    "otp",
    "login code",
    "signed in",
    "sign-in",
    "new device",
    "connexion",
];

fn local_part(email: &str) -> String {
    let e = email.trim().to_ascii_lowercase();
    e.split('@')
        .next()
        .unwrap_or("")
        .trim_matches(|c| c == '<' || c == '>')
        .to_string()
}

fn local_part_matches_prefixes(local: &str, prefixes: &[&str]) -> bool {
    prefixes.iter().any(|p| {
        local == *p
            || local.starts_with(&format!("{p}."))
            || local.starts_with(&format!("{p}+"))
            || local.ends_with(&format!(".{p}"))
    })
}

fn local_part_matches_transactional(local: &str) -> bool {
    local_part_matches_prefixes(local, TRANSACTIONAL_LOCAL)
}

/// Expéditeur transactionnel : préfixe local connu **et** mot-clé sujet (facture / commande…).
pub fn sender_is_transactional(email: &str, subject: &str) -> bool {
    let local = local_part(email);
    let sender_signal = local_part_matches_transactional(&local);
    let subject_signal = subject_has_transactional_keywords(subject);
    sender_signal && subject_signal
}

/// Expéditeur « noreply-like » (automatique).
pub fn sender_is_noreply_like(email: &str) -> bool {
    let local = local_part(email);
    if local.is_empty() {
        return false;
    }
    local_part_matches_prefixes(&local, NOREPLY_LOCAL)
}

fn subject_has_transactional_keywords(subject: &str) -> bool {
    let s = subject.to_ascii_lowercase();
    TRANSACTIONAL_RX.iter().any(|k| s.contains(k))
}

#[allow(dead_code)]
fn subject_has_notification_keywords(subject: &str) -> bool {
    let s = subject.to_ascii_lowercase();
    NOTIFICATION_SUBJECT_RX.iter().any(|k| s.contains(k))
}

/// Classification déterministe : transactional → newsletter → notification → conversation.
pub fn classify_mail_type(
    sender_email: &str,
    subject: &str,
    has_list_unsubscribe: bool,
    rules: &[NewsletterRule],
) -> MailType {
    if sender_is_transactional(sender_email, subject) {
        return MailType::Transactional;
    }
    if matches_newsletter_email(sender_email, rules) || has_list_unsubscribe {
        return MailType::Newsletter;
    }
    // noreply-like sans mots-clés transactionnels → Notification
    // (alert / security / password = exemples typiques de sujets).
    if sender_is_noreply_like(sender_email) && !subject_has_transactional_keywords(subject) {
        return MailType::Notification;
    }
    MailType::Conversation
}

/// Valeur stable pour la colonne SQLite `threads.mail_type`.
pub fn mail_type_db_value(mail_type: MailType) -> &'static str {
    match mail_type {
        MailType::Conversation => "conversation",
        MailType::Newsletter => "newsletter",
        MailType::Transactional => "transactional",
        MailType::Notification => "notification",
    }
}

/// Remplace les tags `kind:` de type mail par celui dérivé de [`MailType`].
pub fn apply_mail_type_tag(tags: &mut Vec<Tag>, mail_type: MailType) {
    const MAIL_TYPE_KINDS: &[&str] = &[
        "discussion",
        "conversation",
        "newsletter",
        "marketing",
        "transactional",
        "notification",
    ];
    tags.retain(|t| {
        !(t.family == TagFamily::Kind
            && MAIL_TYPE_KINDS
                .iter()
                .any(|k| t.value.eq_ignore_ascii_case(k)))
    });
    let kind = Tag::kind(mail_type.as_kind_tag_value());
    if !tags.contains(&kind) {
        tags.push(kind);
    }
}

/// Variante CSV : parse → applique → re-sérialise.
pub fn apply_mail_type_tag_csv(tags_csv: &str, mail_type: MailType) -> String {
    let mut tags = crate::parse_tags(tags_csv);
    apply_mail_type_tag(&mut tags, mail_type);
    tags.iter()
        .map(Tag::as_filter)
        .collect::<Vec<_>>()
        .join(",")
}

/// Score de priorité local (enveloppe autour de [`ThreadPriorityScore::compose`]).
pub fn priority_score_for_thread(
    unread: bool,
    followed: bool,
    sender_engagement_0_100: f32,
    semantic_0_1: f32,
) -> ThreadPriorityScore {
    ThreadPriorityScore::compose(unread, followed, sender_engagement_0_100, semantic_0_1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::newsletter::NewsletterRule;

    #[test]
    fn classify_transactional_wins() {
        let rules = vec![NewsletterRule {
            domain: "sendgrid.net".into(),
            local_part: "*".into(),
        }];
        assert_eq!(
            classify_mail_type(
                "billing@notify.sendgrid.net",
                "Votre facture",
                true,
                &rules
            ),
            MailType::Transactional
        );
    }

    #[test]
    fn classify_newsletter_from_rules() {
        let rules = vec![NewsletterRule {
            domain: "mailchimp.com".into(),
            local_part: "*".into(),
        }];
        assert_eq!(
            classify_mail_type("x@mailchimp.com", "This week", false, &rules),
            MailType::Newsletter
        );
    }

    #[test]
    fn classify_newsletter_from_list_unsubscribe() {
        assert_eq!(
            classify_mail_type("editor@mag.example", "Weekly", true, &[]),
            MailType::Newsletter
        );
    }

    #[test]
    fn classify_notification_noreply_without_tx_subject() {
        assert_eq!(
            classify_mail_type(
                "noreply@bank.example",
                "Security alert on your account",
                false,
                &[]
            ),
            MailType::Notification
        );
        assert!(subject_has_notification_keywords(
            "Security alert on your account"
        ));
        assert_eq!(
            classify_mail_type("noreply@svc.example", "Hello from us", false, &[]),
            MailType::Notification
        );
    }

    #[test]
    fn classify_conversation_default() {
        assert_eq!(
            classify_mail_type("alice@friends.example", "Lunch tomorrow?", false, &[]),
            MailType::Conversation
        );
    }

    #[test]
    fn apply_mail_type_tag_replaces_previous() {
        let mut tags = vec![
            Tag::source("imap"),
            Tag::kind("newsletter"),
            Tag::kind("inbox"),
        ];
        apply_mail_type_tag(&mut tags, MailType::Transactional);
        let csv = tags
            .iter()
            .map(Tag::as_filter)
            .collect::<Vec<_>>()
            .join(",");
        assert!(csv.contains("kind:transactional"));
        assert!(!csv.contains("kind:newsletter"));
        assert!(csv.contains("kind:inbox"));
    }

    #[test]
    fn priority_score_wraps_compose() {
        let s = priority_score_for_thread(true, true, 40.0, 0.5);
        assert!(
            (s.score - ThreadPriorityScore::compose(true, true, 40.0, 0.5).score).abs() < 0.01
        );
        assert!(s.total() >= 25.0 + 30.0);
    }

    #[test]
    fn sender_is_transactional_billing_with_invoice_subject() {
        assert!(sender_is_transactional(
            "billing@shop.example",
            "Your invoice #42"
        ));
    }
}
