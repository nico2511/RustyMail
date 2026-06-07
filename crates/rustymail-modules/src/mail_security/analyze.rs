use std::collections::hash_map::Entry;
use std::collections::HashMap;

use rustymail_domain::{
    MailSecurityFinding, MailSecurityFindingKind, MailSecurityFindingSeverity, MailSecuritySeverity,
    MailSecuritySignals, Message,
};

const MANY_URL_THRESHOLD: usize = 10;

/// Heuristiques déterministes à partir du modèle `Message` déjà chargé.
pub fn analyze_mail_security(message: &Message) -> MailSecuritySignals {
    let mut findings: Vec<MailSecurityFinding> = Vec::new();

    check_reply_to_mismatch(message, &mut findings);
    check_freemail_institutional_display(message, &mut findings);
    check_urgency_language(message, &mut findings);
    check_attachments(message, &mut findings);
    check_link_density(message, &mut findings);
    check_authentication_headers(message, &mut findings);
    check_return_path_alignment(message, &mut findings);
    check_message_id(message, &mut findings);
    check_punycode_or_homoglyph_urls(message, &mut findings);
    check_composite_phishing_score(&mut findings);

    aggregate(findings)
}

/// Signaux déterministes à ne jamais supprimer lors d’un enrichissement LLM.
pub fn is_hard_security_finding(f: &MailSecurityFinding) -> bool {
    if f.kind != MailSecurityFindingKind::Heuristic {
        return false;
    }
    let code = f.code.as_str();
    matches!(
        code,
        "spf_fail"
            | "spf_softfail"
            | "dkim_fail"
            | "dmarc_fail"
            | "return_path_domain_mismatch"
            | "reply_to_differs_from_from"
            | "freemail_institutional_display_name"
            | "composite_phishing_risk"
            | "punycode_or_homoglyph_url"
    ) || code.starts_with("risky_attachment:")
}

/// Fusionne les findings heuristiques et LLM : les signaux « durs » heuristiques sont toujours conservés.
pub fn merge_heuristic_and_llm_findings(
    heuristic: &[MailSecurityFinding],
    llm: Vec<MailSecurityFinding>,
) -> Vec<MailSecurityFinding> {
    let hard: Vec<MailSecurityFinding> = heuristic
        .iter()
        .filter(|f| is_hard_security_finding(f))
        .cloned()
        .collect();
    let hard_codes: std::collections::HashSet<String> =
        hard.iter().map(|f| f.code.clone()).collect();

    let mut merged = hard;
    let llm_codes: std::collections::HashSet<String> =
        llm.iter().map(|f| f.code.clone()).collect();

    for lf in llm {
        if hard_codes.contains(&lf.code) {
            continue;
        }
        merged.push(lf);
    }

    for sf in heuristic.iter().filter(|f| !is_hard_security_finding(f)) {
        if llm_codes.contains(&sf.code) {
            continue;
        }
        if merged.iter().any(|m| m.code == sf.code) {
            continue;
        }
        merged.push(sf.clone());
    }

    merged
}

fn check_reply_to_mismatch(message: &Message, out: &mut Vec<MailSecurityFinding>) {
    if message.reply_to.is_empty() {
        return;
    }
    let from = message.sender.email.trim().to_ascii_lowercase();
    let any_matches = message
        .reply_to
        .iter()
        .any(|r| r.email.trim().eq_ignore_ascii_case(&from));
    if !any_matches {
        out.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::Heuristic,
            code: "reply_to_differs_from_from".to_string(),
            severity: MailSecurityFindingSeverity::Attention,
            message_fr: "L’adresse de réponse (Reply-To) est différente de l’expéditeur apparent. C’est courant pour les envois automatiques (newsletters, notifications), mais aussi utilisé en hameçonnage : vérifiez avant de répondre ou cliquer.".to_string(),
        });
    }
}

