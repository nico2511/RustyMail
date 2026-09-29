//! Brief d'action boîte : un passage LLM JSON + filtrage des preuves (fil_id autorisés).

use std::collections::HashSet;

use serde::Deserialize;

use crate::ai_llm_contracts::contains_llm_meta;
use crate::ai_llm_util::{
    budget_report, gen_params_json_for_prompt, output_room_after_prompt, parse_model_json,
    parse_model_json_ex, truncate_chars, user_text_for_engine,
};
use rustymail_domain::{
    ActionBriefAmbiguity, ActionBriefChange, ActionBriefDecision, ActionBriefEvidenceLink,
    ActionBriefMode, ActionBriefPriorityBucket, ActionBriefRecommendedAction, ActionBriefResult,
    ActionBriefRisk, TokenBudgetReport,
};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefEvidenceDto {
    #[serde(default, alias = "thread_id", alias = "fil_id", alias = "filId")]
    thread_id: String,
    #[serde(default, alias = "message_ids")]
    message_ids: Vec<String>,
    #[serde(default)]
    label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum FlexEvidence {
    Obj(BriefEvidenceDto),
    Id(String),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefChangeDto {
    #[serde(default)]
    id: String,
    #[serde(default)]
    summary: String,
    #[serde(default, alias = "since_last_brief")]
    since_last_brief: bool,
    #[serde(default, alias = "evidence_links")]
    evidence_links: Vec<FlexEvidence>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefDecisionDto {
    #[serde(default)]
    rank: u32,
    #[serde(default)]
    title: String,
    #[serde(default)]
    impact: String,
    #[serde(default, alias = "options_hint")]
    options_hint: Vec<String>,
    #[serde(default, alias = "evidence_links")]
    evidence_links: Vec<FlexEvidence>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefActionDto {
    #[serde(default)]
    rank: u32,
    #[serde(default)]
    action: String,
    #[serde(default, alias = "suggested_owner")]
    suggested_owner: String,
    #[serde(default, alias = "suggested_due")]
    suggested_due: Option<String>,
    #[serde(default)]
    priority: String,
    #[serde(default, alias = "evidence_links")]
    evidence_links: Vec<FlexEvidence>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefRiskDto {
    #[serde(default)]
    label: String,
    #[serde(default)]
    severity: String,
    #[serde(default)]
    detail: String,
    #[serde(default, alias = "evidence_links")]
    evidence_links: Vec<FlexEvidence>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefAmbiguityDto {
    #[serde(default)]
    question: String,
    #[serde(default, alias = "why_it_matters")]
    why_it_matters: String,
    #[serde(default, alias = "evidence_links")]
    evidence_links: Vec<FlexEvidence>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmBriefDto {
    #[serde(default)]
    changes: Vec<BriefChangeDto>,
    #[serde(default)]
    decisions: Vec<BriefDecisionDto>,
    #[serde(default, alias = "recommended_actions")]
    recommended_actions: Vec<BriefActionDto>,
    #[serde(default)]
    risks: Vec<BriefRiskDto>,
    #[serde(default)]
    ambiguities: Vec<BriefAmbiguityDto>,
    #[serde(default, alias = "evidence_links")]
    evidence_links: Vec<FlexEvidence>,
    #[serde(default)]
    confidence: f64,
    #[serde(default, alias = "priority_bucket")]
    priority_bucket: Option<String>,
    #[serde(default, alias = "verification_recommended")]
    verification_recommended: bool,
}

fn flex_evidence(items: Vec<FlexEvidence>) -> Vec<BriefEvidenceDto> {
    items
        .into_iter()
        .filter_map(|e| match e {
            FlexEvidence::Obj(d) => {
                let thread_id = d.thread_id.trim().to_string();
                if thread_id.is_empty() {
                    None
                } else {
                    Some(BriefEvidenceDto {
                        thread_id,
                        message_ids: d.message_ids,
                        label: d.label,
                    })
                }
            }
            FlexEvidence::Id(id) => {
                let thread_id = id.trim().to_string();
                if thread_id.is_empty() {
                    None
                } else {
                    Some(BriefEvidenceDto {
                        thread_id,
                        message_ids: Vec::new(),
                        label: None,
                    })
                }
            }
        })
        .collect()
}

fn brief_text_ok(s: &str) -> bool {
    let t = s.trim();
    !t.is_empty() && !contains_llm_meta(t)
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
    output_partial: bool,
) -> ActionBriefResult {
    let mut verification = dto.verification_recommended;

    let changes: Vec<ActionBriefChange> = dto
        .changes
        .into_iter()
        .filter(|c| brief_text_ok(&c.summary))
        .enumerate()
        .map(|(i, c)| {
            let ev = filter_evidence_vec(flex_evidence(c.evidence_links), allowed_threads);
            if ev.is_empty() {
                verification = true;
            }
            ActionBriefChange {
                id: if c.id.trim().is_empty() {
                    format!("c{}", i + 1)
                } else {
                    c.id
                },
                summary: c.summary,
                since_last_brief: c.since_last_brief,
                evidence_links: ev,
            }
        })
        .collect();

    let decisions: Vec<ActionBriefDecision> = dto
        .decisions
        .into_iter()
        .filter(|d| brief_text_ok(&d.title))
        .map(|d| {
            let ev = filter_evidence_vec(flex_evidence(d.evidence_links), allowed_threads);
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
        .filter(|a| brief_text_ok(&a.action))
        .map(|a| {
            let ev = filter_evidence_vec(flex_evidence(a.evidence_links), allowed_threads);
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
        .filter(|r| brief_text_ok(&r.label))
        .map(|r| {
            let ev = filter_evidence_vec(flex_evidence(r.evidence_links), allowed_threads);
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
        .filter(|a| brief_text_ok(&a.question))
        .map(|a| {
            let ev = filter_evidence_vec(flex_evidence(a.evidence_links), allowed_threads);
            ActionBriefAmbiguity {
                question: a.question,
                why_it_matters: a.why_it_matters,
                evidence_links: ev,
            }
        })
        .collect();

    let evidence_links = filter_evidence_vec(flex_evidence(dto.evidence_links), allowed_threads);

    let priority_bucket = parse_priority_bucket(dto.priority_bucket.as_deref(), &decisions, &risks);

    let confidence = dto.confidence.clamp(0.0, 1.0);

    let mut result = ActionBriefResult {
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
        output_partial,
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
    };
    if output_partial {
        stamp_output_partial(&mut result);
    }
    result
}

fn stamp_output_partial(result: &mut ActionBriefResult) {
    result.output_partial = true;
    result.verification_recommended = true;
    result.confidence = result.confidence.min(0.45);
    let already = result
        .ambiguities
        .iter()
        .any(|a| a.question.trim() == "Brief partiel");
    if !already {
        result.ambiguities.insert(
            0,
            ActionBriefAmbiguity {
                question: "Brief partiel".into(),
                why_it_matters: "La réponse JSON du modèle était incomplète et a été tronquée. Les éléments absents de cette réponse ne figurent pas ici.".into(),
                evidence_links: vec![],
            },
        );
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
        ActionBriefMode::Quick => 1_400,
        ActionBriefMode::Decision => 2_000,
        ActionBriefMode::Deep => 2_600,
    }
}

fn min_brief_output_tokens(mode: ActionBriefMode) -> u32 {
    match mode {
        ActionBriefMode::Quick => 900,
        ActionBriefMode::Decision => 1_200,
        ActionBriefMode::Deep => 1_600,
    }
}

/// Coupe le snapshot sur des lignes entières pour laisser de la place à la sortie JSON.
fn clip_snapshot_lines(snapshot: &str, max_chars: usize) -> String {
    if max_chars == 0 {
        return String::new();
    }
    if snapshot.chars().count() <= max_chars {
        return snapshot.to_string();
    }
    let mut out = String::new();
    for line in snapshot.split_inclusive('\n') {
        let next = out.chars().count() + line.chars().count();
        if next > max_chars && !out.is_empty() {
            break;
        }
        out.push_str(line);
        if out.chars().count() >= max_chars {
            break;
        }
    }
    out.trim_end().to_string()
}

const BRIEF_CTX_ERR: &str = "Brief d’action impossible : la fenêtre de contexte ne laisse pas assez de place pour un JSON complet. Passez en mode Quick ou augmentez le contexte du modèle.";
const BRIEF_PARSE_ERR: &str = "Brief d’action impossible : la réponse du modèle est restée incomplète ou mal formée. Réessayez en mode Quick.";

/// Réduit le snapshot tant que le prompt mange toute la fenêtre (sinon max_tokens tombe à 1 et le JSON est coupé).
fn fit_brief_user(
    engine: &LlmEngine,
    system: &str,
    mode: ActionBriefMode,
    account_id: &str,
    mailbox: &str,
    snapshot: &str,
) -> Result<(String, bool), LlmError> {
    let target = min_brief_output_tokens(mode);
    let original_chars = snapshot.chars().count();
    let mut snap = snapshot.to_string();
    for _ in 0..12 {
        let user = user_text_for_engine(engine, &user_prompt(mode, account_id, mailbox, &snap));
        let room = output_room_after_prompt(engine, system, &user, 64);
        let clipped = snap.chars().count() < original_chars;
        if room >= target {
            return Ok((user, clipped));
        }
        let n = snap.chars().count();
        if n <= 400 {
            if room >= 256 {
                return Ok((user, clipped));
            }
            return Err(LlmError::Msg(BRIEF_CTX_ERR.into()));
        }
        let next = (n * 2 / 3).max(400);
        snap = clip_snapshot_lines(&snap, next);
    }
    Err(LlmError::Msg(BRIEF_CTX_ERR.into()))
}

fn dto_has_signal(dto: &LlmBriefDto) -> bool {
    dto.changes.iter().any(|c| brief_text_ok(&c.summary))
        || dto.decisions.iter().any(|d| brief_text_ok(&d.title))
        || dto
            .recommended_actions
            .iter()
            .any(|a| brief_text_ok(&a.action))
        || dto.risks.iter().any(|r| brief_text_ok(&r.label))
        || dto.ambiguities.iter().any(|a| brief_text_ok(&a.question))
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
) -> Result<(LlmBriefDto, String, bool), LlmError> {
    let raw = engine.generate(
        system,
        user,
        &gen_params_json_for_prompt(engine, system, user, 384, max_tokens_for_mode(mode)),
    )?;
    let parsed = parse_model_json_ex::<LlmBriefDto>(&raw)?;
    if !dto_has_signal(&parsed.value) {
        return Err(LlmError::InvalidJson("brief vide".into()));
    }
    Ok((parsed.value, raw, parsed.repaired))
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
    let (user, fitted_clip) = fit_brief_user(
        engine,
        system.as_str(),
        mode,
        account_id,
        mailbox,
        &snapshot,
    )?;
    enum FirstBrief {
        Clean(LlmBriefDto, String),
        Repaired(LlmBriefDto, String),
        Invalid,
    }
    let first = match generate_brief_dto(engine, system.as_str(), &user, mode) {
        Ok((dto, raw, false)) => FirstBrief::Clean(dto, raw),
        Ok((dto, raw, true)) => FirstBrief::Repaired(dto, raw),
        Err(LlmError::InvalidJson(_)) => FirstBrief::Invalid,
        Err(e) => return Err(e),
    };
    let (dto, raw, effective_mode, user_used, clipped, output_partial) = match first {
        FirstBrief::Clean(dto, raw) => (dto, raw, mode, user, fitted_clip, false),
        other => {
            let short = clip_snapshot_lines(&snapshot, 2_400);
            let (user_retry, retry_clip) = fit_brief_user(
                engine,
                system.as_str(),
                ActionBriefMode::Quick,
                account_id,
                mailbox,
                &short,
            )?;
            let clip = fitted_clip || retry_clip;
            match generate_brief_dto(engine, system.as_str(), &user_retry, ActionBriefMode::Quick) {
                Ok((dto, raw, false)) => {
                    (dto, raw, ActionBriefMode::Quick, user_retry, clip, false)
                }
                Ok((dto, raw, true)) => match other {
                    FirstBrief::Repaired(first_dto, first_raw) => {
                        (first_dto, first_raw, mode, user, fitted_clip, true)
                    }
                    _ => (dto, raw, ActionBriefMode::Quick, user_retry, clip, true),
                },
                Err(LlmError::InvalidJson(_)) => match other {
                    FirstBrief::Repaired(dto, raw) => (dto, raw, mode, user, fitted_clip, true),
                    _ => return Err(LlmError::Msg(BRIEF_PARSE_ERR.into())),
                },
                Err(e) => return Err(e),
            }
        }
    };

    Ok(dto_to_result(
        dto,
        account_id,
        mailbox,
        effective_mode,
        &allowed,
        engine,
        system.as_str(),
        &user_used,
        &raw,
        input_truncated || clipped,
        output_partial,
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
        output_partial: false,
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

    #[test]
    fn brief_dto_accepts_snake_case_evidence() {
        let raw = r#"{"changes":[{"id":"c1","summary":"Facture à valider","since_last_brief":true,"evidence_links":["thread-1"]}],"recommended_actions":[{"rank":1,"action":"Répondre","suggested_owner":"moi","priority":"P1","evidence_links":[{"thread_id":"thread-1","message_ids":[]}]}],"confidence":0.4,"priority_bucket":"Important"}"#;
        let dto: LlmBriefDto = parse_model_json(raw).expect("snake");
        assert!(dto_has_signal(&dto));
        assert!(dto.changes[0].since_last_brief);
        assert_eq!(dto.recommended_actions[0].suggested_owner, "moi");
    }

    #[test]
    fn fit_brief_user_leaves_output_room_on_small_ctx() {
        let mut engine = rustymail_llm::LlmEngine::open_ai_compatible(
            "http://127.0.0.1:8080/v1".into(),
            "test".into(),
            String::new(),
        )
        .expect("engine");
        engine.set_n_ctx_probe(8192);
        let mut snapshot = String::new();
        for i in 0..40 {
            snapshot.push_str(&format!(
                "fil_id=thread-{i} | unread=true | messages=3 | last=2026-09-01 | followed=false | pinned=false | newsletter=false | attachments=1 | Sujet {i}\n Aperçu assez long pour remplir la fenêtre de contexte du modèle local et provoquer une sortie JSON tronquée si on ne coupe pas.\n"
            ));
        }
        let system = system_prompt(ActionBriefMode::Deep, "fr");
        let (user, clipped) = fit_brief_user(
            &engine,
            system.as_str(),
            ActionBriefMode::Deep,
            "acc",
            "INBOX",
            &snapshot,
        )
        .expect("fit");
        assert!(clipped, "snapshot should be reduced to fit n_ctx");
        let room = output_room_after_prompt(&engine, system.as_str(), &user, 64);
        assert!(
            room >= 256,
            "output room collapsed ({room}); brief JSON cannot be completed"
        );
    }

    #[test]
    fn stamp_output_partial_marks_repaired_json() {
        let mut brief =
            action_brief_offline_stub("acc", "INBOX", ActionBriefMode::Deep, "hors ligne");
        brief.output_partial = true;
        brief.confidence = 0.9;
        brief.verification_recommended = false;
        stamp_output_partial(&mut brief);
        assert!(brief.output_partial);
        assert!(brief.verification_recommended);
        assert!(brief.confidence <= 0.45);
        assert_eq!(brief.ambiguities[0].question, "Brief partiel");
        assert!(brief.ambiguities[0].why_it_matters.contains("incomplète"));
    }
}
