import { renderConfirmModal, renderTextPromptModal } from "../modals/promptConfirm";
import { renderAiPanel } from "../ui/render/aiPanelRender";
import { renderAiQuickPanelOverlay } from "../ui/render/aiQuickPanelRender";
import { renderComposer } from "../ui/render/composerRender";
import { renderMain } from "../ui/render/mainViewRender";
import { renderSearchModal } from "../ui/render/searchRender";
import { renderSettingsAiModal } from "../ui/render/settingsRender";
import { renderSidebar } from "../ui/render/sidebarRender";
import { renderGlobalStatusFooter } from "../ui/render/statusFooterRender";
import {
  renderCloseComposeDialog,
  renderImageDialog,
  renderMailboxManageDialog,
  renderMoveDialog,
  renderQuoteFoldDialog,
  renderResumeDraftDialog,
  renderSplitSendDialog,
} from "../ui/render/modalsRender";
import { renderThreadTagsDialog } from "../ui/render/threadTagsRender";
import { state } from "../state";
import { aiSidePanelExpandedForShell } from "./threadShellLayout";

export function resolveAiPanelWidthPx(): number {
  const raw = state.appPrefs.ai.aiPanelWidthPx;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(640, Math.max(260, Math.round(raw)));
  }
  return 340;
}

export function buildAppShellClassName(options: {
  isCompose: boolean;
  aiPanelExpanded: boolean;
  sidebarCollapsed: boolean;
}): string {
  const { isCompose, aiPanelExpanded, sidebarCollapsed } = options;
  return `app-shell ${aiPanelExpanded ? "" : "ai-collapsed"}${isCompose ? " compose-fullscreen-active" : ""}${
    !isCompose && sidebarCollapsed ? " sidebar-collapsed" : ""
  }`;
}

export function buildAppShellInnerHtml(options: {
  isCompose: boolean;
  aiPanelExpanded: boolean;
  panelW: number;
}): string {
  const { isCompose, aiPanelExpanded, panelW } = options;
  const mainColumn =
    !isCompose && state.sidebarCollapsed ?
      `<button type="button" class="main-sidebar-reveal" data-action="toggle-sidebar" aria-label="Afficher le menu des dossiers" title="Menu">☰</button>`
    : "";

  const body =
    isCompose ?
      renderComposer()
    : `${renderSidebar()}
    <main class="main">${mainColumn}${renderMain()}</main>
    ${aiPanelExpanded ? renderAiPanel() : ""}`;

  return `
    <div class="noise"></div>
    ${body}
    ${renderMoveDialog()}
    ${renderMailboxManageDialog()}
    ${renderQuoteFoldDialog()}
    ${renderThreadTagsDialog()}
    ${renderCloseComposeDialog()}
    ${renderResumeDraftDialog()}
    ${renderImageDialog()}
    ${renderSplitSendDialog()}
    ${renderTextPromptModal()}
    ${renderConfirmModal()}
    ${renderSearchModal()}
    ${renderSettingsAiModal()}
    ${renderAiQuickPanelOverlay()}
    ${renderGlobalStatusFooter()}
  `;
}

export function readAppShellLayoutFlags(): {
  isCompose: boolean;
  aiPanelExpanded: boolean;
  panelW: number;
} {
  const isCompose = state.view === "compose";
  const aiPanelExpanded = aiSidePanelExpandedForShell();
  const panelW = resolveAiPanelWidthPx();
  return { isCompose, aiPanelExpanded, panelW };
}
