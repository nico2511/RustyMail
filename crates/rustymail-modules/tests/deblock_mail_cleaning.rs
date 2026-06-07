use rustymail_domain::{EmailAddress, Message, MessageId, MessageReferences};
use rustymail_modules::mail_cleaning::{
    clean_html_for_markdown, CleaningInput, ProviderId, ProviderRegistry,
};

fn deblock_message(html: String) -> Message {
    Message {
        id: MessageId("m-deblock-1".to_string()),
        sender: EmailAddress {
            name: Some("Deblock".into()),
            email: "support@deblock.com".into(),
        },
        recipients: vec![],
        reply_to: vec![],
        subject: "Vous allez recevoir 200 EUR".into(),
        received_at: "2026-05-01".into(),
        plain_body: String::new(),
        html_body: Some(html),
        references: MessageReferences {
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
    }
}

#[test]
fn deblock_receive_resolves_provider_and_emits_digest() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/deblock/receive_200eur.html"
    ))
    .to_string();
    let msg = deblock_message(html);
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, msg.html_body.as_deref().unwrap());

    assert_eq!(out.resolved_provider, ProviderId::Deblock);
    assert!(
        out.html.contains("rustymail:deblock-digest"),
        "expected digest marker, got {}",
        &out.html[..out.html.len().min(200)]
    );
    assert!(out.html.contains("<strong>") && out.html.contains("+ 200 EUR"));
    assert!(out.html.contains("IBAN"));
    assert!(out.html.contains("Pat DOE"));
    assert!(!out.html.contains("Marketing footer"));
}

#[test]
fn deblock_send_includes_all_detail_rows() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/deblock/send_200eur.html"
    ))
    .to_string();
    let msg = deblock_message(html);
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, msg.html_body.as_deref().unwrap());

    assert_eq!(out.resolved_provider, ProviderId::Deblock);
    assert!(out.html.contains("Virement envoyé") || out.html.contains("<strong>"));
    assert!(out.html.contains("Montant Envoyé"));
    assert!(
        out.html.contains("ID de l'ordre de traitement"),
        "digest should include traitement row: {}",
        &out.html
    );
}
