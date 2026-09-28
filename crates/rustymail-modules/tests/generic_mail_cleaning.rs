use rustymail_domain::{EmailAddress, Message, MessageId, MessageReferences};
use rustymail_modules::clean_message;
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
    assert_eq!(out.generic_rule_set_version, "11");
    let low = out.html.to_ascii_lowercase();
    assert!(low.contains("message principal outlook"));
    assert!(!low.contains("[if mso]"));
    assert!(!low.contains("mso-normal"));
    assert!(!low.contains("v:roundrect"));
    assert!(!low.contains("style="));
}

#[test]
fn gmail_fixture_folds_quote_and_attenuates_signature() {
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
    assert!(low.contains("rm-mail-folded-quote"));
    assert!(low.contains("ancien message long"));
    assert!(low.contains("rm-mail-signature"));
    assert!(low.contains("signature gmail"));
    assert!(!low.contains("gmail_quote"));
    let reply = low.find("réponse courte").unwrap();
    let quoted = low.find("ancien message long").unwrap();
    assert!(reply < low.find("rm-mail-folded-quote").unwrap());
    assert!(quoted > reply);
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

    assert_eq!(out.generic_rule_set_version, "11");
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

#[test]
fn apple_cite_is_folded_behind_the_reply() {
    let html = r#"<div><p>Oui, je relis le paragraphe.</p><div>Le lun. 1 janv. 2024 à 10:00, Alice a écrit :</div><blockquote type="cite"><p>Peux-tu relire le paragraphe 2 ?</p></blockquote></div>"#;
    let msg = generic_message(html.to_string());
    let ctx = CleaningInput::from_message(&msg);
    let out = clean_html_for_markdown(&ProviderRegistry::builtin(), &ctx, html);
    assert!(out.html.contains("rm-mail-folded-quote"));
    assert!(out.html.contains("paragraphe 2"));
    assert!(out.html.find("Oui, je relis").unwrap() < out.html.find("paragraphe 2").unwrap());
}

#[test]
fn discussion_body_is_not_rewritten_as_a_digest() {
    let html = r#"<p>On en a parlé : je ne veux pas d’un digest, juste ta réponse sur le privacy review.</p><p>Le mot unsubscribe dans ce fil est un exemple, pas un pied de newsletter.</p>"#;
    let msg = generic_message(html.to_string());
    let ctx = CleaningInput::from_message(&msg);
    let out = clean_html_for_markdown(&ProviderRegistry::builtin(), &ctx, html);
    assert_eq!(out.resolved_provider, ProviderId::Generic);
    assert!(out.html.contains("privacy review"));
    assert!(out.html.contains("unsubscribe"));
    assert!(!out.html.contains("rustymail:"));
    assert!(!out.html.contains("rm-mail-folded-quote"));
}

#[test]
fn cleaned_text_follows_visible_reply_not_plain_noise_or_folded_quote() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/generic/gmail_thread.html"
    ));
    let mut msg = generic_message(html.to_string());
    msg.plain_body = "BRUIT_PLAIN view in browser unsubscribe".into();
    let view = clean_message(&msg);
    assert!(view.cleaned_text.contains("Réponse courte"));
    assert!(!view.cleaned_text.contains("Ancien message"));
    assert!(!view.cleaned_text.contains("Signature Gmail"));
    assert!(!view.cleaned_text.contains("BRUIT_PLAIN"));
    let html_out = view.cleaned_html_body.expect("html");
    assert!(html_out.contains("rm-mail-folded-quote"));
    assert!(html_out.contains("Ancien message long"));
}

#[test]
fn cleaned_text_keeps_outlook_conversation_report() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/generic/outlook_forward_chain.html"
    ));
    let mut msg = generic_message(html.to_string());
    msg.plain_body = "BRUIT_PLAIN hors du rapport".into();
    let view = clean_message(&msg);
    assert!(view.cleaned_text.contains("=== [1]"));
    assert!(
        view.cleaned_text.contains("brief logistique")
            || view.cleaned_text.contains("Message transféré")
    );
    assert!(!view.cleaned_text.contains("BRUIT_PLAIN"));
}
