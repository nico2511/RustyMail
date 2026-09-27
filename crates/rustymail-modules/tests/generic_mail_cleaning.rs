use rustymail_domain::{EmailAddress, Message, MessageId, MessageReferences};
use rustymail_modules::mail_cleaning::{
    clean_html_for_markdown, CleaningInput, ProviderId, ProviderRegistry,
};

fn generic_message(html: String) -> Message {
    Message {
        id: MessageId("m-generic-fixture".into()),
        sender: EmailAddress {
            name: Some("Sender".into()),
            email: "sender@example.com".into(),
        },
        recipients: vec![],
        reply_to: vec![],
        subject: "Test".into(),
        received_at: "2026-01-01".into(),
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
fn outlook_fixture_keeps_body_strips_mso_and_quote_noise() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/generic/outlook_mso.html"
    ));
    let msg = generic_message(html.to_string());
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, html);

    assert_eq!(out.resolved_provider, ProviderId::Generic);
    assert_eq!(out.generic_rule_set_version, "10");
    let low = out.html.to_ascii_lowercase();
    assert!(low.contains("message principal outlook"));
    assert!(!low.contains("[if mso]"));
    assert!(!low.contains("mso-normal"));
    assert!(!low.contains("v:roundrect"));
    assert!(!low.contains("style="));
}

#[test]
fn gmail_fixture_removes_quote_and_signature_blocks() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/generic/gmail_thread.html"
    ));
    let msg = generic_message(html.to_string());
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, html);

    let low = out.html.to_ascii_lowercase();
    assert!(low.contains("réponse courte"));
    assert!(!low.contains("gmail_quote"));
    assert!(!low.contains("ancien message long"));
    assert!(!low.contains("signature gmail"));
}

#[test]
fn otp_fixture_preserves_code_and_cta() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/generic/otp_short.html"
    ));
    let msg = generic_message(html.to_string());
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, html);

    assert!(out.html.contains("847291"));
    assert!(out.html.contains("bank.example"));
}

#[test]
fn outlook_forward_chain_builds_conversation_report() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/generic/outlook_forward_chain.html"
    ));
    let msg = generic_message(html.to_string());
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, html);

    assert_eq!(out.generic_rule_set_version, "10");
    assert!(out.html.contains("rm-conversation-report"));
    assert!(out.html.contains("Message transféré"));
    assert!(out.html.contains("brief logistique"));
    assert!(out.html.contains("Alice"));
    assert!(!out.html.contains("Signature"));
    assert!(!out.html.contains("divRplyFwdMsg"));
    let conv = out.conversation_text.expect("conversation text");
    assert!(conv.contains("=== [1]"));
    assert!(conv.contains("--- cité ---"));
}

#[test]
fn keeps_useful_small_logo_not_tracker_pixel() {
    let html = r#"<div><p>Hi</p><img src="https://cdn.example/logo.png" width="36" height="36" alt="Logo"/><img src="https://t.example/pixel" width="1" height="1" role="presentation"/></div>"#;
    let msg = generic_message(html.into());
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, html);

    assert!(out.html.contains("logo.png"));
    assert!(!out.html.contains("pixel"));
}

#[test]
fn strips_style_video_svg_and_small_tracker() {
    let html = r#"<div><p>Bonjour</p><style>body{background:url(https://track.example/x)}</style><video src="https://evil.example/v.mp4"></video><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg><img src="https://track.example/open.gif" width="2" height="2" alt=""/></div>"#;
    let msg = generic_message(html.into());
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, html);
    let low = out.html.to_ascii_lowercase();
    assert!(low.contains("bonjour"));
    assert!(!low.contains("<style"));
    assert!(!low.contains("<video"));
    assert!(!low.contains("<svg"));
    assert!(!low.contains("open.gif"));
    assert!(!low.contains("evil.example"));
}
