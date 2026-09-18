import {
  clearContactProfile,
  loadContactsList,
} from "../../contactsView";
import type { NavSnapshot } from "../../navigation";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import type { AppNavigationStackDeps } from "./appNavigationStackContext";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";

export async function applyNavSnapshotContactsViews(snap: NavSnapshot, d: AppNavigationStackDeps): Promise<void> {
  switch (snap.view) {
    case "contacts": {
      state.view = "contacts";
      state.selectedContactEmail = undefined;
      clearContactProfile();
      clearThreadAiSummaryState();
      render();
      const acc = currentAccount();
      if (acc?.id) {
        try {
          await loadContactsList(acc.id, { reset: true, query: snap.contactsListQuery });
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      }
      render();
      break;
    }
    case "contact": {
      const em = snap.selectedContactEmail?.trim();
      if (!em) {
        state.view = "contacts";
        render();
        break;
      }
      await d.openContactDetailView(em, { skipHistory: true });
      break;
    }
    default:
      break;
  }
}
