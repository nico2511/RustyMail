//! Historique cité en texte brut : on le retire du corps lu, on le garde repliable.
//!
//! Le dernier message reste visible. La queue (Outlook `De :` / `Envoyé :` / `Objet :`,
//! `Le … a écrit :`, `On … wrote:`, `>` , bannière « message d’origine ») part dans
//! `collapsed_quotes`. Un mail qui EST la citation (transfert sans réponse) reste entier.

use std::sync::LazyLock;

use regex::Regex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuoteCollapseResult {
    pub visible_text: String,
    pub collapsed_quotes: Vec<String>,
    pub dimmed_blocks: Vec<String>,
}

const MIN_REPLY_CHARS: usize = 2;

static RE_ATTRIBUTION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(?:on\s+.+?\bwrote\s*:?|le\s+.+?\ba\s+[eéèê]crit\s*:?)\s*$")
        .expect("attribution line")
});

static RE_FROM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(?:de|from)\s*:").expect("from line"));

static RE_SENT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(?:envoy[ée]e?(?:\s+le)?|sent|date)\s*:").expect("sent line")
});

static RE_SUBJECT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(?:objet|subject)\s*:").expect("subject line"));

static RE_HEADER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)^(?:de|from|envoy[ée]e?(?:\s+le)?|sent|date|à|to|cc|cci|bcc|objet|subject)\s*:",
    )
    .expect("header line")
});

static RE_BANNER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)^(?:-{2,}\s*)?(?:original message|message d['’]origine|forwarded message|begin forwarded message|début du message transféré|debut du message transfere)\b",
    )
    .expect("original message banner")
});

static RE_OUTLOOK_BLOB: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?is)(?:de\s*:|from\s*:|-----original message-----).*?(?:envoy[ée]\s*:|sent\s*:).*?(?:objet\s*:|subject\s*:)",
    )
    .expect("outlook header blob")
});

pub fn collapse_quotes(input: &str) -> QuoteCollapseResult {
    let owned: Vec<String> = input.lines().map(|l| l.to_string()).collect();
    let refs: Vec<&str> = owned.iter().map(|s| s.as_str()).collect();

    if let Some(idx) = quoted_history_start(&refs) {
        let mut visible = Vec::new();
        let mut dimmed = Vec::new();
        for line in &owned[..idx] {
            if looks_like_disclaimer(line.trim_start()) {
                dimmed.push(line.clone());
            } else {
                visible.push(line.as_str());
            }
        }
        let quote = owned[idx..].join("\n").trim().to_string();
        return QuoteCollapseResult {
            visible_text: visible.join("\n").trim().to_string(),
            collapsed_quotes: if quote.is_empty() {
                Vec::new()
            } else {
                vec![quote]
            },
            dimmed_blocks: dimmed,
        };
    }

    let mut visible = Vec::new();
    let mut dimmed = Vec::new();
    for line in &owned {
        if looks_like_disclaimer(line.trim_start()) {
            dimmed.push(line.clone());
        } else {
            visible.push(line.as_str());
        }
    }
    QuoteCollapseResult {
        visible_text: visible.join("\n").trim().to_string(),
        collapsed_quotes: Vec::new(),
        dimmed_blocks: dimmed,
    }
}

/// Index de la première ligne d’historique, s’il reste une réponse avant.
pub fn quoted_history_start(lines: &[&str]) -> Option<usize> {
    lines.iter().enumerate().find_map(|(i, _)| {
        if !line_starts_quoted_history(lines, i) {
            return None;
        }
        if visible_chars_before(lines, i) < MIN_REPLY_CHARS {
            return None;
        }
        Some(i)
    })
}

pub fn line_starts_quoted_history(lines: &[&str], index: usize) -> bool {
    let Some(line) = lines.get(index) else {
        return false;
    };
    let t = normalize_line(line);
    if t.is_empty() {
        return false;
    }
    if is_quote_prefix(&t) || is_attribution_line(&t) || is_original_banner(&t) {
        return true;
    }
    if is_from_line(&t) && (outlook_run_completes(lines, index) || line_has_outlook_blob(&t)) {
        return true;
    }
    false
}

pub fn history_fold_label(first_line: &str) -> String {
    let t = normalize_line(first_line);
    if is_attribution_line(&t) {
        return truncate_chars(&t, 120);
    }
    "Historique".to_string()
}

