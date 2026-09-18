import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { state } from "../state";
import { draftHasRecipientsExtra } from "./composeDraftRecipients";
import { cycleComposeLayout } from "./cycleComposeLayout";
import { computePreview } from "./composeComposerBridge";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import { syncPreviewOpenFromComposeLayout } from "./composeViewWireActions";

export async function tryHandleComposeEditorLayoutWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "toggle-preview":
      await cycleComposeLayout();
      return true;
    case "set-compose-layout": {
      const raw = element?.dataset.composeLayout?.trim();
      if (raw !== "split" && raw !== "write" && raw !== "preview" && raw !== "historique") return true;
      if (raw === "historique" && !isTauriRuntime()) return true;
      state.composeLayout = raw;
      syncPreviewOpenFromComposeLayout();
      render();
      if (raw === "historique") void refreshDraftRevisions(60);
      if (state.composeLayout !== "write" && state.composeLayout !== "historique") {
        window.setTimeout(() => void computePreview(), 0);
      }
      return true;
    }
    case "toggle-compose-advanced":
      state.composeAdvancedOpen = !state.composeAdvancedOpen;
      render();
      return true;
    case "toggle-compose-cc-bcc": {
      if (draftHasRecipientsExtra(state.draft)) return true;
      state.composeCcBccOpen = !state.composeCcBccOpen;
      render();
      return true;
    }
    default:
      return false;
  }
}
