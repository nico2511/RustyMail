import { render } from "../dispatch";
import { state } from "../state";
import { fmConfirmArchiveMailbox } from "./orgFolderWireActions";

export function tryHandleFolderManagerArchiveWire(action: string, element?: HTMLElement): boolean {
  switch (action) {
    case "fm-archive": {
      const mb = element?.dataset.mailbox?.trim();
      if (!mb) return true;
      state.folderManager.pendingArchiveMailbox = mb;
      state.folderManager.archiveRemember = (state.folderManager.report?.autoArchiveMailboxes ?? []).some(
        (m: string) => m.toLowerCase() === mb.toLowerCase(),
      );
      state.folderManager.archiveConfirmOpen = true;
      render();
      return true;
    }
    case "fm-archive-cancel":
      state.folderManager.archiveConfirmOpen = false;
      state.folderManager.pendingArchiveMailbox = null;
      render();
      return true;
    case "fm-archive-remember-toggle":
      state.folderManager.archiveRemember = Boolean(
        document.querySelector<HTMLInputElement>("#fm-archive-remember")?.checked,
      );
      return true;
    case "fm-archive-confirm":
      void fmConfirmArchiveMailbox();
      return true;
    default:
      return false;
  }
}
