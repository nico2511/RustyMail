use rustymail_domain::{
    Attachment, AttachmentId, AttachmentKind, EmailAddress, Message, MessageId, MessageReferences,
};

use super::analyze_mail_security;

fn base_msg() -> Message {
    Message {
        id: MessageId("m-sec-test".into()),
        sender: EmailAddress {
            name: Some("Jean Exemple".into()),
            email: "jean.exemple@example.com".into(),
        },
        recipients: vec![],
        reply_to: vec![],
        subject: "Synthèse hebdomadaire".into(),
        received_at: "2026-05-02T12:00:00Z".into(),
        plain_body: "Bonjour tout va bien.".into(),
        html_body: None,
        references: MessageReferences {
            message_id_header: Some("<mid@example.com>".into()),
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
    }
}

#[test]
fn ok_when_no_signals() {
    let s = analyze_mail_security(&base_msg());
    assert_eq!(s.severity, rustymail_domain::MailSecuritySeverity::Ok);
    assert!(s.findings.is_empty());
}

#[test]
fn reply_to_mismatch_triggers_attention() {
    let mut m = base_msg();
    m.reply_to.push(EmailAddress {
        name: None,
        email: "other@evil.com".into(),
    });
    let s = analyze_mail_security(&m);
    assert!(s
        .findings
        .iter()
        .any(|f| f.code == "reply_to_differs_from_from"));
}

#[test]
fn exe_attachment_triggers_suspicion() {
    let mut m = base_msg();
    m.attachments.push(Attachment {
        id: AttachmentId("a1".into()),
        file_name: "setup.exe".into(),
        mime_type: "application/octet-stream".into(),
        size_bytes: 12,
        kind: AttachmentKind::Regular,
        content_id: None,
    });
    let s = analyze_mail_security(&m);
    assert!(
        s.findings
            .iter()
            .any(|f| f.code.starts_with("risky_attachment")),
        "{s:?}"
    );
}

#[test]
fn urgency_in_subject_triggers_attention() {
    let mut m = base_msg();
    m.subject = "URGENT : réinitialiser votre mot de passe".into();
    let s = analyze_mail_security(&m);
    assert!(s
        .findings
        .iter()
        .any(|f| f.code == "urgency_or_credential_language"));
}

#[test]
fn gmail_with_institutional_display_triggers_attention() {
    let mut m = base_msg();
    m.sender.email = "phish@gmail.com".into();
    m.sender.name = Some("Banque XYZ — Sécurité compte".into());
    let s = analyze_mail_security(&m);
    assert!(
        s.findings
            .iter()
            .any(|f| f.code == "freemail_institutional_display_name"),
        "{s:?}"
    );
}

#[test]
fn authentication_results_pass_does_not_flag() {
    let mut m = base_msg();
    m.authentication_results =
        Some("amazonses.com; spf=pass; dkim=pass; dmarc=pass header.from=corp.com".into());
    let s = analyze_mail_security(&m);
    assert!(!s
        .findings
        .iter()
        .any(|f| matches!(f.code.as_str(), "spf_fail" | "dkim_fail" | "dmarc_fail")));
}

#[test]
fn authentication_results_spf_fail() {
    let mut m = base_msg();
    m.authentication_results = Some("receiver.example; spf=fail smtp.mailfrom=x.com".into());
    assert!(analyze_mail_security(&m)
        .findings
        .iter()
        .any(|f| f.code == "spf_fail"));
}

#[test]
fn authentication_results_dkim_and_dmarc_fail() {
    let mut m = base_msg();
    m.authentication_results =
        Some("mail.protection.outlook.com; dkim=fail; dmarc=fail action=none".into());
    let s = analyze_mail_security(&m);
    assert!(s.findings.iter().any(|f| f.code == "dkim_fail"));
    assert!(s.findings.iter().any(|f| f.code == "dmarc_fail"));
}

#[test]
fn composite_phishing_when_auth_fail_and_urgency() {
    let mut m = base_msg();
    m.authentication_results = Some("receiver.example; spf=fail smtp.mailfrom=x.com".into());
    m.subject = "URGENT : confirmez votre compte".into();
    let s = analyze_mail_security(&m);
    assert!(s
        .findings
        .iter()
        .any(|f| f.code == "composite_phishing_risk"));
}

#[test]
fn punycode_url_triggers_suspicion() {
    let mut m = base_msg();
    m.plain_body = "Voir https://www.paypa1-secure.xn--pple-43d.com/login".into();
    let s = analyze_mail_security(&m);
    assert!(
        s.findings
            .iter()
            .any(|f| f.code == "punycode_or_homoglyph_url"),
        "{s:?}"
    );
}

#[test]
fn merge_preserves_hard_auth_when_llm_omits() {
    use super::{is_hard_security_finding, merge_heuristic_and_llm_findings};
    use rustymail_domain::{
        MailSecurityFinding, MailSecurityFindingKind, MailSecurityFindingSeverity,
    };

    let heuristic = vec![MailSecurityFinding {
        kind: MailSecurityFindingKind::Heuristic,
        code: "dmarc_fail".to_string(),
        severity: MailSecurityFindingSeverity::Suspicion,
        message_fr: "DMARC fail.".to_string(),
    }];
    assert!(is_hard_security_finding(&heuristic[0]));
    let merged = merge_heuristic_and_llm_findings(
        &heuristic,
        vec![MailSecurityFinding {
            kind: MailSecurityFindingKind::LlmIntent,
            code: "context_hint".to_string(),
            severity: MailSecurityFindingSeverity::Info,
            message_fr: "Contexte IA.".to_string(),
        }],
    );
    assert!(merged.iter().any(|f| f.code == "dmarc_fail"));
    assert!(merged.iter().any(|f| f.code == "context_hint"));
}
