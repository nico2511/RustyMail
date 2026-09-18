import { saveFolderTreeExpanded } from "../../mailboxTree";
import { setMailboxLocked } from "../../folderManagerView";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { openOrganizationMailbox } from "./orgFolderWireActions";

export function tryHandleFolderManagerTreeWire(action: string, element?: HTMLElement): boolean {
  switch (action) {
    case "fm-toggle-lock": {
      const acc = currentAccount();
      const mb = element?.dataset.mailbox?.trim();
      if (!acc?.id || !mb) return true;
      const locked = element?.dataset.locked === "1";
      void setMailboxLocked(acc.id, mb, !locked)
        .then(async (list: string[]) => {
          if (state.folderManager.report) state.folderManager.report.lockedMailboxes = list;
          render();
        })
        .catch((e: unknown) => toast(tauriErrorMessage(e)));
      return true;
    }
    case "fm-toggle-node": {
      const key = element?.dataset.nodeKey?.trim();
      if (!key) return true;
      const cur = state.folderManager.expandedNodes[key];
      state.folderManager.expandedNodes[key] = cur === true ? false : true;
      saveFolderTreeExpanded(state.folderManager.expandedNodes);
      render();
      return true;
    }
    case "fm-open-inbox": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void openOrganizationMailbox(mb);
      return true;
    }
    default:
      return false;
  }
}
