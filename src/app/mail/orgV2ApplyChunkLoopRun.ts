import type { OrgApplyProgress } from "../../organizationView";
import {
  orgApplyProposal,
  type OrgActionOverride,
  type OrgProposal,
} from "../../organizationView";
import { mergeOrgApplyProgress, optimisticOrgV2PatchAfterApply } from "../../organizationViewV2";
import { render } from "../dispatch";
import { state } from "../state";

export async function applyOrgV2ProposalChunks(
  accountId: string,
  proposal: OrgProposal,
  proposalId: string,
  applyIds: string[],
  chunks: (string[] | null)[],
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
  deleteMailboxAck?: string,
): Promise<{ merged: OrgApplyProgress; cancelled: boolean }> {
  let merged: OrgApplyProgress = {
    done: 0,
    total: applyIds.length,
    message: "",
    errors: [],
    mailboxesToSync: [],
    threadsAffected: [],
  };
  let cancelled = false;

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

  return { merged, cancelled };
}
