import type { OrgApplyProgress, OrgProposal } from "../../organizationView";
import { orgUndoLast } from "../../organizationView";
import type { OrgV2ScanReport } from "../../organizationViewV2";
import { orgV2ScanAccount } from "../../organizationViewV2";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";
import {
  confirmThenRunOrgV2Apply,
  orgV2DismissProposal,
  orgV2SnoozeProposal,
  runOrgV2Apply,
} from "./orgFolderWireActions";

export function tryHandleOrgV2Wire(action: string, element?: HTMLElement): boolean {
  switch (action) {
    case "org-v2-scan": {
      const acc = currentAccount();
      if (!acc?.id) return true;
      state.organizationV2.scanning = true;
      state.organizationV2.applyMessage = "Analyse…";
      render();
      const includeLlm = Boolean(state.appPrefs.ai.featureOrgProposalsEnabled);
      void orgV2ScanAccount(acc.id, includeLlm)
        .then((report: OrgV2ScanReport) => {
          state.organizationV2.report = report;
          state.organizationV2.scanning = false;
          state.organizationV2.applyMessage = `${report.proposals.length} action(s).`;
          render();
        })
        .catch((e: unknown) => {
          state.organizationV2.scanning = false;
          state.organizationV2.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      return true;
    }
    case "org-v2-undo": {
      const accUndo = currentAccount();
      if (!accUndo?.id) return true;
      state.organizationV2.applying = true;
      state.organizationV2.applyMessage = "Annulation…";
      render();
      void orgUndoLast(accUndo.id)
        .then((p: OrgApplyProgress) => {
          state.organizationV2.applying = false;
          state.organizationV2.applyMessage = p.message || "Lot annulé.";
          toast(state.organizationV2.applyMessage);
          render();
        })
        .catch((e: unknown) => {
          state.organizationV2.applying = false;
          state.organizationV2.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      return true;
    }
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
    case "org-v2-ignore-mailbox":
    case "org-v2-unignore-mailbox":
      return true;
    default:
      return false;
  }
}
