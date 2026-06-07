import { t } from "./i18n";
import { getAssistSkillUi } from "./assistAgent";
import type { SettingsAiPanelDeps } from "./settingsAiPanel";

export type PromptCatalogItem = {
  id: string;
  feature: string;
  templateEn: string;
  variables: string[];
  linkedSkills: string[];
};

const FEATURE_LABEL_KEYS: Record<string, string> = {
  summary: "prompts.features.summary",
  translation: "prompts.features.translation",
  grammar: "prompts.features.grammar",
  writing: "prompts.features.writing",
  quick_reply: "prompts.features.quickReply",
  qa: "prompts.features.qa",
  search_nl: "prompts.features.searchNl",
  inbox_digest: "prompts.features.inboxDigest",
  action_brief: "prompts.features.actionBrief",
  contact_profile: "prompts.features.contactProfile",
  org_proposals: "prompts.features.orgProposals",
  flux_affiner: "prompts.features.fluxAffiner",
  security_llm: "prompts.features.securityLlm",
  agent_intent: "prompts.features.agentIntent",
  agent_draft: "prompts.features.agentDraft",
  agent_slots: "prompts.features.agentSlots",
  assist_actions: "prompts.features.assistActions",
  assist_tone: "prompts.features.assistTone",
  assist_facts: "prompts.features.assistFacts",
  assist_consistency: "prompts.features.assistConsistency",
};

function featureLabel(id: string): string {
  const key = FEATURE_LABEL_KEYS[id];
  return key ? t(key) : id;
}

export function renderPromptsSettingsBody(
  deps: SettingsAiPanelDeps,
  catalog: PromptCatalogItem[] | null,
  loadError: string,
  outputLanguage: string,
): string {
  const { escapeHtml } = deps;
  const outLang = escapeHtml(outputLanguage.trim() || "fr");
  if (loadError) {
    return `<p class="dim">${escapeHtml(t("settings.ai.promptsLoadError", { error: loadError }))}</p>`;
  }
  if (!catalog) {
    return `<p class="dim">${escapeHtml(t("settings.ai.promptsNoCatalog"))}</p>`;
  }
  const entries = catalog
    .map((item) => {
      const vars =
        item.variables.length ?
          `<p class="dim" style="margin:6px 0 0;font-size:12px">Variables: ${escapeHtml(item.variables.join(", "))}</p>`
        : "";
      const skills =
        item.linkedSkills.length ?
          `<p class="dim" style="margin:4px 0 0;font-size:12px">Skills: ${escapeHtml(item.linkedSkills.join(", "))}</p>`
        : "";
      return `<details class="settings-prompt-entry surface-sm" style="margin:0 0 8px;padding:10px 12px;border-radius:var(--radius-lg)">
        <summary style="cursor:pointer;font-weight:600">${escapeHtml(featureLabel(item.id))} <span class="dim">(${escapeHtml(item.id)})</span></summary>
        <p class="dim" style="margin:8px 0 4px;font-size:12px">${escapeHtml(item.feature)}</p>
        ${vars}
        ${skills}
        <pre class="settings-prompt-template" style="margin:10px 0 0;padding:10px;font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;background:var(--surface-2)">${escapeHtml(item.templateEn)}</pre>
      </details>`;
    })
    .join("");
  const skillRows = getAssistSkillUi().map(
    (sk) =>
      `<li><strong>${escapeHtml(sk.label)}</strong> <code class="dim">${escapeHtml(sk.id)}</code> · API <code>${escapeHtml(sk.api)}</code></li>`,
  ).join("");
  return `
    <p class="settings-explain settings-explain--lead">${escapeHtml(t("settings.ai.promptsLead"))}</p>
    <p class="dim settings-explain--field">${escapeHtml(t("settings.ai.promptsReadOnly"))}</p>
    <p class="dim" style="margin:0 0 12px"><strong>${escapeHtml(t("settings.ai.promptsOutputLang", { lang: outLang }))}</strong></p>
    <div class="settings-prompt-catalog">${entries}</div>
    <h4 class="settings-ai-subsection__title" style="margin-top:18px">${escapeHtml(t("settings.ai.promptsSkillsHeading"))}</h4>
    <ul class="dim" style="margin:8px 0 0;padding-left:1.2em;font-size:13px;line-height:1.55">${skillRows}</ul>`;
}
