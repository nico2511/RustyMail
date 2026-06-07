use rustymail_domain::{EmailAddress, Message, MessageId, MessageReferences};
use rustymail_modules::mail_cleaning::{
    clean_html_for_markdown, CleaningInput, ProviderId, ProviderRegistry,
};

fn amazon_message(html: String) -> Message {
    Message {
        id: MessageId("m-test-1".to_string()),
        sender: EmailAddress {
            name: Some("Amazon.fr".into()),
            email: "noreply@amazon.fr".into(),
        },
        recipients: vec![],
        reply_to: vec![],
        subject: "Votre commande a été expédiée".into(),
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
fn amazon_fixture_resolves_amazon_provider() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/amazon/promo_footer.html"
    ))
    .to_string();
    let msg = amazon_message(html);
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();

    assert_eq!(
        clean_html_for_markdown(&reg, &ctx, msg.html_body.as_deref().unwrap()).resolved_provider,
        ProviderId::Amazon
    );
}

#[test]
fn amazon_fixture_drops_tracking_and_legal_footer() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/amazon/promo_footer.html"
    ))
    .to_string();
    let msg = amazon_message(html);
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, msg.html_body.as_deref().unwrap());

    assert_eq!(out.resolved_provider, ProviderId::Amazon);
    assert!(out.generic_rule_set_version == "9");
    assert!(out.provider_rule_set_version == Some("9"));

    let low = out.html.to_ascii_lowercase();
    assert!(!low.contains("pixel.gif"));
    assert!(!low.contains("privacy notice"));
    assert!(!low.contains("conditions of use"));

    assert!(
        low.contains("usb cable"),
        "main body must survive cleaning: {}",
        out.html
    );
}

/// Anonymized real FR marketing template (MIME in `Providerr_mockup/*.eml` or `amazon.md`; regenerate: `python tools/build_amazon_fixture.py`).
#[test]
fn amazon_recommendation_fr_fixture_strips_legal_footer() {
    let html = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/amazon/recommendation_fr_anonymized.html"
    ))
    .to_string();
    let mut msg = amazon_message(html);
    msg.subject = "Nous avons trouvé quelque chose qui pourrait vous plaire".into();

    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, msg.html_body.as_deref().unwrap());

    assert_eq!(out.resolved_provider, ProviderId::Amazon);
    assert_eq!(out.provider_rule_set_version, Some("9"));
    let low = out.html.to_ascii_lowercase();
    assert!(
        low.contains("rustymail:amazon-digest"),
        "expected semantic Amazon digest marker"
    );
    assert!(
        low.contains("<table>") && low.contains("recommandations"),
        "reco digest as table: {}",
        &out.html[..out.html.len().min(400)]
    );
    assert!(
        low.contains("class=\"rm-amazon-digest\""),
        "digest article marker class"
    );
    assert!(
        !low.contains("style="),
        "no sender inline styles on digest skeleton"
    );
    assert!(
        !low.contains("préférences e-mails amazon") && !low.contains("sujet :"),
        "removed redundant title + subject repeats: {}",
        &out.html[..out.html.len().min(300)]
    );
    assert!(
        !low.contains("mettre à jour vos préférences"),
        "preferences-only footer link removed; keep unsub only",
    );
    assert!(
        low.contains("se désinscrire"),
        "unsubscribe affordance stays visible",
    );
    assert!(
        !low.contains("politique de confidentialité"),
        "French legal footer chunk should be removed"
    );
    assert!(
        !low.contains("john f. kennedy") && !low.contains("amazon eu sarl"),
        "Legal entity block should be removed: {}",
        out.html.len()
    );
    assert!(
        low.contains("merach") || low.contains("waterrower"),
        "Product grid body should survive: {}",
        &out.html[..out.html.len().min(500)]
    );
    assert!(
        !low.contains("transp.gif"),
        "Tiny tracking gif should not remain"
    );
}

