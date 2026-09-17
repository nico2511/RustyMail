// @ts-nocheck
/** Shared imports for wireEvents DOM wiring and handleAction dispatchers. */
export { invoke } from "@tauri-apps/api/core";
export { ipcThrottleMs } from "../../ipc_bridge";
export { clearSuggestionShownKeys } from "../../activity";
export {
  accountFieldTouched,
  applyDomainPresetIfSafe,
  serverFieldSelectors,
  serverSidesFromPreset,
} from "../../accountSetup";
export {
  clearAccountOAuthWizard,
  resetNewAccountSetupState,
} from "../../account/accountWizardState";
export {
  clearDiscoveredServerSnap,
  setDiscoveredServersFormSnap,
} from "../../account/discoveredServerSnap";
export { isAtAutocompletePanelOpen } from "../../atAutocomplete";
export { isHashAutocompletePanelOpen } from "../../hashAutocomplete";
export { isAiFeatureEnabled, setAllAiFeatures } from "../../aiFeatures";
export {
  captureAiFeatureTogglesFromDom,
  captureAiPrefsFieldsFromDom,
  persistAiFeaturePrefs,
  syncLlmEnginePrefsToDom,
} from "../../aiPrefsPersist";
export { defaultEnabledSkillIds, type AssistMode, type AssistSkillId } from "../../assistAgent";
export {
  contactsListHasMore,
  getContactDetail,
  getContactsKeywordDraft,
  isContactsListLoading,
  loadContactDetail,
  loadContactProfile,
  loadContactsList,
  setContactsKeywordDraft,
} from "../../contactsView";
export { setLocale, t } from "../../i18n";
export {
  DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY,
  ENABLE_CLEAN_MESSAGE_VIEW,
  LIST_FILTER_VALUES,
} from "../../lib/appUiConstants";
export { safeInvoke, tauriErrorMessage, withTimeout } from "../../lib/tauriCommand";
export {
  isSavedDraftsVirtualMailbox,
  mailboxKind,
  threadMailboxListLabel,
} from "../../mailboxKinds";
export { saveFolderTreeExpanded } from "../../mailboxTree";
export { navCanGoBack } from "../../navigation";
export { orgRetagAccount, orgScanAccount, orgUndoLast } from "../../organizationView";
export { orgV2ScanAccount } from "../../organizationViewV2";
export { normalizeAiPrefsMerged } from "../../prefs_defaults";
export {
  clearThreadsRecentlyRemoved,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";
export {
  applyEngineConnectionMode,
  normalizeSettingsAiModalId,
} from "../../settingsAiPanel";
export { setMailboxLocked } from "../../folderManagerView";
export { composeRewriteStyleFromTone, type Tone } from "../core/composeTone";
export {
  BOOT_INVOKE_TIMEOUT_MS,
  DEFAULT_INVOKE_TIMEOUT_MS,
  MAIL_ACTION_TIMEOUT_MS,
  OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
} from "../core/timeouts";
export { isTauriRuntime } from "../lib/tauriRuntime";
export { toast } from "../lib/toast";
export {
  dismissMailboxDigestPanel,
  enqueueMailboxDigestRefreshWhenIdle,
  mailboxDigestSlotInList,
} from "../mail/mailboxDigest";
export {
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
} from "../mail/idleAiCachePrefetch";
export {
  finishConfirmModal,
  finishTextPromptModal,
  openConfirmModal,
} from "../modals/promptConfirm";
export { currentAccount } from "../core/accountContext";
export { threadIdsMatch } from "../lib/threadIdsMatch";
export { applyListFilter, loadMailView, loadMailboxUnread, loadThreadsForSearchContext } from "../mail/mailListView";
export { render } from "../dispatch";
export { goBack, navigateToInbox, navigateToBreadcrumbIndex } from "../mail/appNavActions";
export { syncInbox } from "../mail/syncInboxAction";
export { mailboxManageAction } from "../mail/mailboxManageAction";
export {
  confirmMoveDialog,
  onThreadMove,
  onThreadMoveTo,
  onThreadSeen,
  onThreadToggleFollow,
  openMoveDialog,
} from "../mail/threadListActions";
export { searchThreads } from "../mail/searchThreadsRun";
export { fetchOpenThreadOrNotify } from "../mail/fetchOpenThread";
export { openThread } from "../mail/openThreadView";
export {
  clearSearchAndReloadInbox,
  commitSearchQuery,
  resetManualSearchNlFilters,
  searchDraftDiffersFromCommitted,
  searchNlAssist,
} from "../mail/searchCommitQuery";
export {
  launchContactMailSearch,
  launchDomainMailSearch,
  launchTagMailSearchFromRawFamily,
} from "../mail/searchLaunchQueries";
export { usesSearchContextLoader } from "../mail/searchQueryContext";
export { isSearchActive } from "../mail/searchQueryContext";
export {
  closeSearchModal,
  openSearchModal,
  syncSearchBarChrome,
} from "../mail/searchBarUi";
export {
  acceptSuggestedSavedView,
  applySavedSearchView,
  deleteSavedSearchView,
  dismissSuggestedSavedView,
  markActiveSavedSearchSeen,
  refreshSuggestedSavedViews,
  saveCurrentSearchView,
} from "../mail/savedSearchViews";
export {
  bulkArchiveSearchViewThreads,
  bulkMarkReadSearchViewThreads,
  runFluxAffinerFromSearchView,
} from "../mail/searchViewBatch";
export { bulkTrashVisibleThreads } from "../mail/bulkTrashList";
export { onEmptyTrashMailbox } from "../mail/emptyTrashMailbox";
export { groupCollapsedQuotesByAttribution } from "../mail/collapsedQuotesGroup";
export { downloadAllAttachmentsForMessage } from "../mail/downloadAllAttachments";
export { loadNewsletterRules } from "../mail/newsletterRulesLoad";
export { threadIsAutoMail } from "../mail/threadAutoMail";
export { sendQuickReply } from "../mail/composeSendQuickReply";
export { draftHasRecipientsExtra } from "../mail/composeDraftRecipients";
export { pickImapMailboxFallback } from "../mail/mailboxImapFallback";
export { switchMailbox } from "../mail/switchMailboxAction";
export {
  clearDraftSession,
  discardCurrentDraftSession,
  finalizeCloseComposeFromUser,
  leaveComposeViewAfterClose,
} from "../mail/composeCloseFlow";
export { removeAttachment, clearAttachments } from "../mail/composeAttachmentsAction";
export { cycleComposeLayout } from "../mail/cycleComposeLayout";
export { cancelLlmQueueJob } from "../mail/llmQueueCancel";
export { sendDraft } from "../mail/composeSendDraftAction";
export {
  computePreview,
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  scheduleDraftRevisionSave,
} from "../mail/composeComposerBridge";
export { refreshDraftRevisions } from "../mail/composeDraftRevisions";
export { computeDraftDiffAgainstRevision } from "../mail/composeDraftRevisionDiff";
export {
  dismissOrphanDraftSession,
  resumeOrphanDraftSession,
} from "../mail/composeOrphanDraftSession";
export { pickAttachments } from "../mail/composePickAttachments";
export {
  confirmAndExecuteSplitSend,
  composeAiGrammar,
  composeAiRewrite,
} from "../mail/composeAiWireActions";
export {
  llmInboxDigestUi,
  llmQaThreadUi,
  llmQuickRepliesThreadUi,
  llmTranslateMessageUi,
  llmTranslateThreadUi,
  summarizeThread,
} from "../mail/threadAiWireActions";
export { loadAccountsFromBackend } from "../mail/accountsLoadAction";
export {
  autoDetectLlamaServerBinary,
  bytesToBase64,
  defaultListFilterFromPrefs,
  deleteSettingsAccount,
  discoverMailServersAction,
  ensureValidSelectedMailbox,
  finalizeSettingsAiModalClose,
  finishOAuthNewAccountAfterLogin,
  mediaBlobToWav16kMonoPcm16,
  micPermissionErrorMessage,
  openEnginesAiSettingsModal,
  openSettingsView,
  paintLlmPrefetchProgressDom,
  paintStatusBarProgressDom,
  persistAiPrefsFromDom,
  persistDefaultAccountId,
  refreshLlmRuntimeStatus,
  refreshSemanticEmbeddingCounts,
  refreshSettingsPathsFromBackend,
  requestMicStream,
  switchActiveAccount,
  syncActivityRecordingPrefs,
  warnOAuthEphemeralRedirect,
} from "../mail/settingsWireActions";
export {
  confirmThenRunOrgApply,
  confirmThenRunOrgV2Apply,
  fmConfirmArchiveMailbox,
  fmConfirmDeleteMailbox,
  fmCreateMailbox,
  fmSelectMailbox,
  fmSyncMailbox,
  openContactsView,
  openFolderManagerView,
  openOrganizationMailbox,
  openOrganizationView,
  orgV2DismissProposal,
  orgV2SnoozeProposal,
  refreshFolderManagerTree,
  refreshOrganizationReport,
  runOrgApply,
  runOrgV2Apply,
} from "../mail/orgFolderWireActions";
export { clearThreadAiSummaryState } from "../mail/threadAiSummaryState";
export { scrollToThreadMessage } from "../mail/threadScrollToMessage";
export { writeSidebarCollapsedPreference } from "../lib/sidebarUiPref";
export {
  normalizeNlRuleInvokeInput,
  readNlButtonRule,
} from "../mail/newsletterRuleInput";
export {
  prepareForward,
  prepareForwardToMessage,
  prepareReply,
  prepareReplyAll,
  prepareReplyToMessage,
} from "../mail/composeThreadReply";
export {
  decodeHtmlEntitiesLoose,
  normalizeMailHrefForOpen,
  openExternalFromMailHref,
} from "../mail/mailLinkOpen";
export { state } from "../state";
import { wireEventsContext } from "./wireEventsContext";
export {
  agentInsertDraftIntoCompose,
  agentPrepareReplyContinue,
  agentPrepareReplyStart,
  enterComposeView,
  llmQuickRepliesComposeUi,
  loadAddressBookSidebarCount,
  micAction,
  openContactDetailView,
  openOrganizationV2View,
  refreshAddressBookList,
  refreshSavedDraftsMailboxCount,
  saveAccount,
  saveDraftToSavedListNow,
  startNewDraftSession,
  stopAgentTelemetry,
  summarizeSenderThreadsLight,
  syncPreviewOpenFromComposeLayout,
} from "./appWireFacades";
export type {
  Draft,
  OAuthDesktopLoginOutcome,
  PromptCatalogItem,
  State,
} from "../../types";

export function setSkipAccountIdentityCaptureOnce(value: boolean): void {
  wireEventsContext().skipAccountIdentityCaptureOnceRef.current = value;
}

export function setAddressBookEditEmail(value: string | null): void {
  wireEventsContext().addressBookEditEmailRef.current = value;
}

export function addressBookRowsCache(): unknown[] {
  return wireEventsContext().addressBookRowsCache();
}
