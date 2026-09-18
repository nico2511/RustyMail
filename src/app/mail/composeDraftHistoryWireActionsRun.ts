import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { state } from "../state";
import { computeDraftDiffAgainstRevision } from "./composeDraftRevisionDiff";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import { restoreDraftRevisionFromWire } from "./composeWireActionsRun";

export async function tryHandleComposeDraftHistoryWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "refresh-draft-history":
      void refreshDraftRevisions(60);
      return true;
    case "toggle-draft-versions-expanded":
      if (!isTauriRuntime()) return true;
      state.draftVersionsListExpanded = !state.draftVersionsListExpanded;
      render();
      return true;
    case "compare-draft-revision": {
      const revisionId = element?.dataset.revisionId?.trim() ?? "";
      if (!revisionId) return true;
      void computeDraftDiffAgainstRevision(revisionId);
      return true;
    }
    case "toggle-draft-compare-view":
      state.draftDiffView = state.draftDiffView === "preview" ? "diff" : "preview";
      render();
      return true;
    case "restore-draft-revision": {
      if (!isTauriRuntime()) return true;
      const revisionId = element?.dataset.revisionId?.trim() ?? "";
      void restoreDraftRevisionFromWire(revisionId);
      return true;
    }
    default:
      return false;
  }
}
