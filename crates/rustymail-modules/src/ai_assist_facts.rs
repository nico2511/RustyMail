//! Extraction de faits vérifiables et contrôle de cohérence brouillon ↔ fil.

use serde::Deserialize;

use crate::ai_agent_prepare_reply::AgentIntentResult;
use crate::ai_llm_util::{gen_params_json_for_prompt, parse_model_json, truncate_chars};
use rustymail_domain::{AssistFact, AssistFactsSnapshot, AssistUserPrefs};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FactsDto {
    #[serde(default)]
    facts: Vec<FactIn>,
    #[serde(default)]
    ambiguities: Vec<String>,
    #[serde(default)]
    clarification_questions: Vec<String>,
    #[serde(default)]
    confidence: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FactIn {
    kind: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    message_ids: Vec<String>,
    #[serde(default)]
    actor: Option<String>,
    #[serde(default)]
    actor_role: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConsistencyDto {
    #[serde(default)]
    aligned: bool,
    #[serde(default)]
    issues: Vec<String>,
    #[serde(default)]
    safety_flags: Vec<String>,
    /// Le brouillon inverse les rôles (remercie / demande ce que l’expéditeur vient de proposer).
    #[serde(default)]
    role_inversion: bool,
}

const VALID_KINDS: &[&str] = &["request", "deadline", "actor", "obligation", "proposal"];
const VALID_ACTORS: &[&str] = &["sender", "owner", "third_party"];
const VALID_ACTOR_ROLES: &[&str] = &["proposer", "invitee", "requester", "responder"];

/// Drapeau de sécurité bloquant : le brouillon inverse les rôles propriétaire / expéditeur.
pub const ROLE_INVERSION_FLAG: &str = "role_inversion";

/// Valeurs d’`AssistIntentSnapshot::speech_act` / `AgentIntentResult::speech_act`.
pub const SPEECH_ACT_SENDER_PROPOSES_MEETING: &str = "sender_proposes_meeting";

fn normalize_enum(raw: Option<String>, allowed: &[&str]) -> Option<String> {
    let v = raw?.trim().to_ascii_lowercase().replace([' ', '-'], "_");
    allowed.contains(&v.as_str()).then_some(v)
}

fn sanitize_facts(raw: Vec<FactIn>, transcript: &str) -> Vec<AssistFact> {
    let mut out = Vec::new();
    for f in raw.into_iter().take(24) {
        let kind = f.kind.trim().to_ascii_lowercase();
        if !VALID_KINDS.contains(&kind.as_str()) {
            continue;
        }
        let text = f.text.trim();
        if text.is_empty() || text.chars().count() > 400 {
            continue;
        }
        let message_ids: Vec<String> = f
            .message_ids
            .into_iter()
            .filter(|id| transcript.contains(id.as_str()))
            .take(6)
            .collect();
        out.push(AssistFact {
            kind,
            text: text.to_string(),
            message_ids,
            actor: normalize_enum(f.actor, VALID_ACTORS),
            actor_role: normalize_enum(f.actor_role, VALID_ACTOR_ROLES),
        });
    }
    out
}

fn clip_questions(raw: Vec<String>) -> Vec<String> {
    raw.into_iter()
        .map(|q| q.trim().chars().take(280).collect::<String>())
        .filter(|q| !q.is_empty())
        .take(5)
        .collect()
}

pub struct ExtractFactsOutput {
    pub snapshot: AssistFactsSnapshot,
    pub clarification_questions: Vec<String>,
}

/// Extrait faits + ambiguïtés depuis le fil (messageId présents dans le transcript).
pub fn extract_facts_with_llm(
    engine: &mut LlmEngine,
    thread_context: &str,
    prior_intent: Option<&AgentIntentResult>,
    user_prefs: &AssistUserPrefs,
) -> Result<ExtractFactsOutput, LlmError> {
    let lang = user_prefs.lang.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let ctx = truncate_chars(thread_context, 24_000);
    let intent_hint = prior_intent
        .map(|i| {
            let act = if i.speech_act.trim().is_empty() {
                String::new()
            } else {
                format!(" (acte : {})", i.speech_act.trim())
            };
            format!("\nIntention déjà détectée : {}{act}", i.intent)
        })
        .unwrap_or_default();
    let system = crate::prompts::system_prompt_for_language("assist_facts", lang);
    let user = format!("Fil :\n{ctx}{intent_hint}");
    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_json_for_prompt(engine, system.as_str(), &user, 768, 4096),
    )?;
    let dto: FactsDto = parse_model_json(&raw)?;
    let facts = sanitize_facts(dto.facts, &ctx);
    let ambiguities = clip_questions(dto.ambiguities);
    let mut clarification_questions = clip_questions(dto.clarification_questions);
    if clarification_questions.is_empty() && !ambiguities.is_empty() {
        clarification_questions = ambiguities
            .iter()
            .map(|a| format!("Pouvez-vous préciser : {a} ?"))
            .take(3)
            .collect();
    }
    let confidence = dto.confidence.clamp(0.0, 1.0);
    let snapshot = AssistFactsSnapshot {
        facts,
        ambiguities,
        confidence,
    };
    Ok(ExtractFactsOutput {
        snapshot,
        clarification_questions,
    })
}

pub struct ConsistencyOutput {
    pub aligned: bool,
    pub issues: Vec<String>,
    pub safety_flags: Vec<String>,
    /// Inversion de rôle détectée (LLM ou heuristique) : avertissement bloquant.
    pub role_inversion: bool,
    /// Consigne de réécriture quand `role_inversion` est vrai.
    pub rewrite_guidance: Option<String>,
}

/// Normalise pour comparaison de phrases : minuscules, sans accents ni ponctuation, espaces simples.
fn fold_phrase_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = true;
    for c in s.chars() {
        let c = match c {
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' => 'e',
            'à' | 'â' | 'ä' | 'À' | 'Â' => 'a',
            'ù' | 'û' | 'ü' => 'u',
            'î' | 'ï' => 'i',
            'ô' | 'ö' => 'o',
            'ç' => 'c',
            other => other,
        };
        for low in c.to_lowercase() {
            if low.is_alphanumeric() {
                out.push(low);
                prev_space = false;
            } else if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        }
    }
    out.trim_end().to_string()
}

