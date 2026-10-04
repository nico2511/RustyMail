//! Détection intention / phishing LLM — enrichit les signaux déterministes sans les effacer.

use serde::Deserialize;

use crate::ai_llm_util::{
    budget_report, gen_params_json_for_prompt_with_grammar, truncate_chars, user_text_for_engine,
};
use crate::mail_security::gbnf::SECURITY_FINDINGS_GBNF;
use crate::mail_security::{finalize_security_signals, merge_heuristic_and_llm_findings};
use rustymail_domain::{
    MailSecurityFinding, MailSecurityFindingKind, MailSecurityFindingSeverity,
    MailSecurityLlmContext, MailSecuritySignals,
};
use rustymail_llm::{gen_params_with_grammar, LlmEngine, LlmError};

const MAX_LLM_FINDING_CODE_LEN: usize = 64;
const MAX_LLM_MESSAGE_FR_CHARS: usize = 512;
const MAX_LLM_FINDINGS: usize = 3;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmSecurityPack {
    #[serde(default)]
    findings: Vec<LlmFindingIn>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmFindingIn {
    code: String,
    severity: MailSecurityFindingSeverity,
    message_fr: String,
}

fn findings_digest(fr: &[MailSecurityFinding]) -> String {
    fr.iter()
        .take(24)
        .map(|f| format!("{} ({:?}) {}", f.code, f.severity, f.message_fr))
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_mail_context(ctx: &MailSecurityLlmContext) -> String {
    let reply = if ctx.reply_to.is_empty() {
        "(aucun)".to_string()
    } else {
        ctx.reply_to
            .iter()
            .take(6)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    };
    let atts = if ctx.attachment_names.is_empty() {
        "(aucune)".to_string()
    } else {
        ctx.attachment_names
            .iter()
            .take(12)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    };
    let hosts = if ctx.link_hosts.is_empty() {
        "(aucun)".to_string()
    } else {
        ctx.link_hosts
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    };
    let body = truncate_chars(ctx.body_excerpt.trim(), 2_400);
    format!(
        "De : {} <{}>\nReply-To : {}\nObjet : {}\nPièces jointes : {}\nHôtes de liens : {}\n\nCorps (extrait) :\n{}",
        truncate_chars(ctx.from_name.trim(), 120),
        truncate_chars(ctx.from_email.trim(), 180),
        truncate_chars(&reply, 400),
        truncate_chars(ctx.subject.trim(), 240),
        truncate_chars(&atts, 400),
        truncate_chars(&hosts, 600),
        body
    )
}

fn valid_llm_finding_code(code: &str) -> bool {
    let c = code.trim();
    if c.is_empty() || c.len() > MAX_LLM_FINDING_CODE_LEN {
        return false;
    }
    let mut chars = c.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_lowercase() {
        return false;
    }
    chars.all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_')
}

fn valid_llm_finding_in(f: &LlmFindingIn) -> bool {
    let code = f.code.trim();
    let message_fr = f.message_fr.trim();
    valid_llm_finding_code(code)
        && !message_fr.is_empty()
        && message_fr.chars().count() <= MAX_LLM_MESSAGE_FR_CHARS
}

/// Validation structurelle + sémantique légère après désérialisation JSON.
fn validate_security_pack(pack: &LlmSecurityPack) -> bool {
    if pack.findings.len() > MAX_LLM_FINDINGS {
        return false;
    }
    pack.findings.iter().all(valid_llm_finding_in)
}

fn normalize_msg(s: &str) -> String {
    s.chars()
        .flat_map(|c| c.to_lowercase())
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Rejette les reprises cosmétique des messages heuristiques déjà affichés.
fn llm_message_adds_value(heuristic: &[MailSecurityFinding], message_fr: &str) -> bool {
    let norm = normalize_msg(message_fr);
    if norm.chars().count() < 12 {
        return false;
    }
    for h in heuristic {
        let hn = normalize_msg(&h.message_fr);
        if hn.is_empty() {
            continue;
        }
        if norm == hn {
            return false;
        }
        if norm.contains(&hn) || hn.contains(&norm) {
            // Trop proche d’un signal déjà listé.
            if norm.chars().count().abs_diff(hn.chars().count()) < 40 {
                return false;
            }
        }
    }
    true
}

fn sanitize_llm_findings(
    raw: Vec<LlmFindingIn>,
    heuristic: &[MailSecurityFinding],
) -> Vec<MailSecurityFinding> {
    let mut out = Vec::new();
    for f in raw.into_iter().take(MAX_LLM_FINDINGS) {
        if !valid_llm_finding_in(&f) {
            continue;
        }
        let code = f.code.trim();
        let message_fr = f.message_fr.trim();
        if !llm_message_adds_value(heuristic, message_fr) {
            continue;
        }
        out.push(MailSecurityFinding {
            kind: MailSecurityFindingKind::LlmIntent,
            code: code.to_string(),
            severity: f.severity,
            message_fr: message_fr.to_string(),
        });
    }
    out
}

pub fn augment_security_with_llm(
    base: MailSecuritySignals,
    context: &MailSecurityLlmContext,
    engine: &mut LlmEngine,
    prefs_security_on: bool,
    output_language: &str,
) -> Result<MailSecuritySignals, LlmError> {
    if !prefs_security_on {
        return Ok(base);
    }

    let heuristic_findings = base.findings.clone();

    let sys = crate::prompts::system_prompt_for_language("security_llm", output_language);
    let digest = truncate_chars(&base.summary_fr, 2_048);
    let fd = findings_digest(&heuristic_findings);
    let mail_ctx = format_mail_context(context);
    let user = user_text_for_engine(
        engine,
        &format!(
            "Synthèse heuristique :\n{digest}\n\nSignaux existants :\n{fd}\n\nContexte du message :\n{mail_ctx}"
        ),
    );

    let params = gen_params_with_grammar(
        gen_params_json_for_prompt_with_grammar(
            engine,
            sys.as_str(),
            &user,
            320,
            896,
            SECURITY_FINDINGS_GBNF,
        ),
        SECURITY_FINDINGS_GBNF,
    );

    let pack: LlmSecurityPack =
        match engine.generate_json(sys.as_str(), &user, SECURITY_FINDINGS_GBNF, &params) {
            Ok(p) if validate_security_pack(&p) => p,
            Ok(_) | Err(_) => return Ok(base),
        };

    let budget = budget_report(
        engine.n_ctx(),
        engine,
        sys.as_str(),
        &user,
        None,
        base.summary_fr.chars().count() > 2_048
            || context.body_excerpt.chars().count() > 2_400,
    );

    let llm_findings = sanitize_llm_findings(pack.findings, &heuristic_findings);
    if llm_findings.is_empty() {
        // Rien d’utile ajouté : ne pas revendiquer une contribution IA (pas de llm_budget).
        return Ok(base);
    }

    let merged = merge_heuristic_and_llm_findings(&heuristic_findings, llm_findings);
    let mut out = finalize_security_signals(merged);
    out.llm_budget = Some(budget);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::{
        MailSecurityFinding, MailSecurityFindingKind, MailSecurityFindingSeverity,
        MailSecuritySeverity,
    };

    fn heuristic_base() -> MailSecuritySignals {
        MailSecuritySignals {
            severity: MailSecuritySeverity::Attention,
            summary_fr: "Certains éléments méritent une vérification.".to_string(),
            findings: vec![
                MailSecurityFinding {
                    kind: MailSecurityFindingKind::Heuristic,
                    code: "spf_fail".to_string(),
                    severity: MailSecurityFindingSeverity::Suspicion,
                    message_fr: "SPF en échec.".to_string(),
                },
                MailSecurityFinding {
                    kind: MailSecurityFindingKind::Heuristic,
                    code: "many_hyperlinks".to_string(),
                    severity: MailSecurityFindingSeverity::Attention,
                    message_fr: "Beaucoup de liens (heuristique).".to_string(),
                },
            ],
            llm_budget: None,
        }
    }

    #[test]
    fn hard_heuristic_preserved_when_llm_same_code() {
        let base = heuristic_base();
        let llm = vec![MailSecurityFinding {
            kind: MailSecurityFindingKind::LlmIntent,
            code: "spf_fail".to_string(),
            severity: MailSecurityFindingSeverity::Info,
            message_fr: "SPF ok selon IA (faux).".to_string(),
        }];
        let merged = merge_heuristic_and_llm_findings(&base.findings, llm);
        let spf = merged
            .iter()
            .find(|f| f.code == "spf_fail")
            .expect("spf_fail");
        assert_eq!(spf.kind, MailSecurityFindingKind::Heuristic);
        assert_eq!(spf.severity, MailSecurityFindingSeverity::Suspicion);
    }

    #[test]
    fn soft_heuristic_replaced_by_llm_with_same_code() {
        let base = heuristic_base();
        let llm = vec![MailSecurityFinding {
            kind: MailSecurityFindingKind::LlmIntent,
            code: "many_hyperlinks".to_string(),
            severity: MailSecurityFindingSeverity::Attention,
            message_fr: "Nombreux liens (IA).".to_string(),
        }];
        let merged = merge_heuristic_and_llm_findings(&base.findings, llm);
        assert_eq!(
            merged
                .iter()
                .filter(|f| f.code == "many_hyperlinks")
                .count(),
            1
        );
        assert_eq!(
            merged
                .iter()
                .find(|f| f.code == "many_hyperlinks")
                .unwrap()
                .kind,
            MailSecurityFindingKind::LlmIntent
        );
    }

    #[test]
    fn rejects_invalid_llm_codes() {
        assert!(!valid_llm_finding_code(""));
        assert!(!valid_llm_finding_code("SPF_FAIL"));
        assert!(!valid_llm_finding_code("a b"));
        assert!(valid_llm_finding_code("urgency_rephrase"));
    }

    #[test]
    fn validate_pack_rejects_too_many_findings() {
        let pack = LlmSecurityPack {
            findings: (0..4)
                .map(|i| LlmFindingIn {
                    code: format!("code_{i}"),
                    severity: MailSecurityFindingSeverity::Info,
                    message_fr: "ok".into(),
                })
                .collect(),
        };
        assert!(!validate_security_pack(&pack));
    }

    #[test]
    fn validate_pack_rejects_bad_code() {
        let pack = LlmSecurityPack {
            findings: vec![LlmFindingIn {
                code: "BAD".into(),
                severity: MailSecurityFindingSeverity::Info,
                message_fr: "x".into(),
            }],
        };
        assert!(!validate_security_pack(&pack));
    }

    #[test]
    fn sanitize_drops_oversized_message() {
        let long = "é".repeat(MAX_LLM_MESSAGE_FR_CHARS + 1);
        let kept = sanitize_llm_findings(
            vec![LlmFindingIn {
                code: "test_code".into(),
                severity: MailSecurityFindingSeverity::Info,
                message_fr: long,
            }],
            &[],
        );
        assert!(kept.is_empty());
    }

    #[test]
    fn sanitize_drops_cosmetic_rephrase() {
        let base = heuristic_base();
        let kept = sanitize_llm_findings(
            vec![LlmFindingIn {
                code: "many_hyperlinks".into(),
                severity: MailSecurityFindingSeverity::Attention,
                message_fr: "Beaucoup de liens (heuristique).".into(),
            }],
            &base.findings,
        );
        assert!(kept.is_empty());
    }

    #[test]
    fn sanitize_keeps_new_intent() {
        let base = heuristic_base();
        let kept = sanitize_llm_findings(
            vec![LlmFindingIn {
                code: "credential_ask".into(),
                severity: MailSecurityFindingSeverity::Suspicion,
                message_fr: "Demande explicite de mot de passe ou de code dans le corps."
                    .into(),
            }],
            &base.findings,
        );
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].code, "credential_ask");
    }
}
