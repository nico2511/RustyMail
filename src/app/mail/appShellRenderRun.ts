import { navApplyPendingScrollRestore } from "../../navigation";
import { root as appShell } from "../dom";
import { isTextPromptOpen, renderConfirmModal, renderTextPromptModal } from "../modals/promptConfirm";
import { wireEvents } from "./wireEventsDomOrchestratorRun";
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
import { wireFolderManagerDnD } from "./folderManagerDnD";
import { syncMailboxDigestPanelWithFeaturePref } from "./mailboxDigest";
import { captureAccountsFormIdentityFromDom } from "./settingsAccountsFormState";
import { skipAccountIdentityCaptureOnceRef } from "./appShellRenderRefs";
import { aiSidePanelExpandedForShell } from "./threadShellLayout";

function captureAccountsFormBeforeRender(): void {
  if (state.view === "settings" && state.settingsTab === "accounts") {
    captureAccountsFormIdentityFromDom(skipAccountIdentityCaptureOnceRef.current);
    if (skipAccountIdentityCaptureOnceRef.current) {
      skipAccountIdentityCaptureOnceRef.current = false;
    }
  } else {
    captureAccountsFormIdentityFromDom(true);
  }
}

function restoreScrollAfterRender(prev: {
  sidebarTop: number;
  sidebarLeft: number;
  orgTop: number;
  aiModalTop: number;
  hadAiModal: boolean;
}): void {
  const nextFolderList = document.querySelector<HTMLElement>(".folder-list");
  if (nextFolderList) {
    nextFolderList.scrollTop = prev.sidebarTop;
    nextFolderList.scrollLeft = prev.sidebarLeft;
  }
  const nextOrgPanel = document.querySelector<HTMLElement>(".organization-panel");
  if (nextOrgPanel && prev.orgTop > 0) {
    nextOrgPanel.scrollTop = prev.orgTop;
  }
  const nextAiModalBody = prev.hadAiModal
    ? document.querySelector<HTMLElement>(".settings-ai-modal-body")
    : null;
  if (nextAiModalBody && prev.aiModalTop > 0) {
    nextAiModalBody.scrollTop = prev.aiModalTop;
  }
  window.requestAnimationFrame(() => {
    navApplyPendingScrollRestore();
    if (nextOrgPanel && prev.orgTop > 0) {
      nextOrgPanel.scrollTop = prev.orgTop;
    }
    if (nextAiModalBody && prev.aiModalTop > 0) {
      nextAiModalBody.scrollTop = prev.aiModalTop;
    }
  });
}

function focusPromptsAfterRender(): void {
  if (isTextPromptOpen()) {
    window.requestAnimationFrame(() => {
      const inp = document.querySelector<HTMLInputElement>("#text-prompt-input");
      if (inp) {
        inp.focus();
        inp.select();
      }
    });
  }
  if (state.searchModalOpen && !isTextPromptOpen()) {
    window.requestAnimationFrame(() => {
      const inp = document.querySelector<HTMLInputElement>("#search-modal-input");
      if (!inp) return;
      inp.focus();
      const len = state.searchDraft.length;
      try {
        inp.setSelectionRange(len, len);
      } catch {
        /* type=search */
      }
    });
  }
}

export function renderAppShell(): void {
  syncMailboxDigestPanelWithFeaturePref();
  captureAccountsFormBeforeRender();

  const prevFolderList = document.querySelector<HTMLElement>(".folder-list");
  const scrollPrev = {
    sidebarTop: prevFolderList?.scrollTop ?? 0,
    sidebarLeft: prevFolderList?.scrollLeft ?? 0,
    orgTop: document.querySelector<HTMLElement>(".organization-panel")?.scrollTop ?? 0,
    aiModalTop: state.settingsAiModal
      ? (document.querySelector<HTMLElement>(".settings-ai-modal-body")?.scrollTop ?? 0)
      : 0,
    hadAiModal: Boolean(state.settingsAiModal),
  };

  const isCompose = state.view === "compose";
  const aiPanelExpanded = aiSidePanelExpandedForShell();
  appShell.className = `app-shell ${aiPanelExpanded ? "" : "ai-collapsed"}${isCompose ? " compose-fullscreen-active" : ""}${
    !isCompose && state.sidebarCollapsed ? " sidebar-collapsed" : ""
  }`;
  const panelW =
    typeof state.appPrefs.ai.aiPanelWidthPx === "number" && Number.isFinite(state.appPrefs.ai.aiPanelWidthPx) ?
      Math.min(640, Math.max(260, Math.round(state.appPrefs.ai.aiPanelWidthPx)))
    : 340;
  appShell.style.setProperty("--ai-width", aiPanelExpanded ? `${panelW}px` : "0px");
  appShell.innerHTML = `
    <div class="noise"></div>
    ${
      isCompose ?
        `
    ${renderComposer()}
    `
      : `
    ${renderSidebar()}
    <main class="main">${
      !isCompose && state.sidebarCollapsed ?
        `<button type="button" class="main-sidebar-reveal" data-action="toggle-sidebar" aria-label="Afficher le menu des dossiers" title="Menu">☰</button>`
      : ""
    }${renderMain()}</main>
    ${aiPanelExpanded ? renderAiPanel() : ""}
    `
    }
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
  wireEvents();
  wireFolderManagerDnD();
  focusPromptsAfterRender();
  restoreScrollAfterRender(scrollPrev);
}
