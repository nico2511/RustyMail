import {
  navPop,
  navPopForward,
  navPushBackEntry,
  navPushForward,
} from "../../navigation";
import { render } from "../dispatch";
import { state } from "../state";
import { applyNavSnapshot } from "./appNavigationApplyRun";
import { captureCurrentNav } from "./appNavigationSnapshotRun";
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
