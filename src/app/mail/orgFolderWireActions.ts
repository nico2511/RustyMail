import type { OrgProposal } from "../../organizationView";
import type { OrgActionOverride } from "../../organizationView";
import { openContactsView as openContactsViewImpl } from "./contactsViewNavigation";
import { openOrganizationMailbox as openOrganizationMailboxImpl } from "./orgOpenOrganizationMailbox";
import { onOrgDeleteMailboxOne as onOrgDeleteMailboxOneImpl } from "./orgDeleteMailboxOneAction";
import { onOrgSyncMailbox as onOrgSyncMailboxImpl } from "./orgRowSyncMailbox";
import {
  openOrganizationV2View as openOrganizationV2ViewImpl,
  openOrganizationView as openOrganizationViewImpl,
} from "./orgOrganizationOpenViews";
import { refreshOrganizationReport as refreshOrganizationReportImpl } from "./orgOrganizationReportRefresh";
import {
  confirmThenRunOrgApply as confirmThenRunOrgApplyImpl,
  runOrgApply as runOrgApplyImpl,
} from "./orgApplyRun";
import {
  confirmThenRunOrgV2Apply as confirmThenRunOrgV2ApplyImpl,
  runOrgV2Apply as runOrgV2ApplyImpl,
} from "./orgV2ApplyRun";
import {
  onOrgV2IgnoreMailboxUi as onOrgV2IgnoreMailboxUiImpl,
  onOrgV2UnignoreMailboxUi as onOrgV2UnignoreMailboxUiImpl,
  orgV2DismissProposal as orgV2DismissProposalImpl,
  orgV2SnoozeProposal as orgV2SnoozeProposalImpl,
} from "./orgV2ProposalUi";

export type OrgFolderWireActionsDeps = {
  openFolderManagerView: () => void | Promise<void>;
  refreshFolderManagerTree: () => void | Promise<void>;
  fmCreateMailbox: (parent?: string) => void | Promise<void>;
  fmSelectMailbox: (mailbox: string) => void | Promise<void>;
  fmSyncMailbox: (mailbox: string) => void | Promise<void>;
  fmConfirmArchiveMailbox: () => void | Promise<void>;
  fmConfirmDeleteMailbox: () => void | Promise<void>;
};

let orgFolderWireActionsDeps: OrgFolderWireActionsDeps | null = null;

export function registerOrgFolderWireActionsDeps(deps: OrgFolderWireActionsDeps): void {
  orgFolderWireActionsDeps = deps;
}

function orgFolder(): OrgFolderWireActionsDeps {
  if (!orgFolderWireActionsDeps) throw new Error("registerOrgFolderWireActionsDeps not called");
  return orgFolderWireActionsDeps;
}

export function openContactsView(): Promise<void> {
  return openContactsViewImpl();
}

export function openOrganizationView(): Promise<void> {
  return openOrganizationViewImpl();
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

export function openOrganizationMailbox(mailbox: string): Promise<void> {
  return openOrganizationMailboxImpl(mailbox);
}

export function orgV2DismissProposal(proposalId: string): Promise<void> {
  return orgV2DismissProposalImpl(proposalId);
}

export function orgV2SnoozeProposal(proposalId: string): Promise<void> {
  return orgV2SnoozeProposalImpl(proposalId);
}

export function confirmThenRunOrgV2Apply(accountId: string, proposalId: string): Promise<void> {
  return confirmThenRunOrgV2ApplyImpl(accountId, proposalId);
}

export function runOrgV2Apply(
  accountId: string,
  proposal: OrgProposal,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  return runOrgV2ApplyImpl(accountId, proposal, trashAck, actionOverride, deleteMailboxAck, threadIds);
}

export function confirmThenRunOrgApply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
): Promise<void> {
  return confirmThenRunOrgApplyImpl(accountId, proposalId, trashAck, actionOverride);
}

export function runOrgApply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  return runOrgApplyImpl(accountId, proposalId, trashAck, actionOverride, deleteMailboxAck, threadIds);
}

export function refreshOrganizationReport(): Promise<void> {
  return refreshOrganizationReportImpl();
}

export function openOrganizationV2View(): Promise<void> {
  return openOrganizationV2ViewImpl();
}

export function onOrgDeleteMailboxOne(mailbox: string, mailboxRefId: string): Promise<void> {
  return onOrgDeleteMailboxOneImpl(mailbox, mailboxRefId);
}

export function onOrgSyncMailbox(mailbox: string): Promise<void> {
  return onOrgSyncMailboxImpl(mailbox);
}

export function onOrgV2IgnoreMailboxUi(mailbox: string): Promise<void> {
  return onOrgV2IgnoreMailboxUiImpl(mailbox);
}

export function onOrgV2UnignoreMailboxUi(mailbox: string): Promise<void> {
  return onOrgV2UnignoreMailboxUiImpl(mailbox);
}
