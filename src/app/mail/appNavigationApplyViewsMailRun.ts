import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import type { NavSnapshot } from "../../navigation";
import { render } from "../dispatch";
import { state } from "../state";
import { defaultListFilterFromPrefs } from "./accountDefaultPrefs";
import type { AppNavigationStackDeps } from "./appNavigationStackContext";
import { loadMailView } from "./mailListView";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { searchThreads } from "./searchThreadsRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";

export async function applyNavSnapshotMailViews(snap: NavSnapshot, d: AppNavigationStackDeps): Promise<void> {
  switch (snap.view) {
    case "list":
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
      clearThreadAiSummaryState();
      if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
        await loadMailView(false);
        await refreshSavedDraftsMailboxCount();
      }
      render();
      if (
        (snap.search?.trim() ?? "") ||
        (snap.searchSenders?.length ?? 0) > 0 ||
        snap.listFilter !== defaultListFilterFromPrefs()
      ) {
        void searchThreads();
      }
      break;
    case "thread": {
      const tid = snap.selectedThreadId?.trim();
      if (!tid) {
        state.view = "list";
        render();
        break;
      }
      await d.openThread(tid, { skipHistory: true, preserveAi: snap.aiOpen });
      break;
    }
    case "settings":
      state.view = "settings";
      state.settingsTab = snap.settingsTab ?? state.settingsTab;
      clearThreadAiSummaryState();
      render();
      break;
    case "compose":
      state.view = "compose";
      render();
      break;
    default:
      break;
  }
}
