import { navJumpToStackIndex } from "../../navigation";
import { render } from "../dispatch";
import type { NavigateOpts } from "../types";
import { state } from "../state";
import { applyNavSnapshot } from "./appNavigationApplyRun";
import { beginNavigation, captureCurrentNav } from "./appNavigationSnapshotRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";

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
