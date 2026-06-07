use rustymail_domain::{Entity, EntityKind, ExtractionResult};

pub fn extract_entities(text: &str, source_message_id: Option<String>) -> ExtractionResult {
    let mut entities = Vec::new();

    for token in text.split_whitespace() {
        let clean = token.trim_matches(|c: char| {
            matches!(
                c,
                ',' | '.' | ';' | ':' | ')' | '(' | '[' | ']' | '{' | '}' | '"' | '\'' | '>' | '<'
            )
        });
        if clean.contains('@') && clean.contains('.') {
            push_unique(
                &mut entities,
                EntityKind::Email,
                clean.to_string(),
                source_message_id.clone(),
            );
        }
        if clean.starts_with("http://") || clean.starts_with("https://") {
            push_unique(
                &mut entities,
                EntityKind::Link,
                clean.to_string(),
                source_message_id.clone(),
            );
            // Avoid misclassifying URL/query tokens (e.g. orderId=..., ref_=...) as identifiers.
            continue;
        }
        if looks_like_identifier(clean) {
            push_unique(
                &mut entities,
                EntityKind::Identifier,
                clean.to_string(),
                source_message_id.clone(),
            );
        }
    }

    for line in text.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.contains("deadline") || lower.contains("by ") || lower.contains("due ") {
            push_unique(
                &mut entities,
                EntityKind::ActionItem,
                line.trim().to_string(),
                source_message_id.clone(),
            );
        }
        if lower.contains("monday")
            || lower.contains("tuesday")
            || lower.contains("wednesday")
            || lower.contains("thursday")
            || lower.contains("friday")
        {
            push_unique(
                &mut entities,
                EntityKind::Date,
                line.trim().to_string(),
                source_message_id.clone(),
            );
        }
    }

    ExtractionResult { entities }
}

fn push_unique(
    entities: &mut Vec<Entity>,
    kind: EntityKind,
    value: String,
    source_message_id: Option<String>,
) {
    let entity = Entity {
        kind,
        value,
        source_message_id,
    };
    if !entities.contains(&entity) {
        entities.push(entity);
    }
}

fn looks_like_identifier(value: &str) -> bool {
    // Don't treat URL-ish or query-ish strings as identifiers.
    if value.contains("://")
        || value.contains('/')
        || value.contains('?')
        || value.contains('&')
        || value.contains('=')
        || value.contains('%')
        || value.contains('#')
        || value.contains('@')
    {
        return false;
    }

    // Keep identifiers reasonably "token-like" (alnum plus a few safe separators).
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return false;
    }

    let has_digit = value.chars().any(|c| c.is_ascii_digit());
    let has_alpha = value.chars().any(|c| c.is_ascii_alphabetic());
    has_digit && has_alpha && value.len() >= 6
}
