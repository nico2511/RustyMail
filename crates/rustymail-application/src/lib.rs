pub mod ai;

use pulldown_cmark::{html, CowStr, Event, Options, Parser};
/// Découpage pure (tailles connues) — utilisé après `stat_attachments` côté infrastructure / Tauri.
pub use rustymail_domain::split_send::{
    plan_split as plan_attachment_split, SplitChunk, SplitError, SplitPlan,
};
use rustymail_domain::{
    lexical_search_terms, DiscussionThreadView, Draft, DraftId, DraftKind, DraftPreview,
    EmailAddress, LlmFeature, Message, SearchQuery, Thread, ThreadId, ThreadListItem,
};
use rustymail_modules::{ai_summary, clean_message, merge_entities};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApplicationError {
    #[error("thread not found")]
    ThreadNotFound,
    #[error("thread has no messages")]
    ThreadEmpty,
    #[error("draft validation failed")]
    DraftInvalid,
}

fn summarize_thread_budget_heuristic(
    thread: DiscussionThreadView,
) -> Result<ai_summary::SummaryResult, ApplicationError> {
    let mut summary = ai_summary::summarize_thread(&thread);
    summary.budget = crate::ai::token_budget_for(LlmFeature::Summary, 4096);
    Ok(summary)
}

/// Message à citer : `message_id` (id SQLite interne) si présent et trouvé, sinon le dernier du fil (ordre chronologique).
fn pick_reply_target_message<'a>(
    thread: &'a Thread,
    message_id: Option<&str>,
) -> Option<&'a Message> {
    if let Some(mid) = message_id.map(str::trim).filter(|s| !s.is_empty()) {
        if let Some(m) = thread.messages.iter().find(|msg| msg.id.0 == mid) {
            return Some(m);
        }
    }
    thread.messages.last()
}

/// `To` = expéditeur du message ciblé ; `Cc` = autres destinataires To/Cc de ce message (sans doublon, sans l’expéditeur).
fn reply_to_cc_from_message(m: &Message) -> (Vec<EmailAddress>, Vec<EmailAddress>) {
    let sender = m.sender.clone();
    let sender_lc = sender.email.to_ascii_lowercase();
    let mut cc = Vec::new();
    for recipient in &m.recipients {
        let rcpt_lc = recipient.email.to_ascii_lowercase();
        if rcpt_lc == sender_lc {
            continue;
        }
        if cc.iter().any(|existing: &EmailAddress| {
            existing.email.eq_ignore_ascii_case(&recipient.email)
        }) {
            continue;
        }
        cc.push(recipient.clone());
    }
    (vec![sender], cc)
}

fn reply_headers_from_message(m: &Message) -> (Option<String>, Vec<String>) {
    let in_reply_to = m.references.message_id_header.clone();
    let mut refs = m.references.references.clone();
    if let Some(mid) = &m.references.message_id_header {
        refs.push(mid.clone());
    }
    (in_reply_to, refs)
}

