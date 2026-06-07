//! Propositions LLM pour le centre d'organisation (métadonnées agrégées).

use crate::ai_llm_util::{gen_params_json_for_prompt, parse_model_json};
use rustymail_domain::{
    OrgProposal, OrgProposalKind, OrgProposalSource, OrgSuggestedAction, OrgThreadRef,
};
use rustymail_llm::LlmEngine;
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Debug, Deserialize)]
struct LlmOrgProposalRow {
    title: String,
    rationale: String,
    #[serde(default, rename = "threadIds")]
    thread_ids: Vec<String>,
    #[serde(default, rename = "searchKeywords")]
    search_keywords: Vec<String>,
    #[serde(default, rename = "suggestedAction")]
    suggested_action: String,
    #[serde(default, rename = "targetMailbox")]
    target_mailbox: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LlmOrgResponse {
    #[serde(default)]
    proposals: Vec<LlmOrgProposalRow>,
}

/// Réserve tokens pour la sortie JSON lors du rognage du catalogue (`n_ctx` − réserve − marge).
const ORG_LLM_OUTPUT_RESERVE: u32 = 2048;
const ORG_LLM_PROMPT_SLACK: u32 = 384;

fn trim_catalog_to_n_ctx(
    engine: &LlmEngine,
    account_label: &str,
    heuristic_proposal_count: usize,
    thread_catalog: &str,
    system: &str,
) -> String {
    let n_ctx = engine.n_ctx().max(1024);
    let budget = n_ctx.saturating_sub(ORG_LLM_OUTPUT_RESERVE + ORG_LLM_PROMPT_SLACK);
    let mut lines: Vec<&str> = thread_catalog.lines().filter(|l| !l.is_empty()).collect();
    loop {
        let catalog = lines.join("\n");
        let user = format!(
            "Compte : {account_label}\n\
             {heuristic_proposal_count} proposition(s) heuristique(s) déjà détectées.\n\
             Catalogue de fils (threadId;mailbox;expéditeur;sujet) — une ligne par fil :\n\
             {catalog}\n"
        );
        let used = (engine.token_count(system) + engine.token_count(&user)) as u32;
        if used <= budget || lines.len() <= 8 {
            return catalog;
        }
        lines.pop();
    }
}

pub fn org_proposals_with_llm(
    engine: &mut LlmEngine,
    account_label: &str,
    thread_catalog: &str,
    heuristic_proposal_count: usize,
    valid_thread_ids: &HashSet<String>,
    output_language: &str,
) -> Result<Vec<OrgProposal>, String> {
    let system = crate::prompts::system_prompt_for_language("org_proposals", output_language);
    let catalog = trim_catalog_to_n_ctx(
        engine,
        account_label,
        heuristic_proposal_count,
        thread_catalog,
        system.as_str(),
    );
    let user = format!(
        "Account: {account_label}\n\
         {heuristic_proposal_count} heuristic proposal(s) already detected.\n\
         Thread catalog (threadId;mailbox;sender;subject) — one line per thread:\n\
         {catalog}\n"
    );
    let p = gen_params_json_for_prompt(engine, system.as_str(), &user, 512, 2048);
    let raw = engine
        .generate(system.as_str(), &user, &p)
        .map_err(|e| e.to_string())?;
    let parsed: LlmOrgResponse =
        parse_model_json(&raw).map_err(|e: rustymail_llm::LlmError| e.to_string())?;
    let mut out = Vec::new();
    for (i, row) in parsed.proposals.into_iter().enumerate().take(8) {
        let action = match row.suggested_action.to_ascii_lowercase().as_str() {
            "move" => OrgSuggestedAction::Move,
            "trash" => OrgSuggestedAction::Trash,
            "markread" | "mark_read" => OrgSuggestedAction::MarkRead,
            _ => OrgSuggestedAction::Archive,
        };
        let refs: Vec<OrgThreadRef> = row
            .thread_ids
            .iter()
            .filter(|tid| valid_thread_ids.contains(tid.as_str()))
            .take(20)
            .map(|tid| OrgThreadRef {
                thread_id: tid.clone(),
                ..Default::default()
            })
            .collect();
        let keywords: Vec<String> = row
            .search_keywords
            .into_iter()
            .map(|k| k.trim().to_string())
            .filter(|k| k.len() >= 2)
            .take(8)
            .collect();
        out.push(OrgProposal {
            id: format!("llm-{i}"),
            kind: OrgProposalKind::LlmCluster,
            section: "range".to_string(),
            title: row.title,
            rationale: row.rationale,
            thread_ids: refs.iter().map(|r| r.thread_id.clone()).collect(),
            thread_refs: refs,
            suggested_action: action,
            target_mailbox: row.target_mailbox,
            confidence: 0.65,
            source: OrgProposalSource::Llm,
            total_count: 0,
            applicable: true,
            llm_search_keywords: keywords,
            explain_rule_id: None,
            explain_signals: Vec::new(),
            unsubscribe_links: Vec::new(),
        });
    }
    Ok(out)
}
