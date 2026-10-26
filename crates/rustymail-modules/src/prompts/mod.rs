//! Embedded English LLM prompt catalog. User-facing output language is parameterized.

use serde::Serialize;

const OUTPUT_LANGUAGE_PREFIX: &str = "All user-visible natural language in your response MUST be in {output_language} (ISO 639-1). JSON property names and enum values stay exactly as specified in the schema.\n\n";

#[derive(Debug, Clone)]
pub struct PromptCtx {
    pub output_language: String,
}

impl PromptCtx {
    pub fn from_language(lang: &str) -> Self {
        Self {
            output_language: normalize_output_language(lang),
        }
    }
}

/// Normalize `fr-FR` → `fr`, default `fr` when empty.
pub fn normalize_output_language(lang: &str) -> String {
    let s = lang.trim();
    if s.is_empty() {
        return "fr".to_string();
    }
    s.split('-').next().unwrap_or(s).to_ascii_lowercase()
}

pub fn render_template(template: &str, ctx: &PromptCtx) -> String {
    let prefix = OUTPUT_LANGUAGE_PREFIX.replace("{output_language}", &ctx.output_language);
    let body = template.replace("{output_language}", &ctx.output_language);
    format!("{prefix}{body}")
}

macro_rules! prompt_entry {
    ($id:expr, $feature:expr, $file:expr, $vars:expr, $skills:expr) => {
        PromptCatalogEntry {
            id: $id,
            feature: $feature,
            template: include_str!($file),
            variables: $vars,
            linked_skills: $skills,
        }
    };
}

struct PromptCatalogEntry {
    id: &'static str,
    feature: &'static str,
    template: &'static str,
    variables: &'static [&'static str],
    linked_skills: &'static [&'static str],
}

const CATALOG: &[PromptCatalogEntry] = &[
    prompt_entry!(
        "summary",
        "Thread summary",
        "../../prompts/summary.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "translation",
        "Translation",
        "../../prompts/translation.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "grammar",
        "Grammar check",
        "../../prompts/grammar.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "writing",
        "Rewrite",
        "../../prompts/writing.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "quick_reply",
        "Quick replies",
        "../../prompts/quick_reply.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "qa",
        "Thread Q&A",
        "../../prompts/qa.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "search_nl",
        "Natural-language search",
        "../../prompts/search_nl.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "action_brief",
        "Action brief",
        "../../prompts/action_brief.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "contact_profile",
        "Contact profile",
        "../../prompts/contact_profile.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "org_proposals",
        "Organization proposals",
        "../../prompts/org_proposals.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "flux_affiner",
        "Flux affiner",
        "../../prompts/flux_affiner.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "security_llm",
        "Security LLM",
        "../../prompts/security_llm.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "digest_cut",
        "Digest cut editor",
        "../../prompts/digest_cut.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "digest_cut_reformat",
        "Digest cut — rewrite reading",
        "../../prompts/digest_cut_reformat.system.txt",
        &["output_language"],
        &[]
    ),
    prompt_entry!(
        "agent_intent",
        "Agent — intent",
        "../../prompts/agent_intent.system.txt",
        &["output_language"],
        &["analyzeIntent"]
    ),
    prompt_entry!(
        "agent_draft",
        "Agent — draft",
        "../../prompts/agent_draft.system.txt",
        &["output_language"],
        &["draftReply"]
    ),
    prompt_entry!(
        "agent_slots",
        "Agent — slots",
        "../../prompts/agent_slots.system.txt",
        &["output_language", "timezone"],
        &["slotSuggestion"]
    ),
    prompt_entry!(
        "assist_actions",
        "Assist — actions",
        "../../prompts/assist_actions.system.txt",
        &["output_language"],
        &["actionItems"]
    ),
    prompt_entry!(
        "assist_tone",
        "Assist — tone",
        "../../prompts/assist_tone.system.txt",
        &["output_language", "tone"],
        &["toneAdapter"]
    ),
    prompt_entry!(
        "assist_facts",
        "Assist — facts",
        "../../prompts/assist_facts.system.txt",
        &["output_language"],
        &["extractFacts"]
    ),
    prompt_entry!(
        "assist_consistency",
        "Assist — consistency",
        "../../prompts/assist_consistency.system.txt",
        &["output_language"],
        &["consistencyCheck"]
    ),
];

