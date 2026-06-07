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
    "a", "au", "aux", "avec", "ce", "ces", "cette", "cet", "d", "de", "des", "du", "dans", "en",
    "et", "est", "je", "la", "le", "les", "leur", "leurs", "lui", "ma", "mais", "me", "mes", "mon",
    "ne", "nos", "notre", "nous", "on", "ou", "où", "par", "pas", "pour", "que", "qui", "quoi",
    "sa", "se", "ses", "son", "sont", "sur", "ta", "tes", "toi", "ton", "tous", "tout", "toute",
    "toutes", "tu", "un", "une", "vos", "votre", "vous", "y", "the", "a", "an", "and", "are", "as",
    "at", "be", "by", "for", "from", "has", "have", "he", "her", "his", "i", "in", "is", "it", "its",
    "me", "my", "of", "on", "or", "our", "she", "that", "their", "them", "they", "this", "to", "was",
    "we", "were", "what", "when", "which", "who", "will", "with", "you", "your", "mail", "mails",
    "email", "emails", "message", "messages", "courriel", "courriels", "chercher", "cherche",
    "recherche", "rechercher", "trouver", "trouve", "voir", "montre", "montrer", "liste", "lister",
    "afficher", "affiche", "contenant", "contient", "ayant", "avec des", "avec de", "avec du",
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

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
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
    #[serde(default)]
    pub mode: SearchMode,
    /// ISO 639-1 from `messages.detected_lang`; empty / None = any language.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
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
}
