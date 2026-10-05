use lettre::message::Mailbox;
use lettre::message::{header::ContentType, Attachment as LettreAttachment, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::{Credentials, Mechanism};
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::Tokio1Executor;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message};
use pulldown_cmark::{html, Options, Parser};

use rustymail_domain::compose_html::{
    compose_body_is_html, compose_html_fragment, compose_html_to_plain, sanitize_compose_html,
};
use rustymail_domain::{Account, Draft, MailAuthKind, SecurityMode};

use crate::get_account_password;
use crate::inline_compose_images::InlineImagePart;
use crate::tls_policy;

fn parse_mailbox(email: &str, display_name: Option<&str>) -> Result<Mailbox, String> {
    let address = email
        .trim()
        .parse()
        .map_err(|e| format!("invalid email address '{email}': {e}"))?;
    Ok(Mailbox::new(
        display_name
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        address,
    ))
}

async fn build_transport(account: &Account) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
    let mut tls_params = TlsParameters::builder(account.smtp.host.trim().to_string());
    let allow_bad = tls_policy::effective_allow_invalid_tls(account.smtp.allow_invalid_tls);
    if allow_bad {
        tls_params = tls_params
            .dangerous_accept_invalid_hostnames(true)
            .dangerous_accept_invalid_certs(true);
    }
    let tls_params = tls_params
        .build()
        .map_err(|e| format!("smtp tls params failed: {e}"))?;

    let credentials = match &account.auth_kind {
        MailAuthKind::Password => {
            let password = get_account_password(&account.id.0)?;
            Credentials::new(account.email.clone(), password)
        }
        MailAuthKind::OauthGoogle | MailAuthKind::OauthMicrosoft => {
            let tok =
                crate::oauth_mail::ensure_valid_access_token(&account.id.0, &account.auth_kind)
                    .await?;
            Credentials::new(account.email.clone(), tok)
        }
    };

    let mut builder =
        AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(account.smtp.host.trim())
            .port(account.smtp.port)
            .credentials(credentials);

    builder = match &account.auth_kind {
        MailAuthKind::Password => builder,
        MailAuthKind::OauthGoogle | MailAuthKind::OauthMicrosoft => {
            builder.authentication(vec![Mechanism::Xoauth2])
        }
    };

    builder = match account.smtp.security {
        SecurityMode::StartTls => builder.tls(Tls::Required(tls_params)),
        SecurityMode::Tls => builder.tls(Tls::Wrapper(tls_params)),
    };

    Ok(builder.build())
}

pub fn markdown_body_to_html(markdown: &str) -> String {
    if compose_body_is_html(markdown) {
        return sanitize_compose_html(compose_html_fragment(markdown));
    }
    markdown_to_html(markdown)
}

fn outbound_plain_body(markdown: &str) -> String {
    if compose_body_is_html(markdown) {
        compose_html_to_plain(markdown)
    } else {
        strip_data_image_markdown(markdown)
    }
}

