use lettre::message::Mailbox;
use lettre::message::{header::ContentType, Attachment as LettreAttachment, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::{Credentials, Mechanism};
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::Tokio1Executor;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message};
use pulldown_cmark::{html, Options, Parser};

use rustymail_domain::{Account, Draft, MailAuthKind, SecurityMode};

use crate::get_account_password;
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

async fn build_transport(
    account: &Account,
) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
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
    markdown_to_html(markdown)
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
                        if url.trim_start().starts_with("data:image/") {
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

pub async fn send_draft_via_smtp(
    account: &Account,
    draft: &Draft,
) -> Result<DraftSendOutcome, String> {
    // Reuse the stored secret (password) or OAuth2 access token (même trousseau / flux OAuth).
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

    let body_part = if draft.send_html {
        let html = markdown_to_html(&draft.markdown_body);
        let plain_stripped = strip_data_image_markdown(&draft.markdown_body);
        let plain_part = SinglePart::builder()
            .header(ContentType::TEXT_PLAIN)
            .body(plain_stripped);
        let html_part = SinglePart::builder()
            .header(ContentType::TEXT_HTML)
            .body(html);
        MultiPart::alternative()
            .singlepart(plain_part)
            .singlepart(html_part)
    } else {
        let plain_part = SinglePart::builder()
            .header(ContentType::TEXT_PLAIN)
            .body(draft.markdown_body.clone());
        MultiPart::mixed().singlepart(plain_part)
    };
    let message = if draft.attachment_paths.is_empty() {
        msg_builder
            .multipart(body_part)
            .map_err(|e| format!("smtp message build failed: {e}"))?
    } else {
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
