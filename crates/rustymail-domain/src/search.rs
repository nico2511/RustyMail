use crate::Tag;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchMode {
    #[default]
    Lexical,
    Semantic,
    Hybrid,
}

/// Mots vides FR/EN à ignorer lors de l’extraction heuristique NL (pas pour la barre manuelle).
const NL_STOPWORDS: &[&str] = &[
    "a",
    "au",
    "aux",
    "avec",
    "ce",
    "ces",
    "cette",
    "cet",
    "d",
    "de",
    "des",
    "du",
    "dans",
    "en",
    "et",
    "est",
    "je",
    "la",
    "le",
    "les",
    "leur",
    "leurs",
    "lui",
    "ma",
    "mais",
    "me",
    "mes",
    "mon",
    "ne",
    "nos",
    "notre",
    "nous",
    "on",
    "ou",
    "où",
    "par",
    "pas",
    "pour",
    "que",
    "qui",
    "quoi",
    "sa",
    "se",
    "ses",
    "son",
    "sont",
    "sur",
    "ta",
    "tes",
    "toi",
    "ton",
    "tous",
    "tout",
    "toute",
    "toutes",
    "tu",
    "un",
    "une",
    "vos",
    "votre",
    "vous",
    "y",
    "the",
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "have",
    "he",
    "her",
    "his",
    "i",
    "in",
    "is",
    "it",
    "its",
    "me",
    "my",
    "of",
    "on",
    "or",
    "our",
    "she",
    "that",
    "their",
    "them",
    "they",
    "this",
    "to",
    "was",
    "we",
    "were",
    "what",
    "when",
    "which",
    "who",
    "will",
    "with",
    "you",
    "your",
    "mail",
    "mails",
    "email",
    "emails",
    "message",
    "messages",
    "courriel",
    "courriels",
    "chercher",
    "cherche",
    "recherche",
    "rechercher",
    "trouver",
    "trouve",
    "voir",
    "montre",
    "montrer",
    "liste",
    "lister",
    "afficher",
    "affiche",
    "contenant",
    "contient",
    "ayant",
    "avec des",
    "avec de",
    "avec du",
];

/// (mot dans la phrase, terme de recherche lexicale)
const NL_CONTENT_HINTS: &[(&str, &str)] = &[
    ("factures", "facture"),
    ("facture", "facture"),
    ("invoices", "invoice"),
    ("invoice", "invoice"),
    ("paiement", "paiement"),
    ("paiements", "paiement"),
    ("payment", "payment"),
    ("payments", "payment"),
    ("billing", "billing"),
    ("facturation", "facturation"),
    ("reçu", "reçu"),
    ("recu", "recu"),
    ("receipt", "receipt"),
    ("receipts", "receipt"),
    ("échéance", "échéance"),
    ("echeance", "echeance"),
    ("commande", "commande"),
    ("commandes", "commande"),
    ("order", "order"),
    ("orders", "order"),
    ("devis", "devis"),
    ("quote", "quote"),
    ("quotes", "quote"),
    ("abonnement", "abonnement"),
    ("subscription", "subscription"),
    ("newsletter", "newsletter"),
    ("newsletters", "newsletter"),
    ("publicité", "publicité"),
    ("publicite", "publicite"),
    ("promotion", "promotion"),
    ("spam", "spam"),
    ("pièce jointe", "pièce jointe"),
    ("piece jointe", "piece jointe"),
    ("attachment", "attachment"),
    ("attachments", "attachment"),
];

/// Extrait des mots-clés de recherche depuis une phrase NL quand le LLM n’a pas rempli `text`.
/// Retourne une chaîne prête pour `lexical_search_terms` (minuscules, espaces).
#[must_use]
pub fn nl_search_text_fallback(natural: &str) -> Option<String> {
    let blob = natural.trim().to_ascii_lowercase();
    if blob.is_empty() {
        return None;
    }
    let mut terms: Vec<String> = Vec::new();
    for (hint, term) in NL_CONTENT_HINTS {
        if blob.contains(hint) && !terms.iter().any(|t| t == term) {
            terms.push((*term).to_string());
        }
    }
    if terms.is_empty() {
        for word in blob.split_whitespace() {
            let w = word.trim_matches(|c: char| !c.is_alphanumeric());
            if w.len() < 3 {
                continue;
            }
            if NL_STOPWORDS.contains(&w) {
                continue;
            }
            if terms.iter().any(|t| t == w) {
                continue;
            }
            terms.push(w.to_string());
            if terms.len() >= 4 {
                break;
            }
        }
    }
    if terms.is_empty() {
        return None;
    }
    Some(terms.join(" "))
}

