/** Facade wire org / dossiers — ré-exporte les modules ciblés. */
export {
  openContactsView,
  openOrganizationMailbox,
  openOrganizationV2View,
  openOrganizationView,
  refreshOrganizationReport,
} from "./orgFolderWireFacadeViewsRun";
export {
  fmConfirmArchiveMailbox,
  fmConfirmDeleteMailbox,
  fmCreateMailbox,
  fmSelectMailbox,
  fmSyncMailbox,
  openFolderManagerView,
  refreshFolderManagerTree,
} from "./orgFolderWireFacadeFolderManagerRun";
export {
  confirmThenRunOrgApply,
  confirmThenRunOrgV2Apply,
  onOrgDeleteMailboxOne,
  onOrgSyncMailbox,
  onOrgV2IgnoreMailboxUi,
  onOrgV2UnignoreMailboxUi,
  orgV2DismissProposal,
  orgV2SnoozeProposal,
  runOrgApply,
  runOrgV2Apply,
} from "./orgFolderWireFacadeApplyRun";
export type { OrgActionOverride, OrgProposal } from "./orgFolderWireFacadeApplyRun";
