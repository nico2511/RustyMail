import type { OrgProposal } from "../../organizationView";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import {
  confirmThenRunOrgV2Apply,
  orgV2DismissProposal,
  orgV2SnoozeProposal,
} from "./orgFolderWireActions";

export function tryHandleOrgV2ProposalWire(action: string, element?: HTMLElement): boolean {
  switch (action) {
    case "org-v2-dismiss": {
      const pid = element?.dataset.proposalId?.trim();
      if (pid) void orgV2DismissProposal(pid);
      return true;
    }
    case "org-v2-snooze": {
      const pid = element?.dataset.proposalId?.trim();
      if (pid) void orgV2SnoozeProposal(pid);
      return true;
    }
    case "org-v2-apply": {
      const acc = currentAccount();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return true;
      if (element?.dataset.trash === "1") {
        state.organizationV2.trashConfirmOpen = true;
        state.organizationV2.pendingTrashProposalId = proposalId;
        state.organizationV2.pendingTrashActionOverride = null;
        render();
        return true;
      }
      if (element?.dataset.deleteMailbox === "1") {
        state.organizationV2.deleteMailboxConfirmOpen = true;
        state.organizationV2.pendingDeleteMailboxProposalId = proposalId;
        render();
        return true;
      }
      const applyProposal = state.organizationV2.report?.proposals.find((p: OrgProposal) => p.id === proposalId);
      if (!applyProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        return true;
      }
      void confirmThenRunOrgV2Apply(acc.id, proposalId);
      return true;
    }
    case "org-v2-cancel-apply":
      if (state.organizationV2.applying) {
        state.organizationV2.applyCancelRequested = true;
        state.organizationV2.applyMessage = "Arrêt demandé…";
        render();
      }
      return true;
    default:
      return false;
  }
}