/// `language` dans SearchQuery ne doit être posé que si l’utilisateur filtre la langue du contenu.
#[must_use]
pub fn nl_query_requests_language_filter(natural: &str) -> Option<String> {
    let b = natural.trim().to_ascii_lowercase();
    if b.is_empty() {
        return None;
    }
    let patterns: &[(&str, &str)] = &[
        ("en français", "fr"),
        ("en francais", "fr"),
        ("langue française", "fr"),
        ("langue francaise", "fr"),
        ("emails en français", "fr"),
        ("emails en francais", "fr"),
        ("mails en français", "fr"),
        ("mails en francais", "fr"),
        ("in french", "fr"),
        ("french emails", "fr"),
        ("french language", "fr"),
        ("en anglais", "en"),
        ("in english", "en"),
        ("english emails", "en"),
        ("mails en anglais", "en"),
        ("emails en anglais", "en"),
        ("en espagnol", "es"),
        ("in spanish", "es"),
        ("en allemand", "de"),
        ("in german", "de"),
    ];
    for (pat, code) in patterns {
        if b.contains(pat) {
            return Some((*code).to_string());
        }
    }
    None
}

/// Mots utilisés pour la recherche lexicale : plusieurs termes sont séparés par des espaces
/// ; chaque terme doit apparaître dans le même message (ET logique entre termes).
/// La chaîne passée doit déjà être en minuscules (ex. `query.text.trim().to_ascii_lowercase()`).
#[must_use]
pub fn lexical_search_terms(text_lc: &str) -> Vec<String> {
    text_lc
        .split_whitespace()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(String::from)
        .collect()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub text: Option<String>,
    pub tags: Vec<Tag>,
    /// Premier expéditeur (rétrocompat) ; préférer `senders` pour plusieurs contacts.
    pub sender: Option<String>,
    #[serde(default)]
    pub senders: Vec<String>,
    /// When `account_id` is set, search runs against SQLite for that account (all mailboxes if `mailbox` is unset; otherwise scoped to that folder).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mailbox: Option<String>,
    /// Préfixe de boîte (ex. `Archive`) : inclut tous les dossiers `prefix` et `prefix/...`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mailbox_prefix: Option<String>,
    #[serde(default)]
    pub mode: SearchMode,
    /// ISO 639-1 from `messages.detected_lang`; empty / None = any language.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Borne inférieure inclusive (RFC3339) sur `threads.last_activity`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_from: Option<String>,
    /// Borne supérieure inclusive (RFC3339) sur `threads.last_activity`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_to: Option<String>,
    /// Raccourci : filtrer les fils des N derniers jours (écrase date_from relative).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relative_days: Option<i64>,
    /// `Some(true)` = avec pièce jointe ; `Some(false)` = sans.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_attachment: Option<bool>,
    /// Score de sécurité minimum (0–100) si une colonne cache est disponible.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_security_score: Option<f32>,
    /// Pondération lexicale pour le mode hybride (0.0–1.0). Défaut applicatif : 0.55.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hybrid_lexical_weight: Option<f32>,
    /// Filtre sujet (`subject:`). Cherche dans la colonne sujet, pas dans le corps.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    /// Destinataires (`to:`), e-mails ou domaines.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub recipients: Vec<String>,
    /// Termes exclus (`-mot`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub exclude_terms: Vec<String>,
    /// Phrases exactes (`"…"`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub phrases: Vec<String>,
    /// Page de résultats (0 = début). Défaut applicatif : 0.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<u32>,
    /// Taille de page. Défaut applicatif : 200, plafond 500.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

/// Extrait `from:`, `to:`, `subject:`, `before:`, `after:`, `"phrase"`, `-mot` du texte libre.
/// Les termes restants (y compris `prefix*`) restent dans `text`.
///
/// Une date `before:` / `after:` illisible est une erreur (pas une borne ignorée).
pub fn absorb_search_operators(query: &mut SearchQuery) -> Result<(), String> {
    let Some(raw) = query.text.clone() else {
        return Ok(());
    };
    let parsed = parse_search_operators(&raw)?;
    if parsed.from.is_empty()
        && parsed.to.is_empty()
        && parsed.subject.is_empty()
        && parsed.exclude.is_empty()
        && parsed.phrases.is_empty()
        && parsed.before.is_none()
        && parsed.after.is_none()
    {
        return Ok(());
    }
    for sender in parsed.from {
        if !query
            .senders
            .iter()
            .any(|s| s.eq_ignore_ascii_case(&sender))
        {
            query.senders.push(sender);
        }
    }
    for recipient in parsed.to {
        if !query
            .recipients
            .iter()
            .any(|s| s.eq_ignore_ascii_case(&recipient))
        {
            query.recipients.push(recipient);
        }
    }
    if !parsed.subject.is_empty() {
        let extra = parsed.subject.join(" ");
        query.subject = Some(match query.subject.take() {
            Some(prev) if !prev.trim().is_empty() => format!("{prev} {extra}"),
            _ => extra,
        });
    }
    for term in parsed.exclude {
        if !query
            .exclude_terms
            .iter()
            .any(|s| s.eq_ignore_ascii_case(&term))
        {
            query.exclude_terms.push(term);
        }
    }
    for phrase in parsed.phrases {
        if !query.phrases.iter().any(|s| s == &phrase) {
            query.phrases.push(phrase);
        }
    }
    if query.date_from.is_none() {
        query.date_from = parsed.after;
    }
    if query.date_to.is_none() {
        query.date_to = parsed.before;
    }
    let rest = parsed.rest.trim();
    query.text = if rest.is_empty() {
        None
    } else {
        Some(rest.to_string())
    };
    Ok(())
}

struct ParsedOperators {
    rest: String,
    from: Vec<String>,
    to: Vec<String>,
    subject: Vec<String>,
    exclude: Vec<String>,
    phrases: Vec<String>,
    before: Option<String>,
    after: Option<String>,
}

fn parse_search_operators(raw: &str) -> Result<ParsedOperators, String> {
    let mut out = ParsedOperators {
        rest: String::new(),
        from: Vec::new(),
        to: Vec::new(),
        subject: Vec::new(),
        exclude: Vec::new(),
        phrases: Vec::new(),
        before: None,
        after: None,
    };
    let chars: Vec<char> = raw.chars().collect();
    let mut i = 0;
    let mut rest: Vec<char> = Vec::new();
    while i < chars.len() {
        if chars[i].is_whitespace() {
            rest.push(chars[i]);
            i += 1;
            continue;
        }
        if chars[i] == '"' {
            let phrase = read_quoted(&chars, &mut i);
            if !phrase.is_empty() {
                out.phrases.push(phrase.to_ascii_lowercase());
            }
            continue;
        }
        if chars[i] == '-' && i + 1 < chars.len() && chars[i + 1] == '"' {
            i += 1;
            let phrase = read_quoted(&chars, &mut i);
            if phrase.chars().count() >= 2 {
                out.exclude.push(phrase.to_ascii_lowercase());
            }
            continue;
        }
        let start = i;
        while i < chars.len() && !chars[i].is_whitespace() {
            i += 1;
        }
        let token: String = chars[start..i].iter().collect();
        if let Some(rest_tok) = token.strip_prefix('-') {
            let term = rest_tok.trim().trim_matches('"');
            if term.chars().count() >= 2 && !term.contains(':') {
                out.exclude.push(term.to_ascii_lowercase());
                continue;
            }
        }
        if let Some((key, value)) = split_operator(&token) {
            let value = read_operator_value(&chars, &mut i, value)?;
            if value.is_empty() {
                continue;
            }
            match key {
                "from" => out.from.push(value.to_ascii_lowercase()),
                "to" => out.to.push(value.to_ascii_lowercase()),
                "subject" => out.subject.push(value.to_ascii_lowercase()),
                "before" => {
                    if out.before.is_none() {
                        out.before = Some(normalize_search_date(&value, true)?);
                    }
                }
                "after" => {
                    if out.after.is_none() {
                        out.after = Some(normalize_search_date(&value, false)?);
                    }
                }
                _ => rest.extend(token.chars()),
            }
            continue;
        }
        rest.extend(token.chars());
    }
    out.rest = rest
        .into_iter()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    Ok(out)
}

fn read_quoted(chars: &[char], i: &mut usize) -> String {
    if *i < chars.len() && chars[*i] == '"' {
        *i += 1;
    }
    let mut phrase = String::new();
    while *i < chars.len() && chars[*i] != '"' {
        phrase.push(chars[*i]);
        *i += 1;
    }
    if *i < chars.len() && chars[*i] == '"' {
        *i += 1;
    }
    phrase.trim().to_string()
}

/// Valeur d'opérateur, y compris `subject:"plusieurs mots"`.
fn read_operator_value(chars: &[char], i: &mut usize, inline: &str) -> Result<String, String> {
    let inline = inline.trim();
    if let Some(rest) = inline.strip_prefix('"') {
        let mut value = rest.to_string();
        if inline.ends_with('"') && inline.len() > 1 {
            value.pop();
            return Ok(value.trim().to_string());
        }
        while *i < chars.len() {
            let ch = chars[*i];
            *i += 1;
            if ch == '"' {
                break;
            }
            value.push(ch);
        }
        return Ok(value.trim().to_string());
    }
    if inline.is_empty() {
        while *i < chars.len() && chars[*i].is_whitespace() {
            *i += 1;
        }
        if *i < chars.len() && chars[*i] == '"' {
            return Ok(read_quoted(chars, i));
        }
    }
    Ok(inline.trim_matches('"').to_string())
}

fn split_operator(token: &str) -> Option<(&str, &str)> {
    let (key, value) = token.split_once(':')?;
    let key = key.trim().to_ascii_lowercase();
    if matches!(key.as_str(), "from" | "to" | "subject" | "before" | "after") {
        Some((
            match key.as_str() {
                "from" => "from",
                "to" => "to",
                "subject" => "subject",
                "before" => "before",
                "after" => "after",
                _ => return None,
            },
            value,
        ))
    } else {
        None
    }
}

/// `AAAA-MM-JJ`, `JJ/MM/AAAA` ou RFC3339 → borne. Sinon erreur explicite.
fn normalize_search_date(value: &str, end_of_day: bool) -> Result<String, String> {
    let v = value.trim();
    let fail = || format!("date invalide « {v} » : utilisez AAAA-MM-JJ");
    if let Some((date, has_time)) = split_calendar_prefix(v) {
        if valid_iso_date(date) {
            if has_time {
                return Ok(v.to_string());
            }
            return Ok(day_bound(date, end_of_day));
        }
    }
    if let Some(date) = parse_dmy(v) {
        return Ok(day_bound(&date, end_of_day));
    }
    Err(fail())
}

fn day_bound(date: &str, end_of_day: bool) -> String {
    if end_of_day {
        format!("{date}T23:59:59Z")
    } else {
        format!("{date}T00:00:00Z")
    }
}

fn split_calendar_prefix(value: &str) -> Option<(&str, bool)> {
    let bytes = value.as_bytes();
    if bytes.len() >= 10 && bytes.get(4) == Some(&b'-') && bytes.get(7) == Some(&b'-') {
        let date = &value[..10];
        let has_time = bytes.len() > 10 && bytes.get(10) == Some(&b'T');
        return Some((date, has_time));
    }
    if bytes.len() >= 10 && bytes.get(4) == Some(&b'/') && bytes.get(7) == Some(&b'/') {
        return None;
    }
    None
}

fn parse_dmy(value: &str) -> Option<String> {
    let parts: Vec<&str> = value.split(['/', '-']).collect();
    if parts.len() != 3 {
        return None;
    }
    if parts[0].len() == 4 {
        return None;
    }
    let day: u32 = parts[0].parse().ok()?;
    let month: u32 = parts[1].parse().ok()?;
    let year: i32 = parts[2].parse().ok()?;
    if parts[2].len() != 4 || !valid_ymd(year, month, day) {
        return None;
    }
    Some(format!("{year:04}-{month:02}-{day:02}"))
}

fn valid_iso_date(value: &str) -> bool {
    let mut parts = value.split('-');
    let Some(year) = parts.next().and_then(|p| p.parse::<i32>().ok()) else {
        return false;
    };
    let Some(month) = parts.next().and_then(|p| p.parse::<u32>().ok()) else {
        return false;
    };
    let Some(day) = parts.next().and_then(|p| p.parse::<u32>().ok()) else {
        return false;
    };
    parts.next().is_none() && valid_ymd(year, month, day)
}

fn valid_ymd(year: i32, month: u32, day: u32) -> bool {
    if !(1..=12).contains(&month) || day == 0 || year < 1 {
        return false;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max = match month {
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    day <= max
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexical_search_terms_splits_on_whitespace() {
        assert_eq!(
            lexical_search_terms("castorama facture"),
            vec!["castorama".to_string(), "facture".to_string()]
        );
        assert!(lexical_search_terms("   ").is_empty());
        assert_eq!(lexical_search_terms("solo"), vec!["solo".to_string()]);
    }

    #[test]
    fn nl_fallback_extracts_invoice_keywords() {
        assert_eq!(
            nl_search_text_fallback("tous les mails avec des factures").as_deref(),
            Some("facture")
        );
        assert_eq!(
            nl_search_text_fallback("emails with invoices from Amazon").as_deref(),
            Some("invoice")
        );
    }

    #[test]
    fn nl_fallback_does_not_use_full_phrase_stopwords() {
        let fb = nl_search_text_fallback("tous les mails avec des factures").unwrap();
        assert_eq!(lexical_search_terms(&fb), vec!["facture".to_string()]);
    }

    #[test]
    fn nl_language_filter_only_when_explicit() {
        assert!(nl_query_requests_language_filter("mails avec des factures").is_none());
        assert_eq!(
            nl_query_requests_language_filter("mails en français sur le projet").as_deref(),
            Some("fr")
        );
    }

    #[test]
    fn operators_leave_keywords_and_fill_structured_fields() {
        let mut q = SearchQuery {
            text: Some(
                "facture* from:ada@ex.fr to:bob@ex.fr subject:commande \"bon de commande\" -pub after:2024-01-01 before:2024-06-30"
                    .into(),
            ),
            ..Default::default()
        };
        absorb_search_operators(&mut q).expect("operators");
        assert_eq!(q.text.as_deref(), Some("facture*"));
        assert_eq!(q.senders, vec!["ada@ex.fr".to_string()]);
        assert_eq!(q.recipients, vec!["bob@ex.fr".to_string()]);
        assert_eq!(q.subject.as_deref(), Some("commande"));
        assert_eq!(q.phrases, vec!["bon de commande".to_string()]);
        assert_eq!(q.exclude_terms, vec!["pub".to_string()]);
        assert_eq!(q.date_from.as_deref(), Some("2024-01-01T00:00:00Z"));
        assert_eq!(q.date_to.as_deref(), Some("2024-06-30T23:59:59Z"));
    }

    #[test]
    fn subject_quoted_phrase_stays_one_field() {
        let mut q = SearchQuery {
            text: Some("subject:\"bon de commande\" facture".into()),
            ..Default::default()
        };
        absorb_search_operators(&mut q).expect("ok");
        assert_eq!(q.subject.as_deref(), Some("bon de commande"));
        assert_eq!(q.text.as_deref(), Some("facture"));
    }

    #[test]
    fn french_day_month_year_is_accepted_and_garbage_rejected() {
        let mut q = SearchQuery {
            text: Some("after:01/02/2024".into()),
            ..Default::default()
        };
        absorb_search_operators(&mut q).expect("dmy");
        assert_eq!(q.date_from.as_deref(), Some("2024-02-01T00:00:00Z"));

        let mut bad = SearchQuery {
            text: Some("before:hier".into()),
            ..Default::default()
        };
        let err = absorb_search_operators(&mut bad).expect_err("reject");
        assert!(err.contains("date invalide"), "{err}");
        assert!(err.contains("AAAA-MM-JJ"), "{err}");
    }
}