fn freemail_domain(domain: &str) -> bool {
    let d = domain.trim().to_ascii_lowercase();
    matches!(
        d.as_str(),
        "gmail.com"
            | "googlemail.com"
            | "yahoo.com"
            | "yahoo.fr"
            | "hotmail.com"
            | "hotmail.fr"
            | "outlook.com"
            | "outlook.fr"
            | "live.com"
            | "live.fr"
            | "icloud.com"
            | "me.com"
            | "mac.com"
            | "proton.me"
            | "protonmail.com"
            | "aol.com"
            | "msn.com"
    ) || d.ends_with(".yahoo.com")
        || d.ends_with(".hotmail.com")
        || d.ends_with(".outlook.com")
}

fn sender_domain(message: &Message) -> Option<String> {
    let e = message.sender.email.trim();
    let (_, dom) = e.rsplit_once('@')?;
    let dom = dom.trim().to_ascii_lowercase();
    (!dom.is_empty()).then_some(dom)
}

fn institutional_display_hint(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    [
        "banque",
        "bank ",
        "sécurité",
        "securite",
        "paypal",
        "microsoft",
        "apple",
        "service client",
        "support ",
        "it ",
        "rh ",
        "paie ",
        "impôt",
        "impot",
        "urssaf",
        "dossier",
        "vérif",
        "verif ",
        "compte bloqu",
        "netflix",
        "amazon",
        "fedex",
        "chronopost",
        "dhl ",
    ]
    .iter()
    .any(|kw| n.contains(kw))
}

fn check_freemail_institutional_display(message: &Message, out: &mut Vec<MailSecurityFinding>) {
    let Some(dom) = sender_domain(message) else {
        return;
    };
    if !freemail_domain(&dom) {
        return;
    }
    let Some(name) = message
        .sender
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    else {
        return;
    };
    if institutional_display_hint(name) {
        out.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::Heuristic,
            code: "freemail_institutional_display_name".to_string(),
            severity: MailSecurityFindingSeverity::Attention,
            message_fr: format!(
                "Le nom « {name} » évoque une organisation, mais l’expéditeur utilise un domaine webmail grand public ({dom}). Contrôlez le domaine avant toute confiance." 
            ),
        });
    }
}

fn combined_search_blob(message: &Message) -> String {
    format!("{} {}", message.subject.trim(), message.plain_body.trim()).to_ascii_lowercase()
}

fn check_urgency_language(message: &Message, out: &mut Vec<MailSecurityFinding>) {
    let blob = combined_search_blob(message);
    let urgency_fr = [
        "urgent",
        "immédiat",
        "immediat",
        "sans délai",
        "sans delai",
        "compte suspendu",
        "compte bloqué",
        "compte bloque",
        "mot de passe",
        "cliquez vite",
        "confirmez immédiatement",
        "confirmez immediatement",
        "fraude sécuritaire",
        "fraude securitaire",
        "action requise",
        "48 heures",
        "24 heures",
    ];
    let urgency_en = [
        "urgent",
        "act now",
        "verify your account",
        "password expir",
        "wire transfer",
        "gift card",
        "immediately",
        "click here now",
        "suspend your account",
    ];
    let hit_fr = urgency_fr.iter().any(|p| blob.contains(p));
    let hit_en = urgency_en.iter().any(|p| blob.contains(p));
    if hit_fr || hit_en {
        out.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::Heuristic,
            code: "urgency_or_credential_language".to_string(),
            severity: MailSecurityFindingSeverity::Attention,
            message_fr:
                "Langage pressant ou lié aux identifiants : les attaquants forgent souvent l’urgence. Vérifiez l’expéditeur et le site par un canal officiel.".to_string(),
        });
    }
}

fn extension_risk(file_name: &str) -> Option<MailSecurityFindingSeverity> {
    let lower = file_name.to_ascii_lowercase();
    let ext = lower.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
    match ext {
        "exe" | "bat" | "cmd" | "scr" | "com" | "pif" | "msi" | "js" | "jse" | "vbs" | "wsf"
        | "ps1" | "app" | "dmg" | "deb" | "rpm" => Some(MailSecurityFindingSeverity::Suspicion),
        "docm" | "dotm" | "xlsm" | "xltm" | "pptm" | "reg" | "hta" => {
            Some(MailSecurityFindingSeverity::Attention)
        }
        _ => None,
    }
}

