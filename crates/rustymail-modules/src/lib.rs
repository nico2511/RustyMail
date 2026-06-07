pub mod prompts;
mod ai_llm_util;
pub mod ai_llm_contracts;
pub use ai_llm_util::LLM_CANCELLED;
pub mod ai_extraction;
pub mod ai_summary;
pub mod ai_tagging;
pub mod ai_translation;
pub mod ai_writing;
pub mod ai_grammar;
pub mod ai_quick_reply;
pub mod ai_agent_prepare_reply;
pub mod ai_assist_facts;
pub mod ai_assist_skills;
pub mod ai_assist_thread;
pub mod ai_contact_profile;
pub mod ai_qa;
pub mod ai_search_nl;
pub mod ai_inbox_digest;
pub mod ai_action_brief;
pub mod ai_org_proposals;
pub mod ai_flux_affiner;
pub mod mail_cleaning;

/// Alias historique : signatures HTML vivent dans [`mail_cleaning::signature_html`].
pub use mail_cleaning::signature_html as html_signature;
pub mod mail_security;
pub mod quote_collapse;
pub mod signature_detection;

use rustymail_domain::{CleanedMessageView, Entity, HtmlCleaningProviderKind, Message};

use crate::mail_cleaning::types::ProviderId;

fn html_cleaning_kind(resolved: ProviderId) -> HtmlCleaningProviderKind {
    match resolved {
        ProviderId::Generic => HtmlCleaningProviderKind::Generic,
        ProviderId::Amazon => HtmlCleaningProviderKind::Amazon,
        ProviderId::Deblock => HtmlCleaningProviderKind::Deblock,
    }
}

pub fn clean_message(message: &Message) -> CleanedMessageView {
    let plain = strip_html_like_plain(&message.plain_body);
    let without_signature = signature_detection::strip_signature(&plain);
    let quote_result = quote_collapse::collapse_quotes(&without_signature);
    let extraction =
        ai_extraction::extract_entities(&quote_result.visible_text, Some(message.id.0.clone()));
    let tags = ai_tagging::tag_message(message, &extraction.entities);

    let cleaned_html_bundle = message.html_body.as_ref().map(|html| {
        let input = mail_cleaning::CleaningInput::from_message(message);
        let r = mail_cleaning::clean_html_builtin(&input, html);
        (r.html, r.conversation_text, html_cleaning_kind(r.resolved_provider))
    });
    let (cleaned_html_body, conversation_text, html_cleaning_provider) = match cleaned_html_bundle {
        Some((h, conv, provider)) => (Some(h), conv, Some(provider)),
        None => (None, None, None),
    };

    let cleaned_text = if let Some(conv) = conversation_text.filter(|s| !s.trim().is_empty()) {
        conv
    } else {
        quote_result.visible_text
    };

    let mail_security = mail_security::analyze_mail_security(message);

    CleanedMessageView {
        message_id: message.id.0.clone(),
        sender: message.display_sender(),
        sender_email: message.sender.email.clone(),
        is_newsletter: false,
        detected_lang: message.detected_lang.clone(),
        received_at: message.received_at.clone(),
        source_text: message.plain_body.clone(),
        cleaned_text,
        html_body: message.html_body.clone(),
        cleaned_html_body,
        html_cleaning_provider,
        collapsed_quotes: quote_result.collapsed_quotes,
        dimmed_blocks: quote_result.dimmed_blocks,
        attachments: message.attachments.clone(),
        recipients: message.recipients.clone(),
        tags,
        entities: extraction.entities,
        mail_security,
    }
}

fn strip_html_like_plain(input: &str) -> String {
    // Some senders put HTML fragments inside the text/plain part.
    // For the "clean" reading UX, strip tags to avoid rendering raw markup noise.
    let s = input.trim();
    if s.is_empty() {
        return String::new();
    }
    let lower = s.to_ascii_lowercase();
    let looks_html = lower.contains("<html")
        || lower.contains("<body")
        || lower.contains("<div")
        || lower.contains("<table")
        || lower.contains("<span")
        || lower.contains("<p ")
        || lower.contains("<br")
        || lower.contains("</");
    if !looks_html {
        return input.to_string();
    }

    // Minimal and safe: remove anything inside <...> blocks.
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

    // Normalize whitespace a bit, but keep line breaks.
    out.lines()
        .map(|l| l.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub fn merge_entities(messages: &[CleanedMessageView]) -> Vec<Entity> {
    let mut entities = Vec::new();
    for message in messages {
        for entity in &message.entities {
            if !entities.contains(entity) {
                entities.push(entity.clone());
            }
        }
    }
    entities
}
