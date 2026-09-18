import type { OrgApplyProgress } from "../../organizationView";
import {
  orgApplyProposal,
  type OrgActionOverride,
  type OrgProposal,
} from "../../organizationView";
import {
  ORG_V2_APPLY_CHUNK_SIZE,
  chunkStringIds,
  collectOrgProposalApplyIds,
  mergeOrgApplyProgress,
  optimisticOrgV2PatchAfterApply,
  optimisticOrgV2RemoveProposal,
  orgV2ProposalBatchCleared,
  orgV2RecordDecision,
} from "../../organizationViewV2";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";
import { refreshOrganizationV2Report } from "./orgOrganizationReportRefresh";
import { orgV2ApplyRunDeps } from "./orgV2ApplyContext";

export async function runOrgV2Apply(
  accountId: string,
  proposal: OrgProposal,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  const proposalId = proposal.id;
  const applyIds = collectOrgProposalApplyIds(proposal, threadIds);
  const chunks =
    applyIds.length > ORG_V2_APPLY_CHUNK_SIZE
      ? chunkStringIds(applyIds, ORG_V2_APPLY_CHUNK_SIZE)
      : applyIds.length > 0
        ? [applyIds]
        : [null];

  state.organizationV2.applying = true;
  state.organizationV2.applyCancelRequested = false;
  state.organizationV2.applyDone = 0;
  state.organizationV2.applyTotal = applyIds.length > 0 ? applyIds.length : null;
  state.organizationV2.applyMessage =
    applyIds.length > 0 ? `Application… 0/${applyIds.length}` : "Application…";
  render();

  let merged: OrgApplyProgress = {
    done: 0,
    total: applyIds.length,
    message: "",
    errors: [],
    mailboxesToSync: [],
    threadsAffected: [],
  };
  let cancelled = false;

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (state.organizationV2.applyCancelRequested) {
        cancelled = true;
        break;
      }
      const chunk = chunks[i];
      const p = await orgApplyProposal(
        accountId,
        proposalId,
        proposal,
        trashAck,
        actionOverride,
        deleteMailboxAck,
        chunk,
      );
      merged = mergeOrgApplyProgress(merged, p);
      state.organizationV2.applyDone = merged.done;
      if (applyIds.length > 0) {
        state.organizationV2.applyMessage = `Application… ${Math.min(merged.done, applyIds.length)}/${applyIds.length}`;
      } else {
        state.organizationV2.applyMessage = p.message || "Application…";
      }
      if (state.organizationV2.report) {
        state.organizationV2.report = optimisticOrgV2PatchAfterApply(
          state.organizationV2.report,
          proposalId,
          p,
        );
      }
      render();
    }

    const remaining = state.organizationV2.report?.proposals.find((x) => x.id === proposalId);
    const batchCleared = orgV2ProposalBatchCleared(remaining);
    const cleanSuccess = batchCleared && merged.errors.length === 0 && !cancelled;

    if (cleanSuccess) {
      await orgV2RecordDecision(accountId, proposal, "applied");
      if (state.organizationV2.report) {
        state.organizationV2.report = optimisticOrgV2RemoveProposal(
          state.organizationV2.report,
          proposalId,
        );
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
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organizationV2.applying = false;
    state.organizationV2.applyCancelRequested = false;
    state.organizationV2.applyTotal = null;
    render();
  }
}