fn forward_markdown_body_from_message(m: &Message) -> String {
    let from = m
        .sender
        .name
        .as_ref()
        .map(|n| format!("{n} <{}>", m.sender.email))
        .unwrap_or_else(|| m.sender.email.clone());
    let to = if m.recipients.is_empty() {
        String::new()
    } else {
        m.recipients
            .iter()
            .map(|r| {
                r.name
                    .as_ref()
                    .map(|n| format!("{n} <{}>", r.email))
                    .unwrap_or_else(|| r.email.clone())
            })
            .collect::<Vec<_>>()
            .join(", ")
    };
    let quoted = m
        .plain_body
        .lines()
        .map(|line| format!("> {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "Hi,\n\n---------- Forwarded message ----------\nFrom: {from}\nDate: {}\nSubject: {}\nTo: {to}\n\n{quoted}\n",
        m.received_at, m.subject
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppCapabilities {
    pub mail_core: bool,
    pub readability_modules: bool,
    pub ai_modules: bool,
    pub dictation: bool,
    pub storage: String,
}

#[derive(Debug, Clone)]
pub struct AppCore {
    threads: Vec<Thread>,
    drafts: Vec<Draft>,
}

impl AppCore {
    pub fn new(threads: Vec<Thread>) -> Self {
        Self {
            threads,
            drafts: Vec::new(),
        }
    }

    pub fn thread_by_id(&self, id: &ThreadId) -> Option<&Thread> {
        self.threads.iter().find(|thread| &thread.id == id)
    }

    pub fn capabilities(&self) -> AppCapabilities {
        AppCapabilities {
            mail_core: true,
            readability_modules: true,
            ai_modules: true,
            dictation: true,
            storage: "in-memory seeded store".to_string(),
        }
    }

    pub fn list_threads(&self) -> Vec<ThreadListItem> {
        self.threads
            .iter()
            .map(|t| t.list_item("INBOX".to_string()))
            .collect()
    }

    pub fn search_threads(&self, query: SearchQuery) -> Vec<ThreadListItem> {
        let text_lc = query.text.unwrap_or_default().to_ascii_lowercase();
        let terms = lexical_search_terms(&text_lc);
        self.threads
            .iter()
            .filter(|thread| {
                let matches_text = terms.is_empty() || {
                    let subject_lc = thread.subject.to_ascii_lowercase();
                    terms.iter().all(|tok| {
                        subject_lc.contains(tok.as_str())
                            || thread.messages.iter().any(|message| {
                                message
                                    .plain_body
                                    .to_ascii_lowercase()
                                    .contains(tok.as_str())
                            })
                    })
                };

                let mut sender_needles: Vec<String> = query
                    .senders
                    .iter()
                    .map(|s| s.to_ascii_lowercase())
                    .filter(|s| !s.is_empty())
                    .collect();
                if let Some(s) = query.sender.as_ref() {
                    let slc = s.to_ascii_lowercase();
                    if !slc.is_empty() && !sender_needles.iter().any(|n| n == &slc) {
                        sender_needles.push(slc);
                    }
                }
                let matches_sender = sender_needles.is_empty()
                    || sender_needles.iter().any(|needle| {
                        thread.messages.iter().any(|message| {
                            message
                                .sender
                                .email
                                .to_ascii_lowercase()
                                .contains(needle.as_str())
                        })
                    });

                let matches_tags = query.tags.iter().all(|tag| {
                    thread.tags.contains(tag)
                        || thread
                            .messages
                            .iter()
                            .any(|message| message.tags.contains(tag))
                });

                let matches_lang = query.language.as_ref().map_or(true, |want| {
                    let want_lc = want.to_ascii_lowercase();
                    thread.messages.iter().any(|message| {
                        message
                            .detected_lang
                            .as_deref()
                            .map(|l| l.eq_ignore_ascii_case(want_lc.as_str()))
                            .unwrap_or(false)
                    })
                });

                // Search mode (semantic / hybrid) is applied in SQLite-backed search; in-memory is lexical only.
                matches_text && matches_sender && matches_tags && matches_lang
            })
            .map(|t| t.list_item("INBOX".to_string()))
            .collect()
    }

    pub fn open_thread(&self, id: &ThreadId) -> Result<DiscussionThreadView, ApplicationError> {
        let thread = self
            .threads
            .iter()
            .find(|thread| &thread.id == id)
            .ok_or(ApplicationError::ThreadNotFound)?;

        let messages = thread
            .messages
            .iter()
            .map(clean_message)
            .collect::<Vec<_>>();
        let entities = merge_entities(&messages);
        let mut tags = thread.tags.clone();
        for message in &messages {
            for tag in &message.tags {
                if !tags.contains(tag) {
                    tags.push(tag.clone());
                }
            }
        }

        let unread = thread.messages.iter().any(|message| !message.is_read);
        Ok(DiscussionThreadView {
            id: thread.id.clone(),
            subject: thread.subject.clone(),
            messages,
            tags,
            entities,
            is_newsletter_thread: false,
            unread,
        })
    }

    pub fn summarize_thread(
        &self,
        id: &ThreadId,
    ) -> Result<ai_summary::SummaryResult, ApplicationError> {
        let thread = self.open_thread(id)?;
        summarize_thread_budget_heuristic(thread)
    }

    pub fn prepare_reply(
        &mut self,
        id: &ThreadId,
        message_id: Option<&str>,
    ) -> Result<Draft, ApplicationError> {
        let thread = self
            .threads
            .iter()
            .find(|thread| &thread.id == id)
            .ok_or(ApplicationError::ThreadNotFound)?;
        let Some(target) = pick_reply_target_message(thread, message_id) else {
            return Err(ApplicationError::ThreadEmpty);
        };
        let (to, cc) = reply_to_cc_from_message(target);
        let (in_reply_to, references) = reply_headers_from_message(target);

        let draft = Draft {
            id: DraftId(format!("draft-{}", self.drafts.len() + 1)),
            kind: DraftKind::Reply,
            to,
            cc,
            bcc: Vec::new(),
            subject: if thread.subject.starts_with("Re:") {
                thread.subject.clone()
            } else {
                format!("Re: {}", thread.subject)
            },
            markdown_body: "Hi,\n\n".to_string(),
            send_html: true,
            in_reply_to,
            references,
            attachment_paths: Vec::new(),
            thread_id: Some(id.0.clone()),
        };

        self.drafts.push(draft.clone());
        Ok(draft)
    }

    pub fn prepare_reply_all(&mut self, id: &ThreadId) -> Result<Draft, ApplicationError> {
        let thread = self
            .threads
            .iter()
            .find(|thread| &thread.id == id)
            .ok_or(ApplicationError::ThreadNotFound)?;
        let Some(target) = pick_reply_target_message(thread, None) else {
            return Err(ApplicationError::ThreadEmpty);
        };
        let (to, cc) = reply_to_cc_from_message(target);
        let (in_reply_to, references) = reply_headers_from_message(target);

        let draft = Draft {
            id: DraftId(format!("draft-{}", self.drafts.len() + 1)),
            kind: DraftKind::Reply,
            to,
            cc,
            bcc: Vec::new(),
            subject: if thread.subject.starts_with("Re:") {
                thread.subject.clone()
            } else {
                format!("Re: {}", thread.subject)
            },
            markdown_body: "Hi all,\n\n".to_string(),
            send_html: true,
            in_reply_to,
            references,
            attachment_paths: Vec::new(),
            thread_id: Some(id.0.clone()),
        };
        self.drafts.push(draft.clone());
        Ok(draft)
    }

    pub fn prepare_forward(
        &mut self,
        id: &ThreadId,
        message_id: Option<&str>,
    ) -> Result<Draft, ApplicationError> {
        let thread = self
            .threads
            .iter()
            .find(|thread| &thread.id == id)
            .ok_or(ApplicationError::ThreadNotFound)?;
        let Some(m) = pick_reply_target_message(thread, message_id) else {
            return Err(ApplicationError::ThreadEmpty);
        };
        let body = forward_markdown_body_from_message(m);
        let subject = if m.subject.starts_with("Fwd:") {
            m.subject.clone()
        } else {
            format!("Fwd: {}", m.subject)
        };
        let draft = Draft {
            id: DraftId(format!("draft-{}", self.drafts.len() + 1)),
            kind: DraftKind::Forward,
            to: Vec::new(),
            cc: Vec::new(),
            bcc: Vec::new(),
            subject,
            markdown_body: body,
            send_html: true,
            in_reply_to: None,
            references: Vec::new(),
            attachment_paths: Vec::new(),
            thread_id: Some(id.0.clone()),
        };
        self.drafts.push(draft.clone());
        Ok(draft)
    }

    pub fn preview_draft(&self, markdown_body: String) -> DraftPreview {
        // pulldown-cmark (0.10) ne propose pas un flag stable "hard line breaks".
        // Pour que les retours à la ligne saisis dans l’éditeur apparaissent en <br> dans l’HTML,
        // on force les "hard breaks" Markdown en ajoutant deux espaces en fin de ligne.
        let forced = Self::force_markdown_hard_line_breaks(&markdown_body);
        let parser = Parser::new_ext(&forced, Options::all());
        // Pas d’HTML arbitraire dans l’aperçu ; exception : <u> / </u> pour le bouton souligné.
        let parser = parser.filter_map(|event| match event {
            Event::Html(raw) => sanitize_md_html(Event::Html, raw),
            Event::InlineHtml(raw) => sanitize_md_html(Event::InlineHtml, raw),
            other => Some(other),
        });
        let mut html_output = String::new();
        html::push_html(&mut html_output, parser);
        DraftPreview {
            text_plain: markdown_body,
            html: html_output,
        }
    }

    fn force_markdown_hard_line_breaks(input: &str) -> String {
        let lines: Vec<&str> = input.lines().collect();
        let mut in_code_fence = false;
        let mut out: Vec<String> = Vec::new();
        let mut i = 0usize;

        while i < lines.len() {
            let line = lines[i];
            let trimmed_start = line.trim_start();
            // Ne pas transformer les blocs de code (```` ``` ````).
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
                // Séries de lignes vides : la première sert encore de `\n\n` (séparation de blocs :
                // titre, listes, paragraphes). Les suivantes deviennent des sauts CommonMark `\` ligne
                // → `<br>` supplémentaires (comme plusieurs Entrées dans le textarea sans casser `# …`).
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

            let next = if line.ends_with("  ") {
                line.to_string()
            } else {
                format!("{line}  ")
            };
            out.push(next);
            i += 1;
        }
        out.join("\n")
    }

    pub fn send_draft(&self, draft: Draft) -> Result<(), ApplicationError> {
        draft.validate().map_err(|_| ApplicationError::DraftInvalid)
    }

    pub fn transcribe_demo(&self, current_text: String) -> String {
        format!(
            "{current_text} Thank you for the context. I can confirm our local-first approach keeps the discussion readable and private."
        )
    }
}

fn underline_html_fence(chunk: &str) -> bool {
    let s = chunk.trim();
    s.eq_ignore_ascii_case("<u>") || s.eq_ignore_ascii_case("</u>")
}

fn sanitize_md_html<'a>(ctor: fn(CowStr<'a>) -> Event<'a>, raw: CowStr<'a>) -> Option<Event<'a>> {
    if underline_html_fence(raw.as_ref()) {
        Some(ctor(raw))
    } else {
        let stripped = strip_inline_html(raw.as_ref());
        if stripped.trim().is_empty() {
            None
        } else {
            Some(Event::Text(CowStr::from(stripped)))
        }
    }
}

fn strip_inline_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

pub fn message(
    id: &str,
    sender_name: &str,
    sender_email: &str,
    subject: &str,
    received_at: &str,
    body: &str,
    is_read: bool,
) -> Message {
    Message {
        id: rustymail_domain::MessageId(id.to_string()),
        sender: EmailAddress {
            name: Some(sender_name.to_string()),
            email: sender_email.to_string(),
        },
        recipients: vec![EmailAddress {
            name: Some("Sarah Chen".to_string()),
            email: "sarah@meridianpr.com".to_string(),
        }],
        reply_to: Vec::new(),
        subject: subject.to_string(),
        received_at: received_at.to_string(),
        plain_body: body.to_string(),
        html_body: None,
        references: rustymail_domain::MessageReferences {
            message_id_header: Some(format!("<{id}@rustymail.local>")),
            in_reply_to: None,
            references: Vec::new(),
        },
        attachments: Vec::new(),
        tags: Vec::new(),
        detected_lang: None,
        is_read,
        is_pinned: false,
        authentication_results: None,
        return_path: None,
    }
}