/// Remerciements pour une information : à ne pas adresser à qui vient de proposer quelque chose.
const THANK_FOR_INFO_PHRASES: &[&str] = &[
    "merci de nous informer",
    "merci de m informer",
    "merci de nous avoir informe",
    "merci de m avoir informe",
    "merci de nous avoir prevenu",
    "merci de m avoir prevenu",
    "merci de nous tenir informe",
    "merci pour l information",
    "merci pour cette information",
    "merci pour votre information",
    "merci de votre information",
    "merci de nous prevenir",
    "merci de m avoir communique",
    "merci de nous avoir communique",
    "thank you for informing",
    "thanks for letting us know",
    "thanks for letting me know",
    "thank you for letting us know",
    "thank you for letting me know",
];

/// Demandes de disponibilité / de date adressées à l’expéditeur.
const ASK_AVAILABILITY_PHRASES: &[&str] = &[
    "vos disponibilites",
    "votre disponibilite",
    "quand etes vous disponible",
    "etes vous disponible",
    "quelles sont vos disponibilites",
    "nous indiquer une date",
    "nous proposer une date",
    "nous proposer un creneau",
    "me proposer une date",
    "me proposer un creneau",
    "when are you available",
    "your availability",
];

/// Marqueurs d’une vraie réponse (accord, refus, précision) : une demande de dispo y est alors une contre-proposition.
const RESPONSE_TO_PROPOSAL_MARKERS: &[&str] = &[
    "me convient",
    "nous convient",
    "ne convient pas",
    "je confirme",
    "nous confirmons",
    "d accord",
    "ok pour",
    "j accepte",
    "nous acceptons",
    "pas disponible",
    "indisponible",
    "impossible",
    "i confirm",
    "works for me",
    "works for us",
];

