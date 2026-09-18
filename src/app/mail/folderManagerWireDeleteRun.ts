import { render } from "../dispatch";
import { state } from "../state";
import { fmConfirmDeleteMailbox } from "./orgFolderWireActions";

export function tryHandleFolderManagerDeleteWire(action: string, element?: HTMLElement): boolean {
  switch (action) {
    case "fm-delete": {
      const mb = element?.dataset.mailbox?.trim();
      if (!mb) return true;
      state.folderManager.pendingDeleteMailbox = mb;
      state.folderManager.deleteConfirmOpen = true;
      state.folderManager.deleteConfirmChecked = false;
      render();
      return true;
    }
    case "fm-delete-cancel":
      state.folderManager.deleteConfirmOpen = false;
      state.folderManager.pendingDeleteMailbox = null;
      state.folderManager.deleteConfirmChecked = false;
      render();
      return true;
    case "fm-delete-check-toggle":
      state.folderManager.deleteConfirmChecked = Boolean(
        document.querySelector<HTMLInputElement>("#fm-delete-check")?.checked,
      );
      render();
      return true;
    case "fm-delete-confirm":
      void fmConfirmDeleteMailbox();
      return true;
    default:
      return false;
  }
}