fn markdown_to_html(markdown: &str) -> String {
    let forced = force_markdown_hard_line_breaks(markdown);
    let parser = Parser::new_ext(&forced, Options::all());
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

fn force_markdown_hard_line_breaks(input: &str) -> String {
    let lines: Vec<&str> = input.lines().collect();
    let mut in_code_fence = false;
    let mut out: Vec<String> = Vec::new();
    let mut i = 0usize;

    while i < lines.len() {
        let line = lines[i];
        let trimmed_start = line.trim_start();
        if trimmed_start.starts_with("```") || trimmed_start.starts_with("~~~") {
            in_code_fence = !in_code_fence;
            out.push(line.to_string());
            i += 1;
            continue;
        }
        if in_code_fence {
            out.push(line.to_string());
            i += 1;
            continue;
        }

        if trimmed_start.starts_with('|') && line.matches('|').count() >= 2 {
            out.push(line.to_string());
            i += 1;
            continue;
        }

        if line.trim().is_empty() {
            let mut empty_run = 0usize;
            let mut j = i;
            while j < lines.len() {
                let l = lines[j];
                let t = l.trim_start();
                if t.starts_with("```") || t.starts_with("~~~") {
                    break;
                }
                if !l.trim().is_empty() {
                    break;
                }
                empty_run += 1;
                j += 1;
            }
            out.push(String::new());
            for _ in 1..empty_run {
                out.push('\\'.to_string());
            }
            i = j;
            continue;
        }

        if line.ends_with("  ") {
            out.push(line.to_string());
        } else {
            out.push(format!("{line}  "));
        }
        i += 1;
    }

    out.join("\n")
}

fn strip_data_image_markdown(markdown: &str) -> String {
    // Évite d’envoyer un text/plain gigantesque lorsqu’on colle une capture en data URL.
    // Remplace `![alt](data:image/...)` par `[image: alt]`.
    let mut out = String::with_capacity(markdown.len().min(64 * 1024));
    let bytes = markdown.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if i + 4 < bytes.len() && bytes[i] == b'!' && bytes[i + 1] == b'[' {
            if let Some(close_bracket) = markdown[i + 2..].find(']') {
                let cb = i + 2 + close_bracket;
                if cb + 1 < bytes.len() && bytes[cb + 1] == b'(' {
                    if let Some(close_paren) = markdown[cb + 2..].find(')') {
                        let cp = cb + 2 + close_paren;
                        let url = &markdown[cb + 2..cp];
                        let url_lower = url.trim_start().to_ascii_lowercase();
                        if url_lower.starts_with("data:image/") || url_lower.starts_with("cid:") {
                            let alt = &markdown[i + 2..cb];
                            let alt_clean = alt.trim();
                            if alt_clean.is_empty() {
                                out.push_str("[image]");
                            } else {
                                out.push_str("[image: ");
                                out.push_str(alt_clean);
                                out.push(']');
                            }
                            i = cp + 1;
                            continue;
                        }
                    }
                }
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

fn attachment_content_type(path: &std::path::Path) -> ContentType {
    let guess = mime_guess::from_path(path).first_or_octet_stream();
    let raw = guess.essence_str();
    raw.parse().unwrap_or(ContentType::TEXT_PLAIN)
}

/// Keeps SMTP headers within practical limits — very long References break some relays / Gmail.
fn sanitized_references(ids: &[String]) -> Option<String> {
    const MAX_IDS: usize = 45;
    const MAX_CHARS: usize = 7800;

    let cleaned: Vec<String> = ids
        .iter()
        .filter_map(|s| {
            let t = s.trim().replace(['\r', '\n', '\t'], "");
            (!t.is_empty()).then_some(t)
        })
        .collect();
    if cleaned.is_empty() {
        return None;
    }
    let mut tail: &[String] = if cleaned.len() > MAX_IDS {
        &cleaned[cleaned.len() - MAX_IDS..]
    } else {
        &cleaned
    };
    let mut line = tail.join(" ");
    while line.len() > MAX_CHARS && tail.len() > 1 {
        tail = &tail[1..];
        line = tail.join(" ");
    }
    if line.is_empty() {
        None
    } else {
        Some(line)
    }
}

/// One stable Message-ID style token suitable for `In-Reply-To`.
fn sanitized_in_reply_to(raw: &str) -> Option<String> {
    let s = raw.trim().replace(['\r', '\n', '\t'], "");
    if s.is_empty() {
        return None;
    }
    if s.starts_with('<') && s.ends_with('>') {
        Some(s.to_string())
    } else {
        Some(format!("<{s}>"))
    }
}

/// Résultat d’un envoi SMTP réussi : identifiant à enregistrer en base + octets RFC 822 pour IMAP `APPEND` (Envoyés).
#[derive(Debug, Clone)]
pub struct DraftSendOutcome {
    pub message_id: String,
    pub rfc822: Vec<u8>,
}

fn image_content_type(mime: &str) -> ContentType {
    mime.parse()
        .unwrap_or_else(|_| ContentType::parse("application/octet-stream").expect("octet-stream"))
}

/// `multipart/related` : HTML racine + images `cid:` (disposition `inline` **sans** filename).
/// Structure attendue par Thunderbird / mobiles — pas `related` autour de tout l’`alternative`.
fn html_related_part(html: String, inline_images: &[InlineImagePart]) -> MultiPart {
    let html_part = SinglePart::builder()
        .header(ContentType::TEXT_HTML)
        .body(html);
    let mut related = MultiPart::related().singlepart(html_part);
    for image in inline_images {
        let content_type = image_content_type(&image.mime_type);
        // `new_inline` (sans nom) : Content-Disposition: inline — les clients
        // n’affichent pas la photo comme pièce jointe séparée.
        related = related.singlepart(
            LettreAttachment::new_inline(image.content_id.clone())
                .body(image.bytes.clone(), content_type),
        );
    }
    related
}

/// Corps sortant : `alternative` [ plain | html ] ou [ plain | related(html+cid) ].
fn build_body_multipart(
    draft: &Draft,
    inline_images: &[InlineImagePart],
) -> Result<MultiPart, String> {
    let plain_part = SinglePart::builder()
        .header(ContentType::TEXT_PLAIN)
        .body(outbound_plain_body(&draft.markdown_body));

    if !draft.send_html {
        return Ok(MultiPart::mixed().singlepart(plain_part));
    }

    let html = markdown_body_to_html(&draft.markdown_body);
    let alternative = if inline_images.is_empty() {
        let html_part = SinglePart::builder()
            .header(ContentType::TEXT_HTML)
            .body(html);
        MultiPart::alternative()
            .singlepart(plain_part)
            .singlepart(html_part)
    } else {
        MultiPart::alternative()
            .singlepart(plain_part)
            .multipart(html_related_part(html, inline_images))
    };
    Ok(alternative)
}

fn build_draft_message(
    account: &Account,
    draft: &Draft,
    inline_images: &[InlineImagePart],
) -> Result<(String, Message), String> {
    let from = parse_mailbox(&account.email, Some(&account.display_name))?;
    let sender_domain = account
        .email
        .rsplit_once('@')
        .map(|(_, domain)| domain.trim())
        .filter(|d| !d.is_empty())
        .ok_or_else(|| "account email must include a domain (user@domain) for SMTP".to_string())?;

    let mut msg_builder = Message::builder()
        .from(from)
        .subject(draft.subject.trim().to_string());

    for to in &draft.to {
        let mb = parse_mailbox(&to.email, to.name.as_deref())?;
        msg_builder = msg_builder.to(mb);
    }
    for cc in &draft.cc {
        let mb = parse_mailbox(&cc.email, cc.name.as_deref())?;
        msg_builder = msg_builder.cc(mb);
    }
    for bcc in &draft.bcc {
        let mb = parse_mailbox(&bcc.email, bcc.name.as_deref())?;
        msg_builder = msg_builder.bcc(mb);
    }
    if let Some(ir) = draft
        .in_reply_to
        .as_ref()
        .and_then(|s| sanitized_in_reply_to(s))
    {
        msg_builder = msg_builder.in_reply_to(ir);
    }
    if let Some(refs_line) = sanitized_references(&draft.references) {
        msg_builder = msg_builder.references(refs_line);
    }

    let mid_token = uuid::Uuid::new_v4().simple();
    let message_id = format!("<{mid_token}@{sender_domain}>");
    eprintln!("[RustyMail] SMTP Message-ID: {message_id}");
    msg_builder = msg_builder.message_id(Some(message_id.clone()));

    let body_part = build_body_multipart(draft, inline_images)?;
    let message = if draft.attachment_paths.is_empty() {
        msg_builder
            .multipart(body_part)
            .map_err(|e| format!("smtp message build failed: {e}"))?
    } else {
        // PJ fichier hors du related : mixed > alternative[/related] + attachments.
        let mut mixed = MultiPart::mixed().multipart(body_part);
        let mut pj_bytes_total: usize = 0;
        for raw_path in &draft.attachment_paths {
            let p = std::path::PathBuf::from(raw_path.trim());
            if !p.exists() || !p.is_file() {
                return Err(format!("attachment not found: {}", p.display()));
            }
            let data = std::fs::read(&p)
                .map_err(|e| format!("cannot read attachment {}: {e}", p.display()))?;
            pj_bytes_total += data.len();
            let filename = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("attachment.bin")
                .to_string();
            eprintln!(
                "[RustyMail] SMTP attachment {} ({} octets, {}...)",
                filename,
                data.len(),
                p.display(),
            );
            let content_type = attachment_content_type(&p);
            mixed = mixed.singlepart(LettreAttachment::new(filename).body(data, content_type));
        }
        eprintln!(
            "[RustyMail] SMTP {} partie(s) jointe(s), ~{} octets fichiers",
            draft.attachment_paths.len(),
            pj_bytes_total,
        );
        msg_builder
            .multipart(mixed)
            .map_err(|e| format!("smtp message build failed: {e}"))?
    };

    Ok((message_id, message))
}

pub async fn send_draft_via_smtp(
    account: &Account,
    draft: &Draft,
    inline_images: &[InlineImagePart],
) -> Result<DraftSendOutcome, String> {
    // Reuse the stored secret (password) or OAuth2 access token (même trousseau / flux OAuth).
    let (message_id, message) = build_draft_message(account, draft, inline_images)?;
    let rfc822 = message.formatted();

    let transport = build_transport(account).await?;
    let smtp_resp = transport
        .send(message)
        .await
        .map_err(|e| format!("smtp send failed: {e}"))?;
    let code = smtp_resp.code();
    let first = smtp_resp.first_line().unwrap_or("");
    eprintln!("[RustyMail] SMTP reply: {} {}", code.to_string(), first);

    Ok(DraftSendOutcome { message_id, rfc822 })
}

#[cfg(test)]
mod compose_html_send_tests {
    use super::{build_draft_message, markdown_body_to_html};
    use crate::extract_inline_data_images;
    use rustymail_domain::compose_html::COMPOSE_HTML_MARK;
    use rustymail_domain::{
        Account, AccountId, Draft, DraftId, DraftKind, EmailAddress, MailAuthKind, SecurityMode,
        ServerSettings,
    };

    #[test]
    fn tiptap_html_is_not_passed_through_markdown() {
        let html = markdown_body_to_html(&format!("{COMPOSE_HTML_MARK}<p><em>ciao</em></p>"));
        assert!(html.contains("<em>ciao</em>"));
        assert!(!html.contains("&lt;em&gt;"));
    }

    fn account() -> Account {
        Account {
            id: AccountId("user@example.com".into()),
            display_name: "Nicolas".into(),
            email: "user@example.com".into(),
            imap: ServerSettings {
                host: "imap.example.com".into(),
                port: 993,
                security: SecurityMode::Tls,
                allow_invalid_tls: false,
            },
            smtp: ServerSettings {
                host: "smtp.example.com".into(),
                port: 465,
                security: SecurityMode::Tls,
                allow_invalid_tls: false,
            },
            auth_kind: MailAuthKind::Password,
        }
    }

    fn draft(body: &str, send_html: bool) -> Draft {
        Draft {
            id: DraftId("draft-1".into()),
            kind: DraftKind::New,
            to: vec![EmailAddress {
                name: None,
                email: "ada@example.com".into(),
            }],
            cc: Vec::new(),
            bcc: Vec::new(),
            subject: "Sujet".into(),
            markdown_body: body.to_string(),
            send_html,
            in_reply_to: None,
            references: Vec::new(),
            attachment_paths: Vec::new(),
            thread_id: None,
        }
    }

    fn rfc822(body: &str, send_html: bool, inline: &[crate::InlineImagePart]) -> String {
        let (_id, message) =
            build_draft_message(&account(), &draft(body, send_html), inline).unwrap();
        String::from_utf8_lossy(&message.formatted()).into_owned()
    }

    #[test]
    fn plain_text_message_stays_free_of_related_parts() {
        let raw = rfc822("Bonjour\n\nmonde", false, &[]);
        assert!(raw.contains("Bonjour"));
        assert!(!raw.to_ascii_lowercase().contains("multipart/related"));
        assert!(!raw.contains("Content-ID"));
    }

    #[test]
    fn html_without_images_stays_alternative() {
        let raw = rfc822(&format!("{COMPOSE_HTML_MARK}<p>Bonjour</p>"), true, &[]);
        assert!(raw.contains("Bonjour"));
        assert!(!raw.to_ascii_lowercase().contains("multipart/related"));
    }

    #[test]
    fn inline_image_is_a_cid_part_not_a_data_url() {
        const PNG_1X1_B64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        let mut body = format!(
            r#"{COMPOSE_HTML_MARK}<p>Bonjour <img src="data:image/png;base64,{PNG_1X1_B64}" alt="capture"></p>"#
        );
        let parts = extract_inline_data_images(&mut body).unwrap();
        assert_eq!(parts.len(), 1);
        let raw = rfc822(&body, true, &parts);
        let lower = raw.to_ascii_lowercase();
        assert!(lower.contains("multipart/related"), "{raw}");
        assert!(lower.contains("multipart/alternative"), "{raw}");
        assert!(lower.contains("content-id:"), "{raw}");
        // related doit envelopper le HTML (pas l’alternative) : le Content-ID suit text/html.
        let related_at = lower.find("multipart/related").expect("related");
        let html_at = lower.find("text/html").expect("html");
        let cid_at = lower.find("content-id:").expect("cid");
        assert!(
            related_at < html_at && html_at < cid_at,
            "expected alternative > related > html > cid image, got structure around related/html/cid\n{raw}"
        );
        assert!(
            raw.contains(&format!("cid:{}", parts[0].content_id)),
            "{raw}"
        );
        assert!(
            raw.contains(&format!("<{}>", parts[0].content_id))
                || raw.contains(&parts[0].content_id),
            "{raw}"
        );
        assert!(!raw.contains("data:image"), "{raw}");
        // Pas de filename → les clients ne listent pas la photo comme PJ.
        assert!(
            !lower.contains("content-disposition: inline; filename="),
            "inline image must not expose a download filename\n{raw}"
        );
        assert!(
            lower.contains("content-disposition: inline\r\n")
                || lower.contains("content-disposition: inline\n"),
            "{raw}"
        );
        assert!(
            raw.contains("[image: capture]") || raw.contains("capture"),
            "{raw}"
        );
        assert!(raw.contains("Bonjour"));
    }
}