fn text_has_any(folded: &str, phrases: &[&str]) -> bool {
    phrases.iter().any(|p| folded.contains(p))
}

/// Vrai si le fil indique que l’expéditeur (entrant) propose un rendez-vous / une date.
pub fn sender_proposes_meeting(
    intent: Option<&AgentIntentResult>,
    facts: Option<&AssistFactsSnapshot>,
) -> bool {
    if intent.is_some_and(|i| i.speech_act.trim() == SPEECH_ACT_SENDER_PROPOSES_MEETING) {
        return true;
    }
    facts.is_some_and(|f| {
        f.facts.iter().any(|fact| {
            fact.actor.as_deref() == Some("sender")
                && (fact.actor_role.as_deref() == Some("proposer") || fact.kind == "proposal")
        })
    })
}

/// Détecte l’inversion de rôle : l’expéditeur propose, le brouillon le remercie de « nous informer »
/// ou lui redemande ses disponibilités au lieu d’accepter / confirmer / demander une précision.
pub fn draft_inverts_proposal_roles(
    intent: Option<&AgentIntentResult>,
    facts: Option<&AssistFactsSnapshot>,
    draft: &str,
) -> bool {
    if !sender_proposes_meeting(intent, facts) {
        return false;
    }
    let folded = fold_phrase_text(draft);
    if text_has_any(&folded, THANK_FOR_INFO_PHRASES) {
        return true;
    }
    text_has_any(&folded, ASK_AVAILABILITY_PHRASES)
        && !text_has_any(&folded, RESPONSE_TO_PROPOSAL_MARKERS)
}

/// Consigne de réécriture (français) quand le brouillon inverse les rôles.
pub fn role_inversion_rewrite_guidance(facts: Option<&AssistFactsSnapshot>) -> String {
    let proposal = facts.and_then(|f| {
        f.facts
            .iter()
            .find(|x| {
                x.actor.as_deref() == Some("sender")
                    && (x.actor_role.as_deref() == Some("proposer") || x.kind == "proposal")
            })
            .map(|x| x.text.as_str())
    });
    let mut s = String::from(
        "Vous êtes le propriétaire de la boîte et l’expéditeur vous fait une proposition : \
réécrivez en acceptant, en confirmant ou en posant une question de précision (heure, accès, durée). \
Ne remerciez pas l’expéditeur de « nous informer » et ne lui demandez pas ses disponibilités.",
    );
    if let Some(p) = proposal {
        s.push_str(" Proposition de l’expéditeur : ");
        s.push_str(&p.chars().take(240).collect::<String>());
    }
    s
}

/// Fusionne l’inversion de rôle (LLM + heuristique) dans issues / flags. Retourne (inversion, guidance).
fn apply_role_inversion(
    llm_flag: bool,
    intent: Option<&AgentIntentResult>,
    facts: &AssistFactsSnapshot,
    draft: &str,
    issues: &mut Vec<String>,
    safety_flags: &mut Vec<String>,
) -> (bool, Option<String>) {
    let inversion = llm_flag || draft_inverts_proposal_roles(intent, Some(facts), draft);
    if !inversion {
        return (false, None);
    }
    let msg = "Inversion de rôle : l’expéditeur propose, le brouillon le remercie de l’information ou lui redemande ses disponibilités.";
    if !issues.iter().any(|i| i.starts_with("Inversion de rôle")) {
        issues.insert(0, msg.to_string());
        issues.truncate(6);
    }
    if !safety_flags.iter().any(|f| f == ROLE_INVERSION_FLAG) {
        safety_flags.insert(0, ROLE_INVERSION_FLAG.to_string());
        safety_flags.truncate(8);
    }
    (true, Some(role_inversion_rewrite_guidance(Some(facts))))
}

