import type { OrgApplyProgress } from "../../organizationView";
import type { OrgProposal } from "../../organizationView";
import {
  orgV2ProposalBatchCleared,
  orgV2RecordDecision,
  optimisticOrgV2RemoveProposal,
} from "../../organizationViewV2";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { state } from "../state";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";
import { refreshOrganizationV2Report } from "./orgOrganizationReportRefresh";
import { orgV2ApplyRunDeps } from "./orgV2ApplyContext";

export async function finalizeOrgV2ApplyOutcome(
  accountId: string,
  proposal: OrgProposal,
  proposalId: string,
  merged: OrgApplyProgress,
  cancelled: boolean,
): Promise<void> {
  const remaining = state.organizationV2.report?.proposals.find((x) => x.id === proposalId);
  const batchCleared = orgV2ProposalBatchCleared(remaining);
  const cleanSuccess = batchCleared && merged.errors.length === 0 && !cancelled;

  if (cleanSuccess) {
    await orgV2RecordDecision(accountId, proposal, "applied");
    if (state.organizationV2.report) {
      state.organizationV2.report = optimisticOrgV2RemoveProposal(state.organizationV2.report, proposalId);
    }
    state.organizationV2.applyMessage = merged.message || "Lot appliqué.";
    toast(state.organizationV2.applyMessage);
  } else if (cancelled) {
    state.organizationV2.applyMessage = `Interrompu — ${merged.done} traité(s).`;
    toast(state.organizationV2.applyMessage);
  } else if (batchCleared && merged.errors.length > 0) {
    state.organizationV2.applyMessage =
      merged.message || `Terminé avec ${merged.errors.length} erreur(s).`;
    toast(state.organizationV2.applyMessage);
  } else {
    state.organizationV2.applyMessage =
      merged.message ||
      `Partiel — ${merged.done} ok${merged.errors.length ? `, ${merged.errors.length} erreur(s)` : ""}.`;
    toast(state.organizationV2.applyMessage);
  }

  if (merged.errors.length > 0) {
    toast(merged.errors.slice(0, 3).join(" · "));
  }

  const hadImapChange =
    merged.done > 0 ||
    (merged.mailboxesToSync?.length ?? 0) > 0 ||
    (merged.threadsAffected?.length ?? 0) > 0;
  if (hadImapChange) {
    await refreshMailboxesAfterImapChange();
    if (state.view === "list" && isTauriRuntime()) {
      try {
        await orgV2ApplyRunDeps().loadMailView(false);
      } catch {
        /* ok */
      }
    }
  }
  if (!cleanSuccess) {
    await refreshOrganizationV2Report();
  } else {
    void refreshOrganizationV2Report();
  }
}