/// Identifiants du catalogue embarqué (tests + garde anti typo).
pub const PROMPT_IDS: &[&str] = &[
    "summary",
    "translation",
    "grammar",
    "writing",
    "quick_reply",
    "qa",
    "search_nl",
    "action_brief",
    "contact_profile",
    "org_proposals",
    "flux_affiner",
    "security_llm",
    "digest_cut",
    "digest_cut_reformat",
    "agent_intent",
    "agent_draft",
    "agent_slots",
    "assist_actions",
    "assist_tone",
    "assist_facts",
    "assist_consistency",
];

pub fn system_prompt(id: &str, ctx: &PromptCtx) -> Option<String> {
    CATALOG
        .iter()
        .find(|e| e.id == id)
        .map(|e| render_template(e.template, ctx))
}

pub fn system_prompt_for_language(id: &str, language: &str) -> String {
    let ctx = PromptCtx::from_language(language);
    match system_prompt(id, &ctx) {
        Some(s) => s,
        None => {
            debug_assert!(false, "unknown prompt id: {id}");
            #[cfg(not(debug_assertions))]
            eprintln!("unknown prompt id: {id}");
            format!("[missing prompt: {id}]")
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptCatalogItemView {
    pub id: String,
    pub feature: String,
    pub template_en: String,
    pub variables: Vec<String>,
    pub linked_skills: Vec<String>,
}

pub fn list_catalog_for_ui() -> Vec<PromptCatalogItemView> {
    CATALOG
        .iter()
        .map(|e| PromptCatalogItemView {
            id: e.id.to_string(),
            feature: e.feature.to_string(),
            template_en: e.template.trim().to_string(),
            variables: e.variables.iter().map(|s| (*s).to_string()).collect(),
            linked_skills: e.linked_skills.iter().map(|s| (*s).to_string()).collect(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Identifiants utilisés dans le crate — toute typo doit faire échouer ce test.
    const USED_PROMPT_IDS: &[&str] = &[
        "summary",
        "translation",
        "grammar",
        "writing",
        "quick_reply",
        "qa",
        "search_nl",
        "action_brief",
        "contact_profile",
        "org_proposals",
        "flux_affiner",
        "security_llm",
        "digest_cut",
        "digest_cut_reformat",
        "agent_intent",
        "agent_draft",
        "agent_slots",
        "assist_actions",
        "assist_tone",
        "assist_facts",
        "assist_consistency",
    ];

    #[test]
    fn used_prompt_ids_exist_in_catalog() {
        for id in USED_PROMPT_IDS {
            assert!(
                PROMPT_IDS.contains(id),
                "missing catalog entry for prompt id {id}"
            );
            let rendered = system_prompt_for_language(id, "fr");
            assert!(
                !rendered.contains("[missing prompt:"),
                "catalog miss for {id}"
            );
            assert!(!rendered.trim().is_empty());
            let item = list_catalog_for_ui()
                .into_iter()
                .find(|e| e.id == *id)
                .expect("catalog item");
            if item.variables.iter().any(|v| *v == "output_language") {
                assert!(
                    !rendered.contains("{output_language}"),
                    "unsubstituted output_language in prompt {id}"
                );
            }
        }
    }

    #[test]
    fn agent_draft_prompt_has_no_draft_language_placeholder() {
        let rendered = system_prompt_for_language("agent_draft", "fr");
        assert!(!rendered.contains("{draft_language}"));
        assert!(rendered.contains("Do not state dates, times, amounts"));
    }
}
