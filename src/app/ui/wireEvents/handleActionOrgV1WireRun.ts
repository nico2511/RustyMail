import type { OrgApplyProgress, OrgProposal, OrgScanReport } from "../../../organizationView";
import {
  currentAccount,
  render,
  state,
  toast,
  tauriErrorMessage,
} from "./depsCore";
import {
  confirmThenRunOrgApply,
  openOrganizationMailbox,
  orgRetagAccount,
  orgScanAccount,
  refreshOrganizationReport,
  runOrgApply,
} from "./depsOrgFolder";

export function tryHandleOrgV1Wire(action: string, element?: HTMLElement): boolean {
  switch (action) {
    case "org-scan": {
      const acc = currentAccount();
      if (!acc?.id) return true;
      state.organization.scanning = true;
      state.organization.applyMessage = "Analyse de la boîte (structure, propositions)…";
      render();
      void orgScanAccount(acc.id, Boolean(state.appPrefs.ai.featureOrgProposalsEnabled))
        .then((report: OrgScanReport) => {
          state.organization.report = report;
          state.organization.scanning = false;
          state.organization.applyMessage = `${report.proposals.length} proposition(s).`;
          render();
        })
        .catch((e: unknown) => {
          state.organization.scanning = false;
          state.organization.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      return true;
    }
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
    case "org-retag-all": {
      const acc = currentAccount();
      if (!acc?.id) return true;
      state.organization.applying = true;
      state.organization.applyMessage = "Normalisation des tags en cours…";
      toast("Recalcul des tags sur tout le compte…");
      render();
      void orgRetagAccount(acc.id, false)
        .then(async (p: OrgApplyProgress) => {
          state.organization.applying = false;
          state.organization.applyMessage = p.message;
          toast(p.message);
          await refreshOrganizationReport();
          render();
        })
        .catch((e: unknown) => {
          state.organization.applying = false;
          state.organization.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      return true;
    }
    default:
      return false;
  }
}