/// Vérifie que le brouillon ne contredit pas les faits extraits.
pub fn consistency_check_with_llm(
    engine: &mut LlmEngine,
    thread_context: &str,
    prior_intent: Option<&AgentIntentResult>,
    facts: &AssistFactsSnapshot,
    draft: &str,
    user_prefs: &AssistUserPrefs,
) -> Result<ConsistencyOutput, LlmError> {
    let lang = user_prefs.lang.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let ctx = truncate_chars(thread_context, 12_000);
    let draft_clip = truncate_chars(draft, 8000);
    let facts_json = serde_json::to_string(facts).unwrap_or_else(|_| "{}".into());
    let system = crate::prompts::system_prompt_for_language("assist_consistency", lang);
    let intent_line = prior_intent
        .map(|i| {
            format!(
                "\n\nINTENTION : {} (acte : {})",
                i.intent,
                if i.speech_act.trim().is_empty() {
                    "inconnu"
                } else {
                    i.speech_act.trim()
                }
            )
        })
        .unwrap_or_default();
    let user = format!(
        "FIL :\n{ctx}\n\nFAITS :\n{facts_json}{intent_line}\n\nBROUILLON :\n{draft_clip}"
    );
    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_json_for_prompt(engine, system.as_str(), &user, 256, 1536),
    )?;
    let dto: ConsistencyDto = parse_model_json(&raw)?;
    let llm_role_inversion = dto.role_inversion;
    let mut issues: Vec<String> = dto
        .issues
        .into_iter()
        .map(|s| s.trim().chars().take(320).collect())
        .filter(|s: &String| !s.is_empty())
        .take(6)
        .collect();
    let mut safety_flags: Vec<String> = dto
        .safety_flags
        .into_iter()
        .map(|s| s.trim().chars().take(64).collect())
        .filter(|s: &String| !s.is_empty())
        .take(8)
        .collect();
    let (role_inversion, rewrite_guidance) = apply_role_inversion(
        llm_role_inversion || safety_flags.iter().any(|f| f == ROLE_INVERSION_FLAG),
        prior_intent,
        facts,
        draft,
        &mut issues,
        &mut safety_flags,
    );
    Ok(ConsistencyOutput {
        aligned: dto.aligned && issues.is_empty() && !role_inversion,
        issues,
        safety_flags,
        role_inversion,
        rewrite_guidance,
    })
}