fn check_attachments(message: &Message, out: &mut Vec<MailSecurityFinding>) {
    for att in &message.attachments {
        if let Some(sev) = extension_risk(&att.file_name) {
            let msg = match sev {
                MailSecurityFindingSeverity::Suspicion => {
                    "Pièce jointe avec une extension souvent associée à des programmes ou scripts : ne l’ouvrez pas si vous ne l’attendiez pas.".to_string()
                }
                MailSecurityFindingSeverity::Attention => {
                    "Pièce jointe pouvant contenir des macros ou du code actif : ouvrez-la seulement si la source est sûre.".to_string()
                }
                MailSecurityFindingSeverity::Info => continue,
            };
            out.push(MailSecurityFinding {
                kind: MailSecurityFindingKind::Heuristic,
                code: format!("risky_attachment:{}", att.file_name),
                severity: sev,
                message_fr: msg,
            });
        }
    }
}

fn count_urls_in_text(s: &str) -> usize {
    s.match_indices("http://").count() + s.match_indices("https://").count()
}

fn strip_tags_for_url_scan(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

fn check_link_density(message: &Message, out: &mut Vec<MailSecurityFinding>) {
    let mut n = count_urls_in_text(&message.plain_body);
    if let Some(html) = message.html_body.as_deref() {
        n += count_urls_in_text(&strip_tags_for_url_scan(html));
        // href= counts (often duplicates visible URLs — still indicative of noisy HTML mail)
        n += html.to_ascii_lowercase().matches("href=\"http").count();
        n += html.to_ascii_lowercase().matches("href='http").count();
    }
    if n >= MANY_URL_THRESHOLD {
        out.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::Heuristic,
            code: "many_hyperlinks".to_string(),
            severity: MailSecurityFindingSeverity::Attention,
            message_fr: format!(
                "Beaucoup de liens dans ce message (au moins ~{MANY_URL_THRESHOLD}). Passez le curseur sur les liens (sans cliquer) pour vérifier la destination réelle."
            ),
        });
    }
}

fn authentication_results_failure(header: &str) -> Vec<MailSecurityFinding> {
    let lower = header.to_ascii_lowercase();
    let mut v = Vec::new();

    if lower.contains("spf=fail") {
        v.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::Heuristic,
            code: "spf_fail".to_string(),
            severity: MailSecurityFindingSeverity::Suspicion,
            message_fr: "L’en-tête indique une vérification SPF en échec pour ce message. Cela peut arriver légitimement mais mérite méfiance.".to_string(),
        });
    } else if lower.contains("spf=softfail") {
        v.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::Heuristic,
            code: "spf_softfail".to_string(),
            severity: MailSecurityFindingSeverity::Attention,
            message_fr:
                "L’en-tête indique un SPF « softfail » : authenticité IP partiellement douteuse."
                    .to_string(),
        });
    }

    if lower.contains("dkim=fail") {
        v.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::Heuristic,
            code: "dkim_fail".to_string(),
            severity: MailSecurityFindingSeverity::Suspicion,
            message_fr: "La signature DKIM semble en échec sur ce message reçu : le contenu peut avoir été altéré ou l’expéditeur usurpé.".to_string(),
        });
    }

    if lower.contains("dmarc=fail") {
        v.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::Heuristic,
            code: "dmarc_fail".to_string(),
            severity: MailSecurityFindingSeverity::Suspicion,
            message_fr: "L’en-tête DMARC indique un échec : l’alignement domaine / politique n’est pas respecté.".to_string(),
        });
    }

    v
}

fn check_authentication_headers(message: &Message, out: &mut Vec<MailSecurityFinding>) {
    let Some(h) = message.authentication_results.as_deref() else {
        return;
    };
    if h.trim().is_empty() {
        return;
    }
    out.extend(authentication_results_failure(h));
}

