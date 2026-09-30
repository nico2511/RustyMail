import { render } from "../dispatch";
import { state } from "../state";
import { composeDraftUserHasEdited } from "./composeDraftContentKey";
import { finalizeCloseComposeFromUser } from "./composeCloseFlow";
import { scheduleDraftRevisionSave } from "./composeDraftRevisionAutosave";
import {
  dismissOrphanDraftSession,
  resumeOrphanDraftSession,
} from "./composeOrphanDraftSession";
import { closeComposeWithoutSavingFromWire, saveAndCloseComposeFromWire } from "./composeWireActionsRun";

export async function tryHandleComposeCloseWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "close-compose":
      void finalizeCloseComposeFromUser();
      return true;
    case "close-close-compose-modal":
      state.closeComposeModal = null;
      render();
      if (composeDraftUserHasEdited()) {
        try {
          scheduleDraftRevisionSave();
        } catch (err) {
          if (!(err instanceof Error) || !err.message.includes("registerComposeDraftRevisionAutosaveDeps")) {
            throw err;
          }
        }
      }
      return true;
    case "close-compose-without-saving":
      void closeComposeWithoutSavingFromWire();
      return true;
    case "save-and-close-compose":
      void saveAndCloseComposeFromWire();
      return true;
    case "close-resume-draft-modal":
      state.resumeDraftModal = null;
      render();
      return true;
    case "resume-orphan-draft": {
      const sid = element?.dataset.sessionId ?? "";
      void resumeOrphanDraftSession(sid);
      return true;
    }
    case "dismiss-orphan-draft": {
      const sid = element?.dataset.sessionId ?? "";
      void dismissOrphanDraftSession(sid);
      return true;
    }
    default:
      return false;
  }
}
