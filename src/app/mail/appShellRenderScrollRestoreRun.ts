import { navApplyPendingScrollRestore } from "../../navigation";
import { state } from "../state";

export type AppShellScrollSnapshot = {
  sidebarTop: number;
  sidebarLeft: number;
  orgTop: number;
  aiModalTop: number;
  hadAiModal: boolean;
  settingsBodyTop: number;
  hadSettingsBody: boolean;
};

export function snapshotAppShellScroll(): AppShellScrollSnapshot {
  const prevFolderList = document.querySelector<HTMLElement>(".folder-list");
  const settingsBody = document.querySelector<HTMLElement>(".settings-body");
  return {
    sidebarTop: prevFolderList?.scrollTop ?? 0,
    sidebarLeft: prevFolderList?.scrollLeft ?? 0,
    orgTop: document.querySelector<HTMLElement>(".organization-panel")?.scrollTop ?? 0,
    aiModalTop: state.settingsAiModal
      ? (document.querySelector<HTMLElement>(".settings-ai-modal-body")?.scrollTop ?? 0)
      : 0,
    hadAiModal: Boolean(state.settingsAiModal),
    settingsBodyTop: state.view === "settings" ? (settingsBody?.scrollTop ?? 0) : 0,
    hadSettingsBody: state.view === "settings" && Boolean(settingsBody),
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
  const nextSettingsBody = prev.hadSettingsBody
    ? document.querySelector<HTMLElement>(".settings-body")
    : null;
  if (nextSettingsBody && prev.settingsBodyTop > 0) {
    nextSettingsBody.scrollTop = prev.settingsBodyTop;
  }
  window.requestAnimationFrame(() => {
    navApplyPendingScrollRestore();
    if (nextOrgPanel && prev.orgTop > 0) {
      nextOrgPanel.scrollTop = prev.orgTop;
    }
    if (nextAiModalBody && prev.aiModalTop > 0) {
      nextAiModalBody.scrollTop = prev.aiModalTop;
    }
    if (nextSettingsBody && prev.settingsBodyTop > 0) {
      nextSettingsBody.scrollTop = prev.settingsBodyTop;
    }
  });
}
