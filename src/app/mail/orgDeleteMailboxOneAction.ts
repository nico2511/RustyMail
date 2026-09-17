import type { OrgProposal } from "../../organizationView";
import { currentAccount } from "../core/accountContext";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { state } from "../state";
import { runOrgApply } from "./orgApplyRun";
import { runOrgV2Apply } from "./orgV2ApplyRun";

function findEmptyMailboxesProposal(): OrgProposal | undefined {
  return (
    state.organizationV2.report?.proposals.find((p) => p.id === "empty-mailboxes") ??
    state.organization.report?.proposals.find((p) => p.id === "empty-mailboxes")
  );
}

export async function onOrgDeleteMailboxOne(mailbox: string, mailboxRefId: string): Promise<void> {
  const mb = mailbox.trim();
  const refId = mailboxRefId.trim();
  if (!mb || !refId) return;
  const ok = await openConfirmModal({
    title: "Supprimer ce dossier vide ?",
    body: `Le dossier « ${mb} » sera supprimé côté serveur IMAP s’il est vide. Action irréversible.`,
    danger: true,
    confirmLabel: "Supprimer le dossier",
  });
  if (!ok) return;
  const acc = currentAccount();
  if (!acc?.id) return;
  const proposal = findEmptyMailboxesProposal();
  if (!proposal) {
    toast("Proposition introuvable — relancez l’analyse.");
    return;
  }
  const useV2 = Boolean(state.organizationV2.report?.proposals.some((p) => p.id === "empty-mailboxes"));
  if (useV2) {
    await runOrgV2Apply(acc.id, proposal, undefined, undefined, "delete-mailbox", [refId]);
    return;
  }
  await runOrgApply(acc.id, "empty-mailboxes", undefined, undefined, "delete-mailbox", [refId]);
}
