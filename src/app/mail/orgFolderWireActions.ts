import type { OrgProposal } from "../../organizationView";
import type { OrgActionOverride } from "../../organizationView";

export type OrgFolderWireActionsDeps = {
  openContactsView: () => void | Promise<void>;
  openOrganizationView: () => void | Promise<void>;
  openFolderManagerView: () => void | Promise<void>;
  refreshFolderManagerTree: () => void | Promise<void>;
  fmCreateMailbox: (parent?: string) => void | Promise<void>;
  fmSelectMailbox: (mailbox: string) => void | Promise<void>;
  fmSyncMailbox: (mailbox: string) => void | Promise<void>;
  fmConfirmArchiveMailbox: () => void | Promise<void>;
  fmConfirmDeleteMailbox: () => void | Promise<void>;
  openOrganizationMailbox: (mailbox: string) => void | Promise<void>;
  orgV2DismissProposal: (proposalId: string) => void | Promise<void>;
  orgV2SnoozeProposal: (proposalId: string) => void | Promise<void>;
  confirmThenRunOrgV2Apply: (accountId: string, proposalId: string) => void | Promise<void>;
  runOrgV2Apply: (
    accountId: string,
    proposal: OrgProposal,
    trashAck?: string,
    actionOverride?: OrgActionOverride | null,
    deleteMailboxAck?: string,
  ) => void | Promise<void>;
  confirmThenRunOrgApply: (
    accountId: string,
    proposalId: string,
    trashAck?: string,
    actionOverride?: OrgActionOverride | null,
  ) => void | Promise<void>;
  runOrgApply: (
    accountId: string,
    proposalId: string,
    trashAck?: string,
    actionOverride?: OrgActionOverride | null,
    deleteMailboxAck?: string,
  ) => void | Promise<void>;
  refreshOrganizationReport: () => Promise<void>;
};

let orgFolderWireActionsDeps: OrgFolderWireActionsDeps | null = null;

export function registerOrgFolderWireActionsDeps(deps: OrgFolderWireActionsDeps): void {
  orgFolderWireActionsDeps = deps;
}

function orgFolder(): OrgFolderWireActionsDeps {
  if (!orgFolderWireActionsDeps) throw new Error("registerOrgFolderWireActionsDeps not called");
  return orgFolderWireActionsDeps;
}

export function openContactsView(): void | Promise<void> {
  return orgFolder().openContactsView();
}

export function openOrganizationView(): void | Promise<void> {
  return orgFolder().openOrganizationView();
}

export function openFolderManagerView(): void | Promise<void> {
  return orgFolder().openFolderManagerView();
}

export function refreshFolderManagerTree(): void | Promise<void> {
  return orgFolder().refreshFolderManagerTree();
}

export function fmCreateMailbox(parent?: string): void | Promise<void> {
  return orgFolder().fmCreateMailbox(parent);
}

export function fmSelectMailbox(mailbox: string): void | Promise<void> {
  return orgFolder().fmSelectMailbox(mailbox);
}

export function fmSyncMailbox(mailbox: string): void | Promise<void> {
  return orgFolder().fmSyncMailbox(mailbox);
}

export function fmConfirmArchiveMailbox(): void | Promise<void> {
  return orgFolder().fmConfirmArchiveMailbox();
}

export function fmConfirmDeleteMailbox(): void | Promise<void> {
  return orgFolder().fmConfirmDeleteMailbox();
}

export function openOrganizationMailbox(mailbox: string): void | Promise<void> {
  return orgFolder().openOrganizationMailbox(mailbox);
}

export function orgV2DismissProposal(proposalId: string): void | Promise<void> {
  return orgFolder().orgV2DismissProposal(proposalId);
}

export function orgV2SnoozeProposal(proposalId: string): void | Promise<void> {
  return orgFolder().orgV2SnoozeProposal(proposalId);
}

export function confirmThenRunOrgV2Apply(accountId: string, proposalId: string): void | Promise<void> {
  return orgFolder().confirmThenRunOrgV2Apply(accountId, proposalId);
}

export function runOrgV2Apply(
  accountId: string,
  proposal: OrgProposal,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
  deleteMailboxAck?: string,
): void | Promise<void> {
  return orgFolder().runOrgV2Apply(accountId, proposal, trashAck, actionOverride, deleteMailboxAck);
}

export function confirmThenRunOrgApply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
): void | Promise<void> {
  return orgFolder().confirmThenRunOrgApply(accountId, proposalId, trashAck, actionOverride);
}

export function runOrgApply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
  deleteMailboxAck?: string,
): void | Promise<void> {
  return orgFolder().runOrgApply(accountId, proposalId, trashAck, actionOverride, deleteMailboxAck);
}

export function refreshOrganizationReport(): Promise<void> {
  return orgFolder().refreshOrganizationReport();
}
