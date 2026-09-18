import { persistAiFeaturePrefs } from "../../aiPrefsPersist";
import { setAllAiFeatures } from "../../aiFeatures";
import { normalizeAiPrefsMerged } from "../../prefs_defaults";
import { saveFolderTreeExpanded } from "../../mailboxTree";
import { setMailboxLocked } from "../../folderManagerView";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";
import {
  fmConfirmArchiveMailbox,
  fmConfirmDeleteMailbox,
  fmCreateMailbox,
  fmSelectMailbox,
  fmSyncMailbox,
  openOrganizationMailbox,
  refreshFolderManagerTree,
} from "./orgFolderWireActions";

export function tryHandleFolderManagerWire(action: string, element?: HTMLElement): boolean {
  switch (action) {
    case "fm-refresh":
      void refreshFolderManagerTree();
      return true;
    case "fm-create-root":
      void fmCreateMailbox();
      return true;
    case "fm-create-child": {
      const parent = element?.dataset.mailbox?.trim();
      if (parent) void fmCreateMailbox(parent);
      return true;
    }
    case "fm-select": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void fmSelectMailbox(mb);
      return true;
    }
    case "fm-sync": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void fmSyncMailbox(mb);
      return true;
    }
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
