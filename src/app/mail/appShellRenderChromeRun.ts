import { navApplyPendingScrollRestore } from "../../navigation";
import { isTextPromptOpen } from "../modals/promptConfirm";
import { state } from "../state";
import { captureAccountsFormIdentityFromDom } from "./settingsAccountsFormState";
import { skipAccountIdentityCaptureOnceRef } from "./appShellRenderRefs";

export function captureAccountsFormBeforeRender(): void {
  if (state.view === "settings" && state.settingsTab === "accounts") {
    captureAccountsFormIdentityFromDom(skipAccountIdentityCaptureOnceRef.current);
    if (skipAccountIdentityCaptureOnceRef.current) {
      skipAccountIdentityCaptureOnceRef.current = false;
    }
  } else {
    captureAccountsFormIdentityFromDom(true);
  }
}

export type AppShellScrollSnapshot = {
  sidebarTop: number;
  sidebarLeft: number;
  orgTop: number;
  aiModalTop: number;
  hadAiModal: boolean;
};

export function snapshotAppShellScroll(): AppShellScrollSnapshot {
  const prevFolderList = document.querySelector<HTMLElement>(".folder-list");
  return {
    sidebarTop: prevFolderList?.scrollTop ?? 0,
    sidebarLeft: prevFolderList?.scrollLeft ?? 0,
    orgTop: document.querySelector<HTMLElement>(".organization-panel")?.scrollTop ?? 0,
    aiModalTop: state.settingsAiModal
      ? (document.querySelector<HTMLElement>(".settings-ai-modal-body")?.scrollTop ?? 0)
      : 0,
    hadAiModal: Boolean(state.settingsAiModal),
  };
}

export function restoreScrollAfterRender(prev: AppShellScrollSnapshot): void {
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

export function focusPromptsAfterRender(): void {
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