pub fn facts_block_for_draft(facts: &AssistFactsSnapshot) -> String {
    if facts.facts.is_empty() {
        return String::new();
    }
    let mut lines = vec!["\nFaits établis (ne pas contredire) :".to_string()];
    for f in facts.facts.iter().take(16) {
        let who = match (f.actor.as_deref(), f.actor_role.as_deref()) {
            (Some(a), Some(r)) => format!(" ({a}/{r})"),
            (Some(a), None) => format!(" ({a})"),
            (None, Some(r)) => format!(" ({r})"),
            (None, None) => String::new(),
        };
        lines.push(format!("- [{}{who}] {}", f.kind, f.text));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_drops_invalid_kind() {
        let raw = vec![
            FactIn {
                kind: "fantasy".into(),
                text: "x".into(),
                message_ids: vec![],
                actor: None,
                actor_role: None,
            },
            FactIn {
                kind: "request".into(),
                text: "Envoyer le devis".into(),
                message_ids: vec!["m1".into()],
                actor: None,
                actor_role: None,
            },
        ];
        let out = sanitize_facts(raw, "message_id=m1");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, "request");
    }

    #[test]
    fn sanitize_keeps_typed_actors_and_drops_unknown_values() {
        let raw = vec![
            FactIn {
                kind: "proposal".into(),
                text: "Nettoyage chaudière mercredi 18 novembre matin".into(),
                message_ids: vec!["m1".into()],
                actor: Some("Sender".into()),
                actor_role: Some("Proposer".into()),
            },
            FactIn {
                kind: "actor".into(),
                text: "Technicien".into(),
                message_ids: vec![],
                actor: Some("martian".into()),
                actor_role: Some("boss".into()),
            },
        ];
        let out = sanitize_facts(raw, "message_id=m1");
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].actor.as_deref(), Some("sender"));
        assert_eq!(out[0].actor_role.as_deref(), Some("proposer"));
        assert_eq!(out[1].actor, None);
        assert_eq!(out[1].actor_role, None);
    }

    fn intent(act: &str) -> AgentIntentResult {
        AgentIntentResult {
            intent: "Le prestataire propose un nettoyage de chaudière".into(),
            tone_hint: "neutral".into(),
            needs_scheduling: true,
            speech_act: act.into(),
        }
    }

    fn sender_proposal_facts() -> AssistFactsSnapshot {
        let mut f = AssistFact::new(
            "proposal",
            "ACTION DEPANNAGE propose le nettoyage le mercredi 18 novembre 2026 le matin",
        );
        f.actor = Some("sender".into());
        f.actor_role = Some("proposer".into());
        AssistFactsSnapshot {
            facts: vec![f],
            ambiguities: vec![],
            confidence: 0.9,
        }
    }

    const INVERTED_DRAFT: &str = "Bonjour,\n\nMerci de nous informer de cette maintenance. \
Pourriez-vous nous indiquer vos disponibilités pour le nettoyage ?\n\nCordialement";
    const GOOD_DRAFT: &str = "Bonjour,\n\nLe mercredi 18 novembre le matin me convient pour le nettoyage. \
Pouvez-vous préciser l'heure d'arrivée ?\n\nCordialement";

    #[test]
    fn role_inversion_detected_when_sender_proposes() {
        let facts = sender_proposal_facts();
        assert!(sender_proposes_meeting(None, Some(&facts)));
        assert!(draft_inverts_proposal_roles(None, Some(&facts), INVERTED_DRAFT));
        assert!(!draft_inverts_proposal_roles(None, Some(&facts), GOOD_DRAFT));
    }

    #[test]
    fn role_inversion_uses_intent_speech_act_without_facts() {
        let i = intent(SPEECH_ACT_SENDER_PROPOSES_MEETING);
        assert!(draft_inverts_proposal_roles(Some(&i), None, INVERTED_DRAFT));
        let other = intent("sender_informs");
        assert!(!draft_inverts_proposal_roles(Some(&other), None, INVERTED_DRAFT));
        assert!(!draft_inverts_proposal_roles(None, None, INVERTED_DRAFT));
    }

    #[test]
    fn counter_proposal_after_refusal_is_not_inversion() {
        let facts = sender_proposal_facts();
        let draft = "Bonjour,\n\nCe jour ne me convient pas. Quelles sont vos disponibilités la semaine suivante ?";
        assert!(!draft_inverts_proposal_roles(None, Some(&facts), draft));
    }

    #[test]
    fn apply_role_inversion_adds_blocking_flag_and_guidance() {
        let facts = sender_proposal_facts();
        let mut issues = vec!["autre écart".to_string()];
        let mut flags = Vec::new();
        let (inv, guidance) =
            apply_role_inversion(false, None, &facts, INVERTED_DRAFT, &mut issues, &mut flags);
        assert!(inv);
        assert_eq!(flags.first().map(String::as_str), Some(ROLE_INVERSION_FLAG));
        assert!(issues[0].starts_with("Inversion de rôle"));
        assert_eq!(issues.len(), 2);
        let g = guidance.expect("guidance");
        assert!(g.contains("propriétaire"));
        assert!(g.contains("18 novembre"));

        let mut issues = Vec::new();
        let mut flags = Vec::new();
        let (inv, guidance) =
            apply_role_inversion(false, None, &facts, GOOD_DRAFT, &mut issues, &mut flags);
        assert!(!inv && guidance.is_none() && issues.is_empty() && flags.is_empty());

        // Le drapeau du LLM seul suffit.
        let (inv, _) = apply_role_inversion(true, None, &facts, GOOD_DRAFT, &mut issues, &mut flags);
        assert!(inv);
    }

    #[test]
    fn facts_block_shows_actor_and_role() {
        let block = facts_block_for_draft(&sender_proposal_facts());
        assert!(block.contains("[proposal (sender/proposer)]"));
    }
}
