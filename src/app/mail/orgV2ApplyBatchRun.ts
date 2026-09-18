import type { OrgActionOverride, OrgProposal } from "../../organizationView";
import {
  ORG_V2_APPLY_CHUNK_SIZE,
  chunkStringIds,
  collectOrgProposalApplyIds,
} from "../../organizationViewV2";
import { render } from "../dispatch";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { applyOrgV2ProposalChunks } from "./orgV2ApplyChunkLoopRun";
import { finalizeOrgV2ApplyOutcome } from "./orgV2ApplyOutcomeRun";

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

  try {
    const { merged, cancelled } = await applyOrgV2ProposalChunks(
      accountId,
      proposal,
      proposalId,
      applyIds,
      chunks,
      trashAck,
      actionOverride,
      deleteMailboxAck,
    );
    await finalizeOrgV2ApplyOutcome(accountId, proposal, proposalId, merged, cancelled);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organizationV2.applying = false;
    state.organizationV2.applyCancelRequested = false;
    state.organizationV2.applyTotal = null;
    render();
  }
}
