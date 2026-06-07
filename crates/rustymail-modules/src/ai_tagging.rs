use rustymail_domain::{canonical_source_domain, host_of_email, Entity, EntityKind, Message, Tag};

/// Tags `kind:*` décrivant le contenu (recherche), distincts du dossier IMAP (`kind:inbox`, etc.).
pub const MESSAGE_CONTENT_KINDS: &[&str] = &[
    "securite",
    "facture",
    "commande",
    "livraison",
    "finance",
    "coordination",
    "document",
    "marketing",
    "support",
    "discussion",
];

struct KindRule {
    kind: &'static str,
    keywords: &'static [&'static str],
}

/// Premier motif trouvé gagne (du plus spécifique au plus générique).
const KIND_RULES: &[KindRule] = &[
    KindRule {
        kind: "securite",
        keywords: &[
            "verification code",
            "one-time password",
            "one time password",
            "mot de passe",
            "password reset",
            "reset your password",
            "code de verification",
            "code de vérification",
            "otp",
            "2fa",
            "two-factor",
            "connexion suspecte",
            "suspicious sign-in",
            "sign-in attempt",
            "security alert",
            "alerte de sécurité",
            "alerte de securite",
        ],
    },
    KindRule {
        kind: "facture",
        keywords: &[
            "invoice",
            "facture",
            "facturation",
            "billing statement",
            "your bill",
            "votre facture",
        ],
    },
    KindRule {
        kind: "commande",
        keywords: &[
            "order confirmation",
            "order confirmed",
            "your order",
            "votre commande",
            "commande confirmée",
            "commande confirmee",
            "purchase confirmation",
        ],
    },
    KindRule {
        kind: "livraison",
        keywords: &[
            "out for delivery",
            "has shipped",
            "order shipped",
            "suivi de colis",
            "suivi colis",
            "numéro de suivi",
            "numero de suivi",
            "tracking number",
            "delivery update",
            "livraison prévue",
            "livraison prevue",
            "colis en route",
        ],
    },
    KindRule {
        kind: "finance",
        keywords: &[
            "relevé de compte",
            "releve de compte",
            "bank statement",
            "account statement",
            "virement",
            "wire transfer",
            "prélèvement",
            "prelevement",
            "direct debit",
            "assurance",
            "insurance policy",
            "police d'assurance",
            "banque",
            "banking",
            "credit card",
            "carte bancaire",
            "iban",
            "rib",
        ],
    },
    KindRule {
        kind: "coordination",
        keywords: &[
            "deadline",
            "échéance",
            "echeance",
            "due date",
            "action required by",
            "réunion",
            "reunion",
            "meeting invite",
            "calendar invite",
            "invitation: ",
            "rsvp",
            "confirmez votre présence",
            "confirmez votre presence",
        ],
    },
    KindRule {
        kind: "document",
        keywords: &[
            "sign the document",
            "signature required",
            "signature requise",
            "contrat",
            "contract",
            "document signé",
            "document signe",
            "docusign",
            "you have a document",
        ],
    },
    KindRule {
        kind: "marketing",
        keywords: &[
            "limited time offer",
            "offre limitée",
            "offre limitee",
            "promo code",
            "code promo",
            "% off",
            "soldes",
            "black friday",
            "newsletter",
            "désabonn",
            "desabonn",
            "unsubscribe",
        ],
    },
    KindRule {
        kind: "support",
        keywords: &[
            "support ticket",
            "ticket #",
            "case #",
            "helpdesk",
            "help desk",
            "customer support",
            "service client",
            "your request has been",
        ],
    },
    KindRule {
        kind: "discussion",
        keywords: &[
            "see you",
            "à bientôt",
            "a bientot",
            "launch party",
            "birthday",
            "anniversaire",
            "merci beaucoup",
            "thank you for",
            "thanks for",
            "catch up",
            "prendre un café",
            "prendre un cafe",
        ],
    },
];

pub fn is_message_content_kind(value: &str) -> bool {
    let v = value.trim().to_ascii_lowercase();
    MESSAGE_CONTENT_KINDS.iter().any(|k| *k == v)
}

