import { formatOrgApplyImpact } from "../../organizationView";
import type { OrgActionOverride } from "../../organizationView";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { state } from "../state";
import { runOrgApply } from "./orgApplyExecuteRun";

export async function confirmThenRunOrgApply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  const proposal = state.organization.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    toast("Proposition introuvable — relancez l’analyse du compte.");
    return;
  }
  if (proposal.applicable === false) return;
  const impact = formatOrgApplyImpact(proposal, actionOverride);
  const ok = await openConfirmModal({
    title: "Confirmer l’action",
    body: `${impact}\n\nAppliquer cette action sur le compte ?`,
    confirmLabel: "Appliquer",
  });
  if (!ok) return;
  await runOrgApply(accountId, proposalId, trashAck, actionOverride, deleteMailboxAck, threadIds);
}
