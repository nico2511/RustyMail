import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { runOrgApply } from "./orgFolderWireActions";

export function tryHandleOrgV1ConfirmWire(action: string): boolean {
  switch (action) {
    case "org-trash-cancel":
      state.organization.trashConfirmOpen = false;
      state.organization.pendingTrashProposalId = null;
      state.organization.pendingTrashActionOverride = null;
      render();
      return true;
    case "org-trash-confirm": {
      const acc = currentAccount();
      const pid = state.organization.pendingTrashProposalId;
      if (!acc?.id || !pid) return true;
      const override = state.organization.pendingTrashActionOverride;
      state.organization.trashConfirmOpen = false;
      state.organization.pendingTrashProposalId = null;
      state.organization.pendingTrashActionOverride = null;
      render();
      void runOrgApply(acc.id, pid, "bulk-trash-org", override ?? undefined);
      return true;
    }
    case "org-delete-mailbox-cancel":
      state.organization.deleteMailboxConfirmOpen = false;
      state.organization.pendingDeleteMailboxProposalId = null;
      render();
      return true;
    case "org-delete-mailbox-confirm": {
      const acc = currentAccount();
      const pid = state.organization.pendingDeleteMailboxProposalId;
      if (!acc?.id || !pid) return true;
      state.organization.deleteMailboxConfirmOpen = false;
      state.organization.pendingDeleteMailboxProposalId = null;
      render();
      void runOrgApply(acc.id, pid, undefined, undefined, "delete-mailbox");
      return true;
    }
    default:
      return false;
  }
}
