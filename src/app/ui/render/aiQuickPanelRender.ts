import { escapeHtml } from "../../../ui/sanitize";
import { iconSvg } from "../../lib/iconSvg";
import { state } from "../../state";
import { renderAiFeatureTogglesHtml } from "./aiFeatureTogglesRender";

export function renderAiQuickPanelOverlay(): string {
  if (!state.aiQuickPanelOpen) return "";
  return `
    <div class="ai-quick-panel-backdrop" data-action="toggle-ai-quick-panel" aria-hidden="true"></div>
    <div class="ai-quick-panel ai-quick-panel--overlay surface-sm modal-shell-stop-prop" role="dialog" aria-modal="true" aria-label="Fonctionnalités IA">
      <div class="ai-quick-panel__head">
        <strong>Fonctionnalités IA</strong>
        <div class="ai-quick-panel__head-actions">
          <div class="ai-quick-panel__bulk">
            <button type="button" class="ghost-button ghost-button-sm" data-action="ai-features-all-on">Tout activer</button>
            <button type="button" class="ghost-button ghost-button-sm" data-action="ai-features-all-off">Tout désactiver</button>
          </div>
          <button type="button" class="icon-pill" data-action="toggle-ai-quick-panel" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
      </div>
      <div class="ai-quick-panel__body">${renderAiFeatureTogglesHtml()}</div>
      <p class="dim ai-quick-panel__hint">Les changements sont enregistrés immédiatement. Paramètres détaillés → IA & dictée → Fonctionnalités.</p>
    </div>`;
}

export function renderSidebarAiQuickTrigger(): string {
  return `<div class="sidebar-footer-ai">
      <button
        type="button"
        class="folder-button sidebar-ai-trigger ${state.aiQuickPanelOpen ? "sidebar-ai-trigger--open" : ""}"
        data-action="toggle-ai-quick-panel"
        aria-expanded="${state.aiQuickPanelOpen ? "true" : "false"}"
        title="Activer ou désactiver les fonctionnalités IA"
      >
        <span class="folder-icon">IA</span>
        <span class="folder-name">Fonctionnalités IA</span>
      </button>
    </div>`;
}

export function renderStatusBarAiQuickTrigger(): string {
  return `<button
      type="button"
      class="status-bar-ai-trigger ghost-button"
      data-action="toggle-ai-quick-panel"
      aria-expanded="${state.aiQuickPanelOpen ? "true" : "false"}"
      title="Activer ou désactiver les fonctionnalités IA"
    >IA</button>`;
}
