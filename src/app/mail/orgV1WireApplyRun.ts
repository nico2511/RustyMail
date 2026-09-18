import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { confirmThenRunOrgApply, openOrganizationMailbox } from "./orgFolderWireActions";

export function tryHandleOrgV1ApplyWire(action: string, element?: HTMLElement): boolean {
  switch (action) {
    case "org-open-mailbox": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void openOrganizationMailbox(mb);
      return true;
    }
    case "org-sync-mailbox":
    case "org-delete-mailbox-one":
      return true;
    case "org-apply-trash": {
      const acc = currentAccount();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return true;
      state.organization.trashConfirmOpen = true;
      state.organization.pendingTrashProposalId = proposalId;
      state.organization.pendingTrashActionOverride = "trash";
      render();
      return true;
    }
    case "org-apply-archive": {
      const acc = currentAccount();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return true;
      void confirmThenRunOrgApply(acc.id, proposalId, undefined, "archive");
      return true;
    }
    case "org-apply": {
      const acc = currentAccount();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return true;
      const isTrash = element?.dataset.trash === "1";
      if (isTrash) {
        state.organization.trashConfirmOpen = true;
        state.organization.pendingTrashProposalId = proposalId;
        state.organization.pendingTrashActionOverride = null;
        render();
        return true;
      }
      if (element?.dataset.deleteMailbox === "1") {
        state.organization.deleteMailboxConfirmOpen = true;
        state.organization.pendingDeleteMailboxProposalId = proposalId;
        render();
        return true;
      }
      void confirmThenRunOrgApply(acc.id, proposalId);
      return true;
    }
    default:
      return false;
  }
}
