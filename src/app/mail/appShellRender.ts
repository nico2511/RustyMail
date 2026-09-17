import { navApplyPendingScrollRestore } from "../../navigation";
import { root as appShell } from "../dom";
import { isConfirmOpen, isTextPromptOpen, renderConfirmModal, renderTextPromptModal } from "../modals/promptConfirm";
import { registerRender } from "../dispatch";
import { wireEvents } from "../ui/wireEvents";
import { registerWireEventsContext } from "../ui/wireEventsBridge";
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
import type { AddressBookRow } from "../types";
import { state } from "../state";
import { wireFolderManagerDnD } from "./folderManagerDnD";
import { syncMailboxDigestPanelWithFeaturePref } from "./mailboxDigest";
import { captureAccountsFormIdentityFromDom } from "./settingsAccountsFormState";
import { aiSidePanelExpandedForShell } from "./threadShellLayout";

let skipAccountIdentityCaptureOnce = false;
let composeInteractionsAbort: AbortController | undefined;
let addressBookEditEmail: string | null = null;

export const AI_PREFS_IMMEDIATE_CHECKBOX_IDS = new Set([
  "prefs-openrouter-enabled",
  "prefs-llama-server-enabled",
  "prefs-llama-server-cpu-override",
  "prefs-llama-server-spawn-enabled",
  "prefs-bg-auto-semantic",
  "prefs-bg-llm-prefetch",
  "prefs-bg-idle-ai-cache",
  "prefs-ai-cloud-fallback",
  "prefs-semantic-search",
]);

const composeInteractionsAbortRef = {
  get current() {
    return composeInteractionsAbort;
  },
  set current(v: AbortController | undefined) {
    composeInteractionsAbort = v;
  },
};

const skipAccountIdentityCaptureOnceRef = {
  get current() {
    return skipAccountIdentityCaptureOnce;
  },
  set current(v: boolean) {
    skipAccountIdentityCaptureOnce = v;
  },
};

const addressBookEditEmailRef = {
  get current() {
    return addressBookEditEmail;
  },
  set current(v: string | null) {
    addressBookEditEmail = v;
  },
};

export function getAddressBookEditEmail(): string | null {
  return addressBookEditEmail;
}

export function renderAppShell(): void {
  syncMailboxDigestPanelWithFeaturePref();
  if (state.view === "settings" && state.settingsTab === "accounts") {
    captureAccountsFormIdentityFromDom(skipAccountIdentityCaptureOnce);
    if (skipAccountIdentityCaptureOnce) {
      skipAccountIdentityCaptureOnce = false;
    }
  } else {
    captureAccountsFormIdentityFromDom(true);
  }

  const prevFolderList = document.querySelector<HTMLElement>(".folder-list");
  const prevSidebarScrollTop = prevFolderList?.scrollTop ?? 0;
  const prevSidebarScrollLeft = prevFolderList?.scrollLeft ?? 0;
  const prevOrgPanel = document.querySelector<HTMLElement>(".organization-panel");
  const prevOrgScrollTop = prevOrgPanel?.scrollTop ?? 0;
  const prevAiModalBody = state.settingsAiModal
    ? document.querySelector<HTMLElement>(".settings-ai-modal-body")
    : null;
  const prevAiModalScrollTop = prevAiModalBody?.scrollTop ?? 0;

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

  const nextFolderList = document.querySelector<HTMLElement>(".folder-list");
  if (nextFolderList) {
    nextFolderList.scrollTop = prevSidebarScrollTop;
    nextFolderList.scrollLeft = prevSidebarScrollLeft;
  }
  const nextOrgPanel = document.querySelector<HTMLElement>(".organization-panel");
  if (nextOrgPanel && prevOrgScrollTop > 0) {
    nextOrgPanel.scrollTop = prevOrgScrollTop;
  }
  const nextAiModalBody = state.settingsAiModal
    ? document.querySelector<HTMLElement>(".settings-ai-modal-body")
    : null;
  if (nextAiModalBody && prevAiModalScrollTop > 0) {
    nextAiModalBody.scrollTop = prevAiModalScrollTop;
  }
  window.requestAnimationFrame(() => {
    navApplyPendingScrollRestore();
    if (nextOrgPanel && prevOrgScrollTop > 0) {
      nextOrgPanel.scrollTop = prevOrgScrollTop;
    }
    if (nextAiModalBody && prevAiModalScrollTop > 0) {
      nextAiModalBody.scrollTop = prevAiModalScrollTop;
    }
  });
}

export function registerAppShellWireContext(
  getAddressBookRowsCache: () => AddressBookRow[],
): void {
  registerWireEventsContext({
    addressBookRowsCache: getAddressBookRowsCache,
    skipAccountIdentityCaptureOnceRef,
    addressBookEditEmailRef,
    AI_PREFS_IMMEDIATE_CHECKBOX_IDS,
    composeInteractionsAbortRef,
  });
  registerRender(renderAppShell);
}
