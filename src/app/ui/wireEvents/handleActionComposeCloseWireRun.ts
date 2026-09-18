import { finalizeCloseComposeFromUser, resumeOrphanDraftSession, dismissOrphanDraftSession } from "./depsComposeThread";
import { render, state } from "./depsCore";
import {
  closeComposeWithoutSavingFromWire,
  saveAndCloseComposeFromWire,
} from "../../mail/composeWireActionsRun";
export async function tryHandleComposeCloseWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "close-compose":
      void finalizeCloseComposeFromUser();
      return true;
    case "close-close-compose-modal":
      state.closeComposeModal = null;
      render();
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
