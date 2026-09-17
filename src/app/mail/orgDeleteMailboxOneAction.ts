import type { OrgProposal } from "../../organizationView";
import { currentAccount } from "../core/accountContext";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { state } from "../state";

export type OrgDeleteMailboxOneDeps = {
  runOrgApply: (
    accountId: string,
    proposalId: string,
    trashAck?: string,
    actionOverride?: import("../../organizationView").OrgActionOverride | null,
    deleteMailboxAck?: string,
    threadIds?: string[] | null,
  ) => Promise<void>;
  runOrgV2Apply: (
    accountId: string,
    proposal: OrgProposal,
    trashAck?: string,
    actionOverride?: import("../../organizationView").OrgActionOverride | null,
    deleteMailboxAck?: string,
    threadIds?: string[] | null,
  ) => Promise<void>;
};

let orgDeleteMailboxOneDeps: OrgDeleteMailboxOneDeps | null = null;

export function registerOrgDeleteMailboxOneDeps(deps: OrgDeleteMailboxOneDeps): void {
  orgDeleteMailboxOneDeps = deps;
}

function deleteOneDeps(): OrgDeleteMailboxOneDeps {
  if (!orgDeleteMailboxOneDeps) throw new Error("registerOrgDeleteMailboxOneDeps not called");
  return orgDeleteMailboxOneDeps;
}

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
  const d = deleteOneDeps();
  const useV2 = Boolean(state.organizationV2.report?.proposals.some((p) => p.id === "empty-mailboxes"));
  if (useV2) {
    await d.runOrgV2Apply(acc.id, proposal, undefined, undefined, "delete-mailbox", [refId]);
    return;
  }
  await d.runOrgApply(acc.id, "empty-mailboxes", undefined, undefined, "delete-mailbox", [refId]);
}
