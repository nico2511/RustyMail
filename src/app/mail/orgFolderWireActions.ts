import {
  fmConfirmArchiveMailbox as fmConfirmArchiveMailboxImpl,
  fmConfirmDeleteMailbox as fmConfirmDeleteMailboxImpl,
  fmCreateMailbox as fmCreateMailboxImpl,
  fmSelectMailbox as fmSelectMailboxImpl,
  fmSyncMailbox as fmSyncMailboxImpl,
  openFolderManagerView as openFolderManagerViewImpl,
  refreshFolderManagerTree as refreshFolderManagerTreeImpl,
} from "./folderManagerActions";
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

export function openContactsView(): Promise<void> {
  return openContactsViewImpl();
}

export function openOrganizationView(): Promise<void> {
  return openOrganizationViewImpl();
}

export function openFolderManagerView(): Promise<void> {
  return openFolderManagerViewImpl();
}

export function refreshFolderManagerTree(): Promise<void> {
  return refreshFolderManagerTreeImpl();
}

export function fmCreateMailbox(parent?: string): Promise<void> {
  return fmCreateMailboxImpl(parent);
}

export function fmSelectMailbox(mailbox: string, opts?: { skipHistory?: boolean }): Promise<void> {
  return fmSelectMailboxImpl(mailbox, opts);
}

export function fmSyncMailbox(mailbox: string): Promise<void> {
  return fmSyncMailboxImpl(mailbox);
}

export function fmConfirmArchiveMailbox(): Promise<void> {
  return fmConfirmArchiveMailboxImpl();
}

export function fmConfirmDeleteMailbox(): Promise<void> {
  return fmConfirmDeleteMailboxImpl();
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