pub fn normalize_line(line: &str) -> String {
    line.replace('\u{00a0}', " ")
        .replace(['\u{2019}', '\u{2018}'], "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn visible_chars_before(lines: &[&str], index: usize) -> usize {
    lines[..index].iter().map(|l| visible_char_count(l)).sum()
}

fn visible_char_count(t: &str) -> usize {
    t.chars()
        .filter(|c| !c.is_whitespace() && *c != '\u{00a0}')
        .count()
}

fn is_quote_prefix(t: &str) -> bool {
    t.starts_with('>')
}

fn is_attribution_line(t: &str) -> bool {
    !t.is_empty() && t.chars().count() < 240 && RE_ATTRIBUTION.is_match(t)
}

fn is_original_banner(t: &str) -> bool {
    RE_BANNER.is_match(t)
}

fn is_from_line(t: &str) -> bool {
    RE_FROM.is_match(t) && t.chars().count() < 220
}

fn line_has_outlook_blob(t: &str) -> bool {
    RE_OUTLOOK_BLOB.is_match(t)
}

fn outlook_run_completes(lines: &[&str], start: usize) -> bool {
    let mut saw_sent = false;
    let mut saw_subject = false;
    let mut looked = 0usize;
    for line in lines.iter().skip(start + 1) {
        let t = normalize_line(line);
        if t.is_empty() {
            continue;
        }
        looked += 1;
        if looked > 8 {
            break;
        }
        if RE_SENT.is_match(&t) {
            saw_sent = true;
        } else if RE_SUBJECT.is_match(&t) {
            saw_subject = true;
        } else if RE_HEADER.is_match(&t) || (t.contains('@') && t.chars().count() < 120) {
            // À / Cc / poursuite d’en-tête
        } else if line_has_outlook_blob(&t) {
            saw_sent = true;
            saw_subject = true;
        } else {
            break;
        }
        if saw_sent && saw_subject {
            return true;
        }
    }
    let head = normalize_line(lines.get(start).copied().unwrap_or(""));
    (saw_sent && saw_subject) || line_has_outlook_blob(&head)
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}

fn looks_like_disclaimer(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.contains("confidential")
        || lower.contains("do not print")
        || lower.contains("intended recipient")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_outlook_header_and_wrote_chain_after_the_reply() {
        let input = "\
Bonjour Mr EXEMPLE,

Pouvez-vous me rappeler svp

Merci
Cordialement

De : Alice Exemple
Envoyé : mercredi 16 septembre 2026 11:44
À : secretariat@example.fr
Objet : RE: Demande de rendez-vous

Bonjour,

Merci pour votre retour.

Le 14 septembre 2026 13:21:22 GMT+02:00, Alice Exemple <alice@exemple.me> a écrit :

Voici le document demandé.
";
        let out = collapse_quotes(input);
        assert!(out.visible_text.contains("Pouvez-vous me rappeler"));
        assert!(out.visible_text.contains("Bonjour Mr EXEMPLE"));
        assert!(!out.visible_text.contains("document demandé"));
        assert!(!out.visible_text.contains("De :"));
        assert_eq!(out.collapsed_quotes.len(), 1);
        assert!(out.collapsed_quotes[0].contains("De : Alice"));
        assert!(out.collapsed_quotes[0].contains("a écrit"));
        assert!(out.collapsed_quotes[0].contains("document demandé"));
    }

    #[test]
    fn keeps_a_forward_that_is_only_the_quoted_mail() {
        let input = "\
De : Alice
Envoyé : lundi
Objet : TR: brief

Bonjour, voici le brief.
";
        let out = collapse_quotes(input);
        assert!(out.visible_text.contains("voici le brief"));
        assert!(out.collapsed_quotes.is_empty());
    }

    #[test]
    fn folds_angle_quote_tail_including_unprefixed_lines() {
        let out = collapse_quotes("Réponse courte.\n\n> Ancien\nencore cité\n");
        assert_eq!(out.visible_text, "Réponse courte.");
        assert!(out.collapsed_quotes[0].contains("Ancien"));
        assert!(out.collapsed_quotes[0].contains("encore cité"));
    }

    #[test]
    fn does_not_treat_prose_de_as_a_header() {
        let out = collapse_quotes("On part de : la gare.\nPuis on avise.\n");
        assert!(out.visible_text.contains("la gare"));
        assert!(out.collapsed_quotes.is_empty());
    }
}
