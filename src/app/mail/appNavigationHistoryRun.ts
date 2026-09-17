import {
  navJumpToStackIndex,
  navPop,
  navPopForward,
  navPushBackEntry,
  navPushForward,
} from "../../navigation";
import { render } from "../dispatch";
import type { NavigateOpts } from "../types";
import { state } from "../state";
import { applyNavSnapshot } from "./appNavigationApplyRun";
import { beginNavigation, captureCurrentNav } from "./appNavigationSnapshotRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";

export async function goBack(): Promise<void> {
  const snap = navPop();
  if (!snap) {
    if (state.view === "folderManager" && state.folderManager.selectedMailbox) {
      state.folderManager.selectedMailbox = null;
      state.threads = [];
      render();
      return;
    }
    if (state.view !== "list") {
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
      state.selectedContactEmail = undefined;
      state.aiOpen = false;
      clearThreadAiSummaryState();
      render();
    }
    return;
  }
  navPushForward(captureCurrentNav());
  await applyNavSnapshot(snap);
}

export async function goForward(): Promise<void> {
  const snap = navPopForward();
  if (!snap) return;
  navPushBackEntry(captureCurrentNav());
  await applyNavSnapshot(snap);
}

export function navigateToInbox(opts?: NavigateOpts): void {
  beginNavigation("list", { resetStack: true, ...opts });
  state.view = "list";
  state.selectedContactEmail = undefined;
  state.selectedThread = undefined;
  state.selectedThreadId = undefined;
  state.aiOpen = false;
  clearThreadAiSummaryState();
  render();
}

export async function navigateToBreadcrumbIndex(stackIndex: number): Promise<void> {
  if (stackIndex < 0) {
    navigateToInbox();
    return;
  }
  const target = navJumpToStackIndex(stackIndex, captureCurrentNav());
  if (!target) return;
  await applyNavSnapshot(target);
}