/// Accusé de commande : le digest commande prend le dessus même si le HTML contient une grille reco.
#[test]
fn amazon_order_digest_wins_over_recommendation_html() {
    let plain = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/amazon/order_ack_plain_fr.txt"
    ));
    let junk_html = concat!(
        r#"<!DOCTYPE html><html><body><table class="asin-container"><tr><td>"#,
        r#"<a href="https://x"><img alt="Reco marketing" /></a>"#,
        r#"</td></tr></table><p>http noise</p></body></html>"#
    );

    let msg = Message {
        id: MessageId("m-amz-order-test".into()),
        sender: EmailAddress {
            name: Some("Amazon.fr".into()),
            email: "confirmation-commande@amazon.fr".into(),
        },
        recipients: vec![],
        reply_to: vec![],
        subject: "Commandé : exemple".into(),
        received_at: "2026-05-02".into(),
        plain_body: plain.to_string(),
        html_body: Some(junk_html.into()),
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
    };
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, msg.html_body.as_deref().unwrap());

    assert_eq!(out.resolved_provider, ProviderId::Amazon);
    assert_eq!(out.provider_rule_set_version, Some("9"));
    let low = out.html.to_ascii_lowercase();
    assert!(
        low.contains("<table>") && low.contains("777-5554321-1234567"),
        "{}",
        &out.html[..out.html.len().min(460)]
    );
    assert!(
        low.contains("/your-orders/order-details"),
        "order-details link retained"
    );
    assert!(
        low.contains("livre exemple alpha") && low.contains("29.70"),
        "line items preserved"
    );
    assert!(
        !low.contains("reco marketing"),
        "recommendation grid from junk HTML must not dominate output"
    );
    assert!(
        !low.contains("rm-amazon-order-track") && !low.contains("<img"),
        "order digest: no status list, no product images"
    );
    assert!(
        !low.contains("livraison prévue") && !low.contains("merci pour votre commande"),
        "digest omits greeting and delivery blurb; tables only"
    );
    assert!(!low.contains("<h3>"), "no section title above line items");
}

/// Suivi colis `shipment-tracking@` : mêmes tableaux que l’accusé commande + créneau + lien progress-tracker.
#[test]
fn amazon_shipment_tracking_digest_tables() {
    let plain = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/amazon/shipment_ninja_plain_fr.txt"
    ));
    let msg = Message {
        id: MessageId("m-amz-ship-1".into()),
        sender: EmailAddress {
            name: Some("Amazon.fr".into()),
            email: "shipment-tracking@amazon.fr".into(),
        },
        recipients: vec![],
        reply_to: vec![],
        subject: "En cours de livraison : exemple".into(),
        received_at: "2026-05-03".into(),
        plain_body: plain.to_string(),
        html_body: Some("<html><body><p>html</p></body></html>".into()),
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
    };
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, msg.html_body.as_deref().unwrap());

    assert_eq!(out.resolved_provider, ProviderId::Amazon);
    assert_eq!(out.provider_rule_set_version, Some("9"));
    let low = out.html.to_ascii_lowercase();
    assert!(low.contains("rustymail:amazon-digest"));
    assert!(low.contains("créneau") && low.contains("tranche horaire"));
    assert!(low.contains("suivi colis") && low.contains("progress-tracker"));
    assert!(low.contains("pat relais") && low.contains("777-5554321-1234567"));
    assert!(low.contains("mixeur exemple pro"));
    assert!(low.contains("<table>"));
}

#[test]
fn amazon_shipment_multi_items_plain_digest() {
    let plain = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/amazon/shipment_multi_plain_fr.txt"
    ));
    let msg = Message {
        id: MessageId("m-amz-ship-2".into()),
        sender: EmailAddress {
            name: Some("Amazon.fr".into()),
            email: "shipment-tracking@amazon.fr".into(),
        },
        recipients: vec![],
        reply_to: vec![],
        subject: "En cours de livraison : plusieurs articles".into(),
        received_at: "2026-05-03".into(),
        plain_body: plain.to_string(),
        html_body: Some("<p>x</p>".into()),
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
    };
    let ctx = CleaningInput::from_message(&msg);
    let reg = ProviderRegistry::builtin();
    let out = clean_html_for_markdown(&reg, &ctx, msg.html_body.as_deref().unwrap());

    assert_eq!(out.resolved_provider, ProviderId::Amazon);
    let low = out.html.to_ascii_lowercase();
    assert!(low.contains("livre exemple alpha") && low.contains("livre exemple bêta"));
    assert!(low.contains("24.80") && low.contains("total"));
}
