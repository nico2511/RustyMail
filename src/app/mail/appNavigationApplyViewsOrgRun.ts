import type { NavSnapshot } from "../../navigation";
import { render } from "../dispatch";
import { state } from "../state";
import type { AppNavigationStackDeps } from "./appNavigationStackContext";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";

export async function applyNavSnapshotOrgViews(snap: NavSnapshot, d: AppNavigationStackDeps): Promise<void> {
  switch (snap.view) {
    case "organization":
      state.view = "organization";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      render();
      break;
    case "organizationV2":
      state.view = "organizationV2";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      render();
      break;
    case "folderManager": {
      state.view = "folderManager";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      const mb = snap.folderManagerSelectedMailbox ?? null;
      state.folderManager.selectedMailbox = mb;
      if (!mb) state.threads = [];
      render();
      if (mb) await d.fmSelectMailbox(mb, { skipHistory: true });
      else await d.refreshFolderManagerTree();
      break;
    }
    default:
      break;
  }
}