fn parse_return_path_domain(raw: &str) -> Option<String> {
    let t = raw.trim();
    let inner = t
        .strip_prefix('<')
        .and_then(|s| s.strip_suffix('>'))
        .unwrap_or(t);
    let at = inner.rfind('@')?;
    let domain = inner[at + 1..].trim_matches('>');
    let domain = domain.trim().trim_end_matches('.');
    let d = domain.to_ascii_lowercase();
    (!d.is_empty()).then_some(d)
}

fn check_return_path_alignment(message: &Message, out: &mut Vec<MailSecurityFinding>) {
    let Some(rp_dom) = message
        .return_path
        .as_deref()
        .and_then(parse_return_path_domain)
    else {
        return;
    };
    let Some(from_dom) = sender_domain(message) else {
        return;
    };
    if rp_dom != from_dom
        && !(rp_dom.ends_with(&format!(".{}", from_dom))
            || from_dom.ends_with(&format!(".{}", rp_dom)))
    {
        out.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::Heuristic,
            code: "return_path_domain_mismatch".to_string(),
            severity: MailSecurityFindingSeverity::Attention,
            message_fr: format!(
                "Le domaine technique d’envoi ({rp_dom}) ne correspond pas au domaine de l’expéditeur ({from_dom}). Possible liste ou relais, ou usurpation : à recouper avec SPF/DMARC ci-dessus."
            ),
        });
    }
}

fn host_from_url_prefix(lower: &str, scheme_len: usize) -> Option<&str> {
    let rest = lower.get(scheme_len..)?;
    let host = rest.split(&['/', '?', '#', ':'][..]).next()?;
    let host = host.trim_matches(|c| c == '<' || c == '>' || c == '"' || c == '\'');
    (!host.is_empty()).then_some(host)
}

fn host_looks_suspicious(host: &str) -> bool {
    if host.contains("xn--") {
        return true;
    }
    let labels: Vec<&str> = host.split('.').collect();
    for label in labels {
        if label.is_empty() {
            continue;
        }
        let ascii = label.bytes().all(|b| b.is_ascii());
        let has_letter = label.chars().any(|c| c.is_alphabetic());
        if has_letter && !ascii {
            return true;
        }
    }
    false
}

fn blob_has_suspicious_url_domain(blob: &str) -> bool {
    let lower = blob.to_ascii_lowercase();
    for (scheme, len) in [("https://", 8usize), ("http://", 7usize)] {
        let mut start = 0;
        while let Some(pos) = lower[start..].find(scheme) {
            let idx = start + pos;
            if let Some(host) = host_from_url_prefix(&lower, idx + len) {
                if host_looks_suspicious(host) {
                    return true;
                }
            }
            start = idx + len;
        }
    }
    false
}

fn check_punycode_or_homoglyph_urls(message: &Message, out: &mut Vec<MailSecurityFinding>) {
    let mut blob = message.plain_body.clone();
    if let Some(html) = message.html_body.as_deref() {
        blob.push(' ');
        blob.push_str(&strip_tags_for_url_scan(html));
    }
    if !blob_has_suspicious_url_domain(&blob) {
        return;
    }
    out.push(MailSecurityFinding {
        kind: MailSecurityFindingKind::Heuristic,
        code: "punycode_or_homoglyph_url".to_string(),
        severity: MailSecurityFindingSeverity::Suspicion,
        message_fr: "Au moins un lien pointe vers un domaine en punycode (xn--) ou avec des caractères non latins dans l’hôte : technique courante pour imiter une marque connue. Vérifiez l’URL affichée au survol.".to_string(),
    });
}

