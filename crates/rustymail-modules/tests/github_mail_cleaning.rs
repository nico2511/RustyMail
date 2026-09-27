use rustymail_domain::{EmailAddress, Message, MessageId, MessageReferences};
use rustymail_modules::mail_cleaning::{
    clean_html_for_markdown, CleaningInput, ProviderId, ProviderRegistry,
};

fn message(email: &str, subject: &str, html: String) -> Message {
    Message {
        id: MessageId("m-github".into()),
        sender: EmailAddress {
            name: Some("GitHub".into()),
            email: email.into(),
        },
        recipients: vec![],
        reply_to: vec![],
        subject: subject.into(),
        received_at: "2026-01-01T00:00:00Z".into(),
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

const NOTIFICATION_HTML: &str = r#"<html><body>
<table><tr><td><h2>New comment on pull request #42: Fix login timeout</h2>
<p>Looks good to me — please merge when CI is green.</p>
<p><a href="https://github.com/acme/widget/pull/42">View it on GitHub</a></p>
</td></tr></table>
<p>You are receiving this because you are subscribed to this thread.</p>
<p><a href="https://github.com/notifications/unsubscribe">Unsubscribe</a></p>
</body></html>"#;

#[test]
fn github_notification_resolves_digest() {
    let msg = message(
        "notifications@github.com",
        "[acme/widget] Fix login timeout (#42)",
        NOTIFICATION_HTML.into(),
    );
    let ctx = CleaningInput::from_message(&msg);
    let out = clean_html_for_markdown(&ProviderRegistry::builtin(), &ctx, NOTIFICATION_HTML);
    assert_eq!(out.resolved_provider, ProviderId::GitHub);
    assert!(out.html.contains("rustymail:github-digest"));
    assert!(out.html.contains("rm-github-digest"));
    assert!(out.html.contains("Looks good to me"));
    assert!(!out.html.contains("Unsubscribe"));
}

#[test]
fn bare_github_word_stays_generic() {
    let html = "<p>Bonjour, mon projet github interne avance.</p>";
    let msg = message("ada@example.com", "Notes de sprint", html.into());
    let ctx = CleaningInput::from_message(&msg);
    let out = clean_html_for_markdown(&ProviderRegistry::builtin(), &ctx, html);
    assert_eq!(out.resolved_provider, ProviderId::Generic);
    assert!(out.html.contains("projet github interne"));
    assert!(!out.html.contains("rustymail:github-digest"));
}

#[test]
fn github_subject_without_url_does_not_rewrite_body() {
    let html = "<h2>Compte rendu</h2><p>Le build a échoué pour une autre raison.</p>";
    let msg = message("ada@example.com", "GitHub Actions failed", html.into());
    let ctx = CleaningInput::from_message(&msg);
    let out = clean_html_for_markdown(&ProviderRegistry::builtin(), &ctx, html);
    assert_eq!(out.resolved_provider, ProviderId::Generic);
    assert!(out.html.contains("Compte rendu"));
    assert!(out.html.contains("autre raison"));
    assert!(!out.html.contains("rustymail:github-digest"));
}
