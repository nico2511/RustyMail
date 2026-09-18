import type { OrgActionOverride, OrgProposal } from "../../organizationView";
import {
  formatOrgApplyImpact,
  orgPreviewProposal,
} from "../../organizationView";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { state } from "../state";
import { runOrgV2Apply } from "./orgV2ApplyBatchRun";

export async function confirmThenRunOrgV2Apply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
  deleteMailboxAck?: string,
): Promise<void> {
  const proposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    toast("Proposition introuvable — relancez l’analyse du compte.");
    return;
  }
  if (proposal.applicable === false) return;
  let previewLine = formatOrgApplyImpact(proposal, actionOverride);
  try {
    const preview = await orgPreviewProposal(accountId, proposalId, proposal, actionOverride);
    const sample = preview.items
      .slice(0, 5)
      .map((it) => `• ${it.subject || it.threadId} (${it.fromMailbox} → ${it.toMailbox || "—"})`)
      .join("\n");
    previewLine = `${preview.totalCount} fil(s) seront traités.\n${sample}${
      preview.items.length > 5 ? "\n…" : ""
    }`;
  } catch {
    /* garde le résumé impact */
  }
  const ok = await openConfirmModal({
    title: "Prévisualiser puis appliquer",
    body: `${previewLine}\n\nAppliquer cette action ?`,
    confirmLabel: "Appliquer",
  });
  if (!ok) return;
  await runOrgV2Apply(accountId, proposal, trashAck, actionOverride, deleteMailboxAck);
}
