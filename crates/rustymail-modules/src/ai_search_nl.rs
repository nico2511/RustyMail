use serde::Deserialize;

use crate::ai_llm_contracts::{sanitize_search_nl_senders, validate_search_nl_shape};
use crate::ai_llm_util::{gen_params_json_for_prompt, parse_model_json};
use rustymail_domain::{
    nl_query_requests_language_filter, nl_search_text_fallback, SearchMode, SearchQuery, Tag,
};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchLlmPartial {
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    tags: Vec<Tag>,
    #[serde(default)]
    sender: Option<String>,
    #[serde(default)]
    senders: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    language: Option<String>,
    #[serde(default)]
    mode: SearchMode,
    #[serde(default)]
    mailbox: Option<String>,
    #[serde(default)]
    date_from: Option<String>,
    #[serde(default)]
    date_to: Option<String>,
    #[serde(default)]
    relative_days: Option<i64>,
    #[serde(default)]
    has_attachment: Option<bool>,
}

pub fn nl_to_search_query(
    engine: &mut LlmEngine,
    natural: &str,
    account_id: &str,
    output_language: &str,
) -> Result<SearchQuery, LlmError> {
    let trimmed = natural.trim();
    let system = crate::prompts::system_prompt_for_language("search_nl", output_language);
    let user = trimmed.to_string();

    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_json_for_prompt(engine, system.as_str(), &user, 256, 1024),
    )?;
    let partial: SearchLlmPartial = parse_model_json(&raw)?;
    let mut all_senders = partial.senders.clone();
    if let Some(s) = partial.sender.clone() {
        all_senders.push(s);
    }
    let senders = sanitize_search_nl_senders(all_senders);
    validate_search_nl_shape(
        partial.text.as_deref(),
        partial.tags.len(),
        &senders,
        partial.mailbox.as_deref(),
    )?;

    let mut text_lc = partial
        .text
        .map(|t| t.trim().to_ascii_lowercase())
        .filter(|t| !t.is_empty());

    if text_lc.is_none() && partial.tags.is_empty() && senders.is_empty() {
        text_lc = nl_search_text_fallback(trimmed);
    }

    let language = nl_query_requests_language_filter(trimmed);

    let mode =
        if text_lc.is_some() && matches!(partial.mode, SearchMode::Semantic | SearchMode::Hybrid) {
            SearchMode::Lexical
        } else {
            partial.mode
        };

    let mailbox = partial
        .mailbox
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty());

    let date_from = sanitize_nl_date(partial.date_from.as_deref(), false);
    let date_to = sanitize_nl_date(partial.date_to.as_deref(), true);
    let relative_days = partial.relative_days.filter(|n| (1..=3650).contains(n));

    Ok(SearchQuery {
        text: text_lc,
        tags: partial.tags,
        sender: senders.first().cloned(),
        senders,
        account_id: if account_id.trim().is_empty() {
            None
        } else {
            Some(account_id.trim().to_string())
        },
        mailbox,
        mode,
        language,
        date_from,
        date_to,
        relative_days,
        has_attachment: partial.has_attachment,
        ..Default::default()
    })
}

fn sanitize_nl_date(raw: Option<&str>, end_of_day: bool) -> Option<String> {
    let v = raw?.trim();
    if v.len() == 10
        && v.as_bytes().get(4) == Some(&b'-')
        && v.as_bytes().get(7) == Some(&b'-')
        && v.bytes().all(|b| b.is_ascii_digit() || b == b'-')
    {
        return Some(if end_of_day {
            format!("{v}T23:59:59Z")
        } else {
            format!("{v}T00:00:00Z")
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use rustymail_domain::{nl_search_text_fallback, SearchQuery};

    #[test]
    fn fallback_fills_text_for_invoice_phrase() {
        let q = SearchQuery {
            text: nl_search_text_fallback("tous les mails avec des factures"),
            ..Default::default()
        };
        assert_eq!(q.text.as_deref(), Some("facture"));
    }
}
