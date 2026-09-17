import {
  currentAccount,
  render,
  state,
  toast,
  t,
  saveFolderTreeExpanded,
  setMailboxLocked,
  orgV2ScanAccount,
  orgUndoLast,
  orgScanAccount,
  orgRetagAccount,
  tauriErrorMessage,
  openOrganizationV2View,
  openContactsView,
  openOrganizationView,
  openFolderManagerView,
  refreshFolderManagerTree,
  fmCreateMailbox,
  fmSelectMailbox,
  fmSyncMailbox,
  fmConfirmArchiveMailbox,
  fmConfirmDeleteMailbox,
  openOrganizationMailbox,
  orgV2DismissProposal,
  orgV2SnoozeProposal,
  confirmThenRunOrgV2Apply,
  runOrgV2Apply,
  confirmThenRunOrgApply,
  runOrgApply,
  refreshOrganizationReport,
} from "./deps";
import type { OrgApplyProgress, OrgProposal, OrgScanReport } from "../../../organizationView";
import type { OrgV2ScanReport } from "../../../organizationViewV2";

export async function tryHandleOrgFolder(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "open-contacts-view":
      void openContactsView();
      return true;
    case "open-organization-view":
      void openOrganizationView();
      return true;
    case "open-organization-v2-view":
      void openOrganizationV2View();
      return true;
    case "open-folder-manager-view":
      state.mailboxManageOpen = false;
      void openFolderManagerView();
      return true;
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