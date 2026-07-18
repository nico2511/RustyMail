//! Brief d'action boîte : un passage LLM JSON + filtrage des preuves (fil_id autorisés).

use std::collections::HashSet;

use serde::Deserialize;

use crate::ai_llm_util::{
    budget_report, gen_params_json_for_prompt, parse_model_json, truncate_chars,
    user_text_for_engine,
};
use rustymail_domain::{
    ActionBriefAmbiguity, ActionBriefChange, ActionBriefDecision, ActionBriefEvidenceLink,
    ActionBriefMode, ActionBriefPriorityBucket, ActionBriefRecommendedAction, ActionBriefResult,
    ActionBriefRisk, TokenBudgetReport,
};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefEvidenceDto {
    thread_id: String,
    #[serde(default)]
    message_ids: Vec<String>,
    #[serde(default)]
    label: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefChangeDto {
    id: String,
    summary: String,
    #[serde(default)]
    since_last_brief: bool,
    #[serde(default)]
    evidence_links: Vec<BriefEvidenceDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefDecisionDto {
    rank: u32,
    title: String,
    #[serde(default)]
    impact: String,
    #[serde(default)]
    options_hint: Vec<String>,
    #[serde(default)]
    evidence_links: Vec<BriefEvidenceDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefActionDto {
    rank: u32,
    action: String,
    #[serde(default)]
    suggested_owner: String,
    #[serde(default)]
    suggested_due: Option<String>,
    #[serde(default)]
    priority: String,
    #[serde(default)]
    evidence_links: Vec<BriefEvidenceDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefRiskDto {
    label: String,
    #[serde(default)]
    severity: String,
    #[serde(default)]
    detail: String,
    #[serde(default)]
    evidence_links: Vec<BriefEvidenceDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefAmbiguityDto {
    question: String,
    #[serde(default)]
    why_it_matters: String,
    #[serde(default)]
    evidence_links: Vec<BriefEvidenceDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmBriefDto {
    #[serde(default)]
    changes: Vec<BriefChangeDto>,
    #[serde(default)]
    decisions: Vec<BriefDecisionDto>,
    #[serde(default)]
    recommended_actions: Vec<BriefActionDto>,
    #[serde(default)]
    risks: Vec<BriefRiskDto>,
    #[serde(default)]
    ambiguities: Vec<BriefAmbiguityDto>,
    #[serde(default)]
    evidence_links: Vec<BriefEvidenceDto>,
    #[serde(default)]
    confidence: f64,
    #[serde(default)]
    priority_bucket: Option<String>,
    #[serde(default)]
    verification_recommended: bool,
}

fn ev_from(d: BriefEvidenceDto) -> ActionBriefEvidenceLink {
    ActionBriefEvidenceLink {
        thread_id: d.thread_id.trim().to_string(),
        message_ids: d.message_ids,
        label: d.label.filter(|s| !s.trim().is_empty()),
    }
}

fn filter_evidence_vec(
    links: Vec<BriefEvidenceDto>,
    allowed_threads: &HashSet<String>,
) -> Vec<ActionBriefEvidenceLink> {
    links
        .into_iter()
        .filter(|e| allowed_threads.contains(e.thread_id.trim()))
        .map(ev_from)
        .collect()
}

fn dto_to_result(
    dto: LlmBriefDto,
    account_id: &str,
    mailbox: &str,
    mode: ActionBriefMode,
    allowed_threads: &HashSet<String>,
    engine: &mut LlmEngine,
    system: &str,
    user: &str,
    raw: &str,
    input_truncated: bool,
) -> ActionBriefResult {
    let mut verification = dto.verification_recommended;

    let changes: Vec<ActionBriefChange> = dto
        .changes
        .into_iter()
        .map(|c| {
            let ev = filter_evidence_vec(c.evidence_links, allowed_threads);
            if ev.is_empty() && !c.summary.trim().is_empty() {
                verification = true;
            }
            ActionBriefChange {
                id: c.id,
                summary: c.summary,
                since_last_brief: c.since_last_brief,
                evidence_links: ev,
            }
        })
        .collect();

    let decisions: Vec<ActionBriefDecision> = dto
        .decisions
        .into_iter()
        .map(|d| {
            let ev = filter_evidence_vec(d.evidence_links, allowed_threads);
            if ev.is_empty() {
                verification = true;
            }
            ActionBriefDecision {
                rank: d.rank,
                title: d.title,
                impact: d.impact,
                options_hint: d.options_hint,
                evidence_links: ev,
            }
        })
        .collect();

    let recommended_actions: Vec<ActionBriefRecommendedAction> = dto
        .recommended_actions
        .into_iter()
        .map(|a| {
            let ev = filter_evidence_vec(a.evidence_links, allowed_threads);
            if ev.is_empty() {
                verification = true;
            }
            ActionBriefRecommendedAction {
                rank: a.rank,
                action: a.action,
                suggested_owner: a.suggested_owner,
                suggested_due: a.suggested_due,
                priority: a.priority,
                evidence_links: ev,
            }
        })
        .collect();

    let risks: Vec<ActionBriefRisk> = dto
        .risks
        .into_iter()
        .map(|r| {
            let ev = filter_evidence_vec(r.evidence_links, allowed_threads);
            if ev.is_empty() {
                verification = true;
            }
            ActionBriefRisk {
                label: r.label,
                severity: r.severity,
                detail: r.detail,
                evidence_links: ev,
            }
        })
        .collect();

    let ambiguities: Vec<ActionBriefAmbiguity> = dto
        .ambiguities
        .into_iter()
        .map(|a| {
            let ev = filter_evidence_vec(a.evidence_links, allowed_threads);
            ActionBriefAmbiguity {
                question: a.question,
                why_it_matters: a.why_it_matters,
                evidence_links: ev,
            }
        })
        .collect();

    let evidence_links = filter_evidence_vec(dto.evidence_links, allowed_threads);

    let priority_bucket = parse_priority_bucket(dto.priority_bucket.as_deref(), &decisions, &risks);

    let confidence = dto.confidence.clamp(0.0, 1.0);

    ActionBriefResult {
        account_id: account_id.trim().to_string(),
        mailbox: mailbox.trim().to_string(),
        mode,
        changes,
        decisions,
        recommended_actions,
        risks,
        ambiguities,
        evidence_links,
        confidence,
        priority_bucket,
        verification_recommended: verification,
        executed_skills: vec![
            "signal_extractor_llm".into(),
            "prioritizer_rust_v1".into(),
            "action_planner_llm".into(),
            "verifier_evidence_filter".into(),
        ],
        budget: budget_report(
            engine.n_ctx(),
            engine,
            system,
            user,
            Some(raw),
            input_truncated,
        ),
    }
}

fn parse_priority_bucket(
    raw: Option<&str>,
    decisions: &[ActionBriefDecision],
    risks: &[ActionBriefRisk],
) -> ActionBriefPriorityBucket {
    let from_model = raw.map(str::trim).filter(|s| !s.is_empty()).and_then(|s| {
        match s.to_ascii_lowercase().as_str() {
            "critical" | "critique" => Some(ActionBriefPriorityBucket::Critical),
            "important" => Some(ActionBriefPriorityBucket::Important),
            "routine" => Some(ActionBriefPriorityBucket::Routine),
            _ => None,
        }
    });
    if let Some(b) = from_model {
        return b;
    }
    let any_high = risks.iter().any(|r| {
        r.severity.to_ascii_lowercase().contains("high")
            || r.severity.to_ascii_lowercase().contains("élev")
    });
    if any_high {
        return ActionBriefPriorityBucket::Critical;
    }
    if decisions.iter().any(|d| !d.title.trim().is_empty()) {
        return ActionBriefPriorityBucket::Important;
    }
    ActionBriefPriorityBucket::Routine
}

/// Préférence UI / IPC (`llm_inbox_digest` `mode`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionBriefModeRequest {
    /// Choisit Quick / Decision / Deep selon `n_ctx` (prefs ou sonde llama-server).
    Auto,
    Quick,
    Decision,
    Deep,
}

/// Bornes du snapshot boîte (fils + longueur d’aperçu) selon la fenêtre de contexte.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ActionBriefSnapshotLimits {
    pub fetch: usize,
    pub take: usize,
    pub preview_chars: usize,
}

fn mode_rank(mode: ActionBriefMode) -> u8 {
    match mode {
        ActionBriefMode::Quick => 0,
        ActionBriefMode::Decision => 1,
        ActionBriefMode::Deep => 2,
    }
}

fn min_action_brief_mode(a: ActionBriefMode, b: ActionBriefMode) -> ActionBriefMode {
    if mode_rank(a) <= mode_rank(b) {
        a
    } else {
        b
    }
}

/// Mode le plus riche compatible avec `n_ctx` (prompt système + snapshot + sortie JSON).
pub fn action_brief_mode_for_n_ctx(n_ctx: u32) -> ActionBriefMode {
    let n = n_ctx.max(1024);
    if n < 6_144 {
        ActionBriefMode::Quick
    } else if n < 12_288 {
        ActionBriefMode::Decision
    } else {
        ActionBriefMode::Deep
    }
}

/// Limites d’échantillonnage boîte alignées sur `n_ctx`.
pub fn action_brief_snapshot_limits(n_ctx: u32) -> ActionBriefSnapshotLimits {
    let n = n_ctx.max(1024);
    if n < 6_144 {
        ActionBriefSnapshotLimits {
            fetch: 28,
            take: 18,
            preview_chars: 200,
        }
    } else if n < 12_288 {
        ActionBriefSnapshotLimits {
            fetch: 40,
            take: 28,
            preview_chars: 320,
        }
    } else {
        ActionBriefSnapshotLimits {
            fetch: 55,
            take: 45,
            preview_chars: 420,
        }
    }
}

/// Résout le mode effectif et les limites snapshot à partir du contexte max et de la préférence utilisateur.
pub fn resolve_action_brief_execution(
    n_ctx: u32,
    request: ActionBriefModeRequest,
) -> (ActionBriefMode, ActionBriefSnapshotLimits) {
    let fitted = action_brief_mode_for_n_ctx(n_ctx);
    let mode = match request {
        ActionBriefModeRequest::Auto => fitted,
        ActionBriefModeRequest::Quick => ActionBriefMode::Quick,
        ActionBriefModeRequest::Decision => {
            min_action_brief_mode(fitted, ActionBriefMode::Decision)
        }
        ActionBriefModeRequest::Deep => fitted,
    };
    let limits = action_brief_snapshot_limits(n_ctx);
    (mode, limits)
}

pub fn parse_action_brief_mode_request(raw: Option<&str>) -> ActionBriefModeRequest {
    match raw.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) if s.eq_ignore_ascii_case("auto") => ActionBriefModeRequest::Auto,
        Some(s) if s.eq_ignore_ascii_case("quick") => ActionBriefModeRequest::Quick,
        Some(s) if s.eq_ignore_ascii_case("deep") => ActionBriefModeRequest::Deep,
        Some(s) if s.eq_ignore_ascii_case("decision") => ActionBriefModeRequest::Decision,
        _ => ActionBriefModeRequest::Auto,
    }
}

fn max_tokens_for_mode(mode: ActionBriefMode) -> u32 {
    match mode {
        ActionBriefMode::Quick => 2_000,
        ActionBriefMode::Decision => 3_800,
        ActionBriefMode::Deep => 4_096,
    }
}

fn system_prompt(_mode: ActionBriefMode, output_language: &str) -> String {
    crate::prompts::system_prompt_for_language("action_brief", output_language)
}

fn user_prompt(mode: ActionBriefMode, account_id: &str, mailbox: &str, snapshot: &str) -> String {
    let mode_hint = match mode {
        ActionBriefMode::Quick => "Mode Quick : au plus 2 changements, 1 décision, 3 actions, 1 risque, 1 ambiguïté si nécessaire.",
        ActionBriefMode::Decision => "Mode Decision : jusqu'à 4 changements, top 3 décisions, top 5 actions, risques pertinents, ambiguïtés ciblées.",
        ActionBriefMode::Deep => "Mode Deep : jusqu'à 6 changements, top 3 décisions, top 7 actions, risques détaillés, plus d'ambiguïtés si le contexte est flou.",
    };
    format!(
        "{mode_hint}\n\ncompte_hint={account_id}\nmailbox_hint={mailbox}\n\nLISTE FILS (une entrée par fil, ne pas ignorer fil_id) :\n\n{snapshot}"
    )
}

fn generate_brief_dto(
    engine: &mut LlmEngine,
    system: &str,
    user: &str,
    mode: ActionBriefMode,
) -> Result<(LlmBriefDto, String), LlmError> {
    let raw = engine.generate(
        system,
        user,
        &gen_params_json_for_prompt(engine, system, user, 512, max_tokens_for_mode(mode)),
    )?;
    let dto: LlmBriefDto = parse_model_json(&raw)?;
    Ok((dto, raw))
}

/// Génère un brief d'action à partir du snapshot texte (déjà trié / borné côté appli).
pub fn action_brief_with_llm(
    engine: &mut LlmEngine,
    mailbox_snapshot: &str,
    allowed_thread_ids: &[String],
    account_id: &str,
    mailbox: &str,
    mode: ActionBriefMode,
    output_language: &str,
) -> Result<ActionBriefResult, LlmError> {
    let allowed: HashSet<String> = allowed_thread_ids
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let snapshot = truncate_chars(mailbox_snapshot, 88_000);
    let input_truncated = mailbox_snapshot.chars().count() > 88_000;

    let system = system_prompt(mode, output_language);
    let user = user_text_for_engine(engine, &user_prompt(mode, account_id, mailbox, &snapshot));
    let (dto, raw) = match generate_brief_dto(engine, system.as_str(), &user, mode) {
        Ok(pair) => pair,
        Err(LlmError::InvalidJson(_)) => {
            let user_retry = format!(
                "{user}\n\nRappel : JSON compact et **complet** (toutes les accolades fermées). Réduis le nombre d’éléments si nécessaire."
            );
            generate_brief_dto(engine, system.as_str(), &user_retry, mode)?
        }
        Err(e) => return Err(e),
    };

    Ok(dto_to_result(
        dto,
        account_id,
        mailbox,
        mode,
        &allowed,
        engine,
        system.as_str(),
        &user,
        &raw,
        input_truncated,
    ))
}

/// Brief minimal sans LLM (hors ligne / tests UI) : structure vide mais valide.
pub fn action_brief_offline_stub(
    account_id: &str,
    mailbox: &str,
    mode: ActionBriefMode,
    message: &str,
) -> ActionBriefResult {
    ActionBriefResult {
        account_id: account_id.trim().to_string(),
        mailbox: mailbox.trim().to_string(),
        mode,
        changes: vec![],
        decisions: vec![],
        recommended_actions: vec![],
        risks: vec![],
        ambiguities: vec![ActionBriefAmbiguity {
            question: "Moteur IA indisponible.".to_string(),
            why_it_matters: message.to_string(),
            evidence_links: vec![],
        }],
        evidence_links: vec![],
        confidence: 0.0,
        priority_bucket: ActionBriefPriorityBucket::Routine,
        verification_recommended: true,
        executed_skills: vec!["offline_stub".into()],
        budget: TokenBudgetReport::empty_stub(),
    }
}

#[cfg(test)]
mod brief_context_tests {
    use super::*;

    #[test]
    fn mode_scales_with_n_ctx() {
        assert_eq!(action_brief_mode_for_n_ctx(4096), ActionBriefMode::Quick);
        assert_eq!(action_brief_mode_for_n_ctx(8192), ActionBriefMode::Decision);
        assert_eq!(action_brief_mode_for_n_ctx(16_384), ActionBriefMode::Deep);
    }

    #[test]
    fn resolve_auto_uses_fitted_mode() {
        let (mode, limits) = resolve_action_brief_execution(4096, ActionBriefModeRequest::Auto);
        assert_eq!(mode, ActionBriefMode::Quick);
        assert_eq!(limits.take, 18);
    }

    #[test]
    fn resolve_decision_caps_on_small_ctx() {
        let (mode, _) = resolve_action_brief_execution(4096, ActionBriefModeRequest::Decision);
        assert_eq!(mode, ActionBriefMode::Quick);
    }

    #[test]
    fn resolve_quick_always_quick() {
        let (mode, _) = resolve_action_brief_execution(32_768, ActionBriefModeRequest::Quick);
        assert_eq!(mode, ActionBriefMode::Quick);
    }
}
