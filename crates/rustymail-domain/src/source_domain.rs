//! Normalisation des domaines pour les tags `source:*` et l’expéditeur.

/// Partie domaine après `@`, en minuscules (sans chevrons résiduels).
pub fn host_of_email(email: &str) -> Option<String> {
    let email = email.trim();
    let (_, host) = email.rsplit_once('@')?;
    let host = host
        .trim()
        .trim_matches(|c| c == '>' || c == '<')
        .to_ascii_lowercase();
    if host.is_empty() {
        return None;
    }
    Some(host)
}

/// Sous-domaines courants à retirer (ex. `mail.amazon.fr` → `amazon.fr`).
const SOURCE_DOMAIN_STRIP: &[&str] = &[
    "mail.",
    "www.",
    "m.",
    "email.",
    "emails.",
    "notify.",
    "notifications.",
];

/// Valeurs `source:` qui ne sont pas des hôtes DNS (laissées intactes).
const RESERVED_SOURCE_TAGS: &[&str] = &["imap"];

pub fn canonical_source_domain(host: &str) -> String {
    let mut h = host.trim().to_ascii_lowercase();
    loop {
        let mut stripped = false;
        for prefix in SOURCE_DOMAIN_STRIP {
            if let Some(rest) = h.strip_prefix(prefix) {
                if rest.contains('.') {
                    h = rest.to_string();
                    stripped = true;
                    break;
                }
            }
        }
        if !stripped {
            break;
        }
    }
    h
}

pub fn canonical_source_tag_value(value: &str) -> String {
    let v = value.trim().to_ascii_lowercase();
    if RESERVED_SOURCE_TAGS.contains(&v.as_str()) {
        return v;
    }
    if !v.contains('.') {
        return v;
    }
    canonical_source_domain(&v)
}

/// Réécrit les tags `source:` d’une liste CSV et déduplique les entrées.
pub fn rewrite_tags_csv_sources(csv: &str) -> String {
    let csv = csv.trim();
    if csv.is_empty() {
        return String::new();
    }
    let mut out: Vec<String> = Vec::new();
    for part in csv.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let Some((family, value)) = part.split_once(':') else {
            continue;
        };
        let family = family.trim();
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        let tag_str = if family == "source" {
            format!("source:{}", canonical_source_tag_value(value))
        } else {
            part.to_string()
        };
        if !out.iter().any(|s| s == &tag_str) {
            out.push(tag_str);
        }
    }
    out.join(",")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_of_email_strips_chevrons() {
        assert_eq!(host_of_email("<x@y.z>"), Some("y.z".into()));
        assert_eq!(host_of_email("Foo@Substack.COM"), Some("substack.com".into()));
    }

    #[test]
    fn canonical_source_domain_strips_mail() {
        assert_eq!(canonical_source_domain("mail.amazon.fr"), "amazon.fr");
    }

    #[test]
    fn rewrite_merges_duplicate_sources_after_canonicalization() {
        let out = rewrite_tags_csv_sources(
            "source:imap,source:mail.amazon.fr,source:amazon.fr,kind:inbox",
        );
        assert!(out.contains("source:imap"));
        assert!(out.contains("source:amazon.fr"));
        assert!(!out.contains("mail.amazon.fr"));
        let amazon_count = out.matches("source:amazon.fr").count();
        assert_eq!(amazon_count, 1);
    }

    #[test]
    fn reserved_source_imap_unchanged() {
        assert_eq!(canonical_source_tag_value("imap"), "imap");
    }
}