/// Infère un tag `kind:*` de contenu à partir du sujet et du corps (FR/EN).
pub fn infer_content_kind(subject: &str, body: &str) -> Option<&'static str> {
    let subject_lc = subject.to_ascii_lowercase();
    let body_lc = body.to_ascii_lowercase();
    let combined = format!("{subject_lc}\n{body_lc}");
    for rule in KIND_RULES {
        if rule.keywords.iter().any(|k| combined.contains(k)) {
            return Some(rule.kind);
        }
    }
    None
}

pub fn tag_message(message: &Message, entities: &[Entity]) -> Vec<Tag> {
    let mut tags = Vec::new();

    if let Some(host) = host_of_email(&message.sender.email) {
        tags.push(Tag::source(canonical_source_domain(&host)));
    }
    if !message.attachments.is_empty() {
        tags.push(Tag::state("attachment"));
    }

    if let Some(kind) = infer_content_kind(&message.subject, &message.plain_body) {
        tags.push(Tag::kind(kind));
    }

    for entity in entities {
        if matches!(entity.kind, EntityKind::Identifier) {
            let v = entity.value.trim();
            let looks_urlish = v.contains("://")
                || v.contains('/')
                || v.contains('?')
                || v.contains('&')
                || v.contains('=')
                || v.contains('%')
                || v.contains('#')
                || v.contains(']');
            if !looks_urlish {
                tags.push(Tag::entity(format!("identifier:{v}")));
            }
        }
    }

    tags.dedup_by(|a, b| a.family == b.family && a.value == b.value);
    tags
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::{EmailAddress, Message, MessageId, MessageReferences};

    fn sample_message(email: &str, subject: &str, body: &str) -> Message {
        Message {
            id: MessageId("m1".into()),
            sender: EmailAddress {
                name: None,
                email: email.into(),
            },
            recipients: Vec::new(),
            reply_to: Vec::new(),
            subject: subject.into(),
            received_at: String::new(),
            plain_body: body.into(),
            html_body: None,
            references: MessageReferences {
                message_id_header: None,
                in_reply_to: None,
                references: Vec::new(),
            },
            attachments: Vec::new(),
            tags: Vec::new(),
            detected_lang: None,
            is_read: false,
            is_pinned: false,
            authentication_results: None,
            return_path: None,
        }
    }

    #[test]
    fn tag_message_canonicalizes_mail_subdomain() {
        let tags = tag_message(
            &sample_message("shop@mail.amazon.fr", "Hello", ""),
            &[],
        );
        assert!(tags.iter().any(|t| t.as_filter() == "source:amazon.fr"));
    }

    #[test]
    fn tag_message_adds_state_attachment() {
        let mut m = sample_message("a@b.com", "Files", "see attached");
        m.attachments.push(rustymail_domain::Attachment {
            id: rustymail_domain::AttachmentId("pj1".into()),
            file_name: "doc.pdf".into(),
            mime_type: "application/pdf".into(),
            size_bytes: 1024,
            kind: rustymail_domain::AttachmentKind::Regular,
            content_id: None,
        });
        let tags = tag_message(&m, &[]);
        assert!(tags.iter().any(|t| t.as_filter() == "state:attachment"));
    }

    #[test]
    fn launch_party_is_discussion_not_coordination() {
        let tags = tag_message(
            &sample_message("friend@example.com", "Launch party", "See you there"),
            &[],
        );
        assert!(tags.iter().any(|t| t.as_filter() == "kind:discussion"));
        assert!(!tags.iter().any(|t| t.as_filter() == "kind:coordination"));
    }

    #[test]
    fn invoice_is_facture_not_discussion() {
        let tags = tag_message(
            &sample_message("billing@shop.com", "Your invoice", "Please pay"),
            &[],
        );
        assert!(tags.iter().any(|t| t.as_filter() == "kind:facture"));
        assert!(!tags.iter().any(|t| t.as_filter() == "kind:discussion"));
    }

    #[test]
    fn generic_hello_has_no_content_kind() {
        let tags = tag_message(&sample_message("a@b.com", "Hello", "How are you?"), &[]);
        assert!(!tags.iter().any(|t| t.family == rustymail_domain::TagFamily::Kind));
    }

    #[test]
    fn bank_statement_is_finance() {
        assert_eq!(
            infer_content_kind("Relevé de compte", ""),
            Some("finance")
        );
    }

    #[test]
    fn otp_is_securite() {
        assert_eq!(
            infer_content_kind("Verification code", "Your OTP is 123456"),
            Some("securite")
        );
    }
}
