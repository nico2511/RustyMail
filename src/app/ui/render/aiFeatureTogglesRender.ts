import { AI_FEATURE_TOGGLE_GROUPS } from "../../../aiFeatures";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { settingsExplainHtml } from "../../lib/settingsExplainHtml";
import { state } from "../../state";

export function renderAiFeatureTogglesHtml(layout: "settings" | "compact" = "compact"): string {
  const ai = state.appPrefs.ai;
  if (layout === "settings") {
    return AI_FEATURE_TOGGLE_GROUPS.map(
      (group, idx) => `
      ${idx > 0 ? '<hr class="settings-section-divider settings-ai-features-divider" />' : ""}
      <fieldset class="settings-ai-features-group ai-feature-group">
        <legend class="ai-feature-group__title">${escapeHtml(group.title)}</legend>
        <div class="ai-feature-group__items">
          ${group.items
            .map(
              (item) => `
          <label class="settings-form-check ai-feature-toggle">
            <input type="checkbox" data-ai-feature="${escapeAttr(item.key)}" ${ai[item.key] ? "checked" : ""} />
            <span class="settings-form-check-text">
              <span class="settings-form-check-title">${escapeHtml(item.label)}</span>
              <span class="dim settings-ai-feature-desc">${escapeHtml(item.description)}</span>
            </span>
          </label>`,
            )
            .join("")}
        </div>
      </fieldset>`,
    ).join("");
  }
  return AI_FEATURE_TOGGLE_GROUPS.map(
    (group) => `
      <fieldset class="ai-feature-group">
        <legend class="ai-feature-group__title">${escapeHtml(group.title)}</legend>
        <div class="ai-feature-group__items">
          ${group.items
            .map(
              (item) => `
            <label class="settings-form-check ai-feature-toggle">
              <input type="checkbox" data-ai-feature="${escapeAttr(item.key)}" ${ai[item.key] ? "checked" : ""} />
              <span class="settings-form-check-text">
                <span class="settings-form-check-title">${escapeHtml(item.label)}</span>
                ${settingsExplainHtml(escapeHtml(item.description), "toggle")}
              </span>
            </label>`,
            )
            .join("")}
        </div>
      </fieldset>`,
  ).join("");
}
