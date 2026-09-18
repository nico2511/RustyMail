import type { OrgProposal } from "../../organizationView";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { runOrgV2Apply } from "./orgFolderWireActions";

export function tryHandleOrgV2ConfirmWire(action: string): boolean {
  switch (action) {
    case "org-v2-trash-cancel":
      state.organizationV2.trashConfirmOpen = false;
      state.organizationV2.pendingTrashProposalId = null;
      state.organizationV2.pendingTrashActionOverride = null;
      render();
      return true;
    case "org-v2-trash-confirm": {
      const acc = currentAccount();
      const pid = state.organizationV2.pendingTrashProposalId;
      if (!acc?.id || !pid) return true;
      const override = state.organizationV2.pendingTrashActionOverride;
      state.organizationV2.trashConfirmOpen = false;
      state.organizationV2.pendingTrashProposalId = null;
      state.organizationV2.pendingTrashActionOverride = null;
      render();
      const trashProposal = state.organizationV2.report?.proposals.find((p: OrgProposal) => p.id === pid);
      if (!trashProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        return true;
      }
      void runOrgV2Apply(acc.id, trashProposal, "bulk-trash-org", override ?? undefined);
      return true;
    }
    case "org-v2-delete-mailbox-cancel":
      state.organizationV2.deleteMailboxConfirmOpen = false;
      state.organizationV2.pendingDeleteMailboxProposalId = null;
      render();
      return true;
    case "org-v2-delete-mailbox-confirm": {
      const acc = currentAccount();
      const pid = state.organizationV2.pendingDeleteMailboxProposalId;
      if (!acc?.id || !pid) return true;
      state.organizationV2.deleteMailboxConfirmOpen = false;
      state.organizationV2.pendingDeleteMailboxProposalId = null;
      render();
      const delMbProposal = state.organizationV2.report?.proposals.find((p: OrgProposal) => p.id === pid);
      if (!delMbProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        return true;
      }
      void runOrgV2Apply(acc.id, delMbProposal, undefined, undefined, "delete-mailbox");
      return true;
    }
    default:
      return false;
  }
}