fn check_composite_phishing_score(findings: &mut Vec<MailSecurityFinding>) {
    if findings
        .iter()
        .any(|f| f.code == "composite_phishing_risk")
    {
        return;
    }
    let auth_fail = findings.iter().any(|f| {
        matches!(
            f.code.as_str(),
            "spf_fail" | "dkim_fail" | "dmarc_fail"
        )
    });
    let pressure = findings
        .iter()
        .any(|f| f.code == "urgency_or_credential_language");
    let display_spoof = findings
        .iter()
        .any(|f| f.code == "freemail_institutional_display_name");
    let identity_mismatch = findings.iter().any(|f| {
        matches!(
            f.code.as_str(),
            "return_path_domain_mismatch" | "reply_to_differs_from_from"
        )
    });

    let elevated = (auth_fail && (pressure || display_spoof || identity_mismatch))
        || (pressure && display_spoof && identity_mismatch);
    if !elevated {
        return;
    }
    findings.push(MailSecurityFinding {
        kind: MailSecurityFindingKind::Heuristic,
        code: "composite_phishing_risk".to_string(),
        severity: MailSecurityFindingSeverity::Suspicion,
        message_fr: "Plusieurs signaux se cumulent (authenticité, identité affichée, urgence) : traiter ce message comme à haut risque jusqu’à vérification par un canal officiel.".to_string(),
    });
}

fn check_message_id(message: &Message, out: &mut Vec<MailSecurityFinding>) {
    let mid = message
        .references
        .message_id_header
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if mid.is_none() {
        out.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::Heuristic,
            code: "missing_message_id".to_string(),
            severity: MailSecurityFindingSeverity::Info,
            message_fr:
                "Identifiant de message absent : certains courriers légitimes en sont dépourvus."
                    .to_string(),
        });
    }
}

fn finding_rank(sev: MailSecurityFindingSeverity) -> u8 {
    match sev {
        MailSecurityFindingSeverity::Info => 0,
        MailSecurityFindingSeverity::Attention => 1,
        MailSecurityFindingSeverity::Suspicion => 2,
    }
}

fn merge_findings_by_code(findings: Vec<MailSecurityFinding>) -> Vec<MailSecurityFinding> {
    let mut best: HashMap<String, MailSecurityFinding> = HashMap::new();
    for f in findings {
        match best.entry(f.code.clone()) {
            Entry::Vacant(slot) => {
                slot.insert(f);
            }
            Entry::Occupied(mut o) => {
                if finding_rank(f.severity) > finding_rank(o.get().severity) {
                    o.insert(f);
                }
            }
        }
    }
    let mut out: Vec<_> = best.into_values().collect();
    out.sort_by(|a, b| a.code.cmp(&b.code));
    out
}

/// Recalcule sévérité, synthèse et fusion par code (utilisé après remplacement IA).
pub fn finalize_security_signals(findings: Vec<MailSecurityFinding>) -> MailSecuritySignals {
    aggregate(findings)
}

fn aggregate(findings: Vec<MailSecurityFinding>) -> MailSecuritySignals {
    let findings = merge_findings_by_code(findings);

    let mut has_suspicion = false;
    let mut has_attention = false;
    for f in &findings {
        match f.severity {
            MailSecurityFindingSeverity::Suspicion => has_suspicion = true,
            MailSecurityFindingSeverity::Attention => has_attention = true,
            MailSecurityFindingSeverity::Info => {}
        }
    }

    let severity = if has_suspicion {
        MailSecuritySeverity::Suspicion
    } else if has_attention {
        MailSecuritySeverity::Attention
    } else {
        MailSecuritySeverity::Ok
    };

    let summary_fr = match severity {
        MailSecuritySeverity::Ok
            if findings
                .iter()
                .any(|f| matches!(f.severity, MailSecurityFindingSeverity::Info)) =>
        {
            "Aucune alerte majeure : quelques informations de contexte sont listées.".to_string()
        }
        MailSecuritySeverity::Ok => {
            "Rien d’inhabituel détecté selon les règles locales.".to_string()
        }
        MailSecuritySeverity::Attention => {
            "Certains éléments méritent une vérification avant réponse ou clic.".to_string()
        }
        MailSecuritySeverity::Suspicion => {
            "Plusieurs signaux sont inquiétants : restez prudent et confirmez par un autre canal."
                .to_string()
        }
    };

    MailSecuritySignals {
        severity,
        summary_fr,
        findings,
        llm_budget: None,
    }
}
