import { invoke } from "@tauri-apps/api/core";

import { listen, TauriEvent } from "@tauri-apps/api/event";

import { getCurrentWebview } from "@tauri-apps/api/webview";

import { ipcThrottleMs, invokeAiCacheGet } from "../ipc_bridge";

import {
  clearThreadsRecentlyRemoved,
  filterRecentlyRemovedThreads,
  markThreadsRecentlyRemoved,
} from "../recentlyRemovedThreads";

import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
  SAVED_DRAFT_THREAD_PREFIX,
  UNIFIED_INBOX_MAILBOX,
  isSavedDraftsVirtualMailbox,
  isUnifiedInboxMailbox,
  isVirtualMailbox,
  mailboxKind,
  mailboxKindIcon,
  mailboxKindLabelFr,
  mailboxesAllowedForMove,
  pickSystemMailboxes,
  preferredInboxMailboxName,
  savedDraftIdFromThreadId,
  threadMailboxColumnTitle,
  threadMailboxListLabel,
} from "../mailboxKinds";

import {
  notifyImapWatchFocusedMailbox,
  refreshUiAfterImapPush,
  syncInbox,
} from "./mail/syncInboxRun";

import {
  formatFriendlyThreadListDate,
  parseThreadListActivityDate,
  savedDraftDatesColumnSnippet,
  threadListActivityTooltip,
} from "../threadListDates";

import type { AppPrefs, AppPrefsAi } from "../prefs_defaults";

import {
  WHISPER_PTT_KEY_CODES,
  defaultAppPrefs,
  normalizeAiPrefsMerged,
} from "../prefs_defaults";

import { getUiLocale, localeTag, setLocale, t } from "../i18n";

import type { PromptCatalogItem } from "../promptsSettingsPanel";

import { maybeShowFirstRunWizard } from "../setupWizard";

import { toast } from "./lib/toast";

import { formatTime } from "./lib/domForm";

import { formatPlainTextWithLinks, linkifyPlainSegment, trimUrlTrailingPunct } from "./lib/textFormat";

import { initials, formatTag, isNoisyTag } from "./lib/tags";

import { iconSvg } from "./lib/iconSvg";

import {
  openTextPromptModal,
  finishTextPromptModal,
  renderTextPromptModal,
  openConfirmModal,
  finishConfirmModal,
  renderConfirmModal,
  isTextPromptOpen,
  isConfirmOpen,
} from "./modals/promptConfirm";

import { utf8StringToBase64, mailHtmlMountAttrs } from "./lib/htmlMessage";

import { composeRewriteStyleFromTone, toneLabelsFr, tones } from "./core/composeTone";
import {
  DEFAULT_INVOKE_TIMEOUT_MS,
  BOOT_INVOKE_TIMEOUT_MS,
  ACCOUNTS_BOOT_TIMEOUT_MS,
  ACCOUNT_INVOKE_TIMEOUT_MS,
  OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
  SYNC_INVOKE_TIMEOUT_MS,
  MAIL_ACTION_TIMEOUT_MS,
  LLM_INVOKE_TIMEOUT_MS,
  AI_CACHE_PROMPT_REVISION,
} from "./core/timeouts";
import { isTauriRuntime } from "./lib/tauriRuntime";
import { safeInvoke, tauriErrorMessage, withTimeout } from "./lib/tauriCommand";
import {
  ENABLE_CLEAN_MESSAGE_VIEW,
  LIST_FILTER_VALUES,
} from "./lib/appUiConstants";
import { currentAccount } from "./core/accountContext";
import { threadIdsMatch } from "./lib/threadIdsMatch";
import { canonicalEmailForNlMatch } from "./mail/searchAccountResolve";
import {
  folderManagerPanelMailbox,
  listMailboxForPanel,
  listThreadsPayload,
} from "./mail/mailboxPanelContext";
import {
  applyListFilter,
  loadMailView,
  loadMailboxUnread,
  loadThreadsForSearchContext,
  registerMailListDeps,
  reloadCurrentThreadList,
} from "./mail/mailListView";
import { fetchOpenThreadOrNotify } from "./mail/fetchOpenThread";
import { openThread, registerOpenThreadDeps } from "./mail/openThreadView";
import {
  applyParsedSearchBarToState,
  applyParsedSearchBarToStructural,
  applySearchBarQuery,
  applySearchQueryFromNl,
  draftSearchCriteriaSnapshot,
  hasSearchBarCriteria,
  mergeSearchBarTag,
  registerSearchCommitDeps,
  resetManualSearchNlFilters,
  resetSearchStructuralModifiers,
  searchDraftDiffersFromCommitted,
  searchNlAssist,
  toastSearchBarResult,
} from "./mail/searchCommitQuery";
import {
  buildSearchQueryFromCurrentState,
  committedSearchCriteriaSnapshot,
  effectiveSearchMailboxPath,
  isSearchActive,
  searchAccountIdForQuery,
  searchMailboxForQuery,
  searchQueryMailboxForList,
  searchQueryUsesThreadsApi,
  usesSearchContextLoader,
  folderManagerBrowsingPanel,
} from "./mail/searchQueryContext";
import {
  launchContactMailSearch,
  launchDomainMailSearch,
  launchTagMailSearch,
  registerSearchLaunchDeps,
} from "./mail/searchLaunchQueries";
import {
  closeSearchModal,
  openSearchModal,
  registerSearchBarUiDeps,
  syncSearchBarChrome,
} from "./mail/searchBarUi";
import {
  applySavedSearchView,
  acceptSuggestedSavedView,
  deleteSavedSearchView,
  dismissSuggestedSavedView,
  markActiveSavedSearchSeen,
  refreshSavedSearches,
  refreshSuggestedSavedViews,
  saveCurrentSearchView,
} from "./mail/savedSearchViews";
import {
  bulkArchiveSearchViewThreads,
  bulkMarkReadSearchViewThreads,
  registerSearchViewBatchDeps,
  runFluxAffinerFromSearchView,
} from "./mail/searchViewBatch";
import {
  bulkTrashVisibleThreads,
  registerBulkTrashListDeps,
} from "./mail/bulkTrashList";
import {
  confirmMoveDialog,
  onThreadMove,
  onThreadMoveTo,
  onThreadSeen,
  onThreadToggleFollow,
  openMoveDialog,
  registerThreadListActionsDeps,
  sourceMailboxForThread,
} from "./mail/threadListActions";
import {
  mailboxManageAction,
  registerMailboxManageActionDeps,
} from "./mail/mailboxManageAction";
import {
  registerEmptyTrashMailboxDeps,
} from "./mail/emptyTrashMailbox";
import {
  currentThreadIdForReply,
  registerComposeThreadReplyDeps,
} from "./mail/composeThreadReply";
import { loadNewsletterRules } from "./mail/newsletterRulesLoad";
import { threadIsAutoMail } from "./mail/threadAutoMail";
import { clearThreadAiSummaryState } from "./mail/threadAiSummaryState";
import { threadMessageAnchorId } from "./mail/threadMessageAnchor";
import { registerThreadScrollToMessageDeps } from "./mail/threadScrollToMessage";
import { writeSidebarCollapsedPreference } from "./lib/sidebarUiPref";
import { draftHasRecipientsExtra } from "./mail/composeDraftRecipients";
import { registerSwitchMailboxRunDeps } from "./mail/switchMailboxAction";
import { loadAddressBookSidebarCount } from "./mail/loadAddressBookSidebarCount";
import { openContactDetailView } from "./mail/addressBookWireActions";
import {
  extractUnsubscribeLinksFromHtml,
  messageHtmlForDisplay,
  sanitizeEmailHtml,
} from "./mail/mailEmailHtmlSanitize";
import {
  sortMessagesByReceivedDescending,
  parseMaybeDate,
  dayKey,
  formatThreadReadingWhen,
  receivedAtIsoDatetime,
} from "./mail/threadMessageSort";
import {
  activeSecurityLlmAugmentCount,
  isSecurityLlmAugmentPending,
  mailSecurityFindingsForDisplay,
  mailSecurityTierClass,
  normalizedMailSecurity,
  scheduleSecurityLlmAugment,
} from "./mail/mailSecurityDisplay";
import { langFromKindTags, shouldOfferPerMessageTranslate, shouldOfferThreadTranslate } from "./mail/threadLangGuess";
import { normalizeIso639Primary } from "./mail/threadLangGuessSamples";
import {
  effectiveMessageViewMode,
  isOwnSender,
  normalizeThreadSenderLabel,
  repairSummaryResultStrings,
  repairUtf8Mojibake,
  senderAccentVars,
  summaryResultToZenText,
  threadParticipantFirstMessageIds,
  threadParticipantsWithEmails,
  threadQuickReplyTargetName,
  threadRecipientPresenceEventsByMessageId,
  threadSuppressAutoEnvelopeMeta,
  threadTreeLaneRight,
  zenSummaryHtmlFragments,
} from "./mail/threadViewUiHelpers";
import { composeKindTitle, formatDraftRevisionStamp } from "./mail/composeFormLabels";
import {
  buildSettingsAiPanelDeps,
  mergedProfileForAccountsForm,
  settingsDraftProfile,
} from "./mail/settingsRenderHelpers";
import {
  captureAccountsFormIdentityFromDom,
  getAccountsFormIdentityScratch,
} from "./mail/settingsAccountsFormState";
import {
  agentOfferSlotsStep,
  agentSkillEnabled,
  agentStepProgressLabel,
  applyThreadAiOutputIfLive,
  paintAgentDraftDom,
  paintThreadAiSummaryDom,
  paintThreadQaStreamDom,
  threadAiSummaryForCurrentThread,
  threadAiSummaryScoped,
  threadAiSummaryShownInZen,
} from "./mail/threadAiStreamDom";
import { attachmentPathsJoinedForHiddenField } from "./mail/composeAttachmentPaths";
import {
  clearDraftSession,
  discardCurrentDraftSession,
  finalizeCloseComposeFromUser,
  leaveComposeViewAfterClose,
  registerComposeCloseFlowDeps,
} from "./mail/composeCloseFlow";
import {
  clearAttachments,
  registerComposeAttachmentsActionDeps,
  removeAttachment,
} from "./mail/composeAttachmentsAction";
import { cancelLlmQueueJob, registerLlmQueueCancelDeps } from "./mail/llmQueueCancel";
import { cycleComposeLayout, registerCycleComposeLayoutDeps } from "./mail/cycleComposeLayout";
import { enterComposeView } from "./mail/composeViewWireActions";
import { registerComposeSendDraftRunDeps } from "./mail/composeSendDraftRun";
import { refreshDraftRevisions } from "./mail/composeDraftRevisions";
import {
  computeDraftDiffAgainstRevision,
  registerComposeDraftRevisionDiffDeps,
} from "./mail/composeDraftRevisionDiff";
import {
  dismissOrphanDraftSession,
  resumeOrphanDraftSession,
} from "./mail/composeOrphanDraftSession";
import { pickAttachments, registerComposePickAttachmentsDeps } from "./mail/composePickAttachments";
import {
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  computePreview,
  schedulePreviewUpdate,
  scheduleDraftRevisionSave,
} from "./mail/composeComposerBridge";
import {
  clearDraftRevisionDebounceTimer,
  flushDraftRevisionPending as flushDraftRevisionPendingNow,
  registerComposeDraftRevisionAutosaveDeps,
} from "./mail/composeDraftRevisionAutosave";
import { persistDraft } from "./mail/composePersistDraft";
import { composeChipsHandle } from "./mail/composeRecipientChipsWire";
import {
  checkOrphanDraftSessionsOnBoot,
  registerComposeDraftLocalSaveDeps,
  saveDraftRevisionNow,
} from "./mail/composeDraftLocalSave";
import { composeDraftHasMeaningfulContent, startNewDraftSession } from "./mail/composeDraftSession";
import { syncPreviewOpenFromComposeLayout } from "./mail/composeLayoutState";
import { registerComposeDraftPreviewDeps } from "./mail/composeDraftPreview";
import { threadsVisibleInList, threadListFollowed } from "./mail/mailListThreadFilter";
import {
  applyDefaultAccountFromPrefs,
  defaultListFilterFromPrefs,
  ensureValidSelectedMailbox,
} from "./mail/accountDefaultPrefs";
import { aiCacheKeySegment } from "./mail/aiCacheKeySegment";
import {
  fmSelectMailbox,
  refreshFolderManagerTree,
} from "./mail/orgFolderWireActions";
import { abortLlmQueueJob, withLlmQueue } from "./mail/llmJobQueue";
import { navMailboxSegment, navCurrentBreadcrumbSegment } from "./mail/navBreadcrumbSegments";
import { exitSearchModeForMailboxBrowse } from "./mail/searchMailboxBrowseExit";
import { paintLlmPrefetchProgressDom } from "./mail/llmPrefetchProgressDom";
import { paintStatusBarProgressDom } from "./mail/statusBarProgressJobs";
import { registerSwitchActiveAccountDeps } from "./mail/switchActiveAccountAction";
import {
  beginNavigation,
  captureCurrentNav,
  goBack,
  goForward,
  navigateToBreadcrumbIndex,
  navigateToInbox,
  registerAppNavigationStackDeps,
} from "./mail/appNavigationStack";
import { loadAccountsFromBackend } from "./mail/accountsLoadFromBackend";
import {
  mailboxPathPrefixForCreate,
} from "./mail/folderManagerPanelState";
import { orgApplyStatusMessage } from "./mail/orgApplyStatusMessage";
import { aiSidePanelExpandedForShell, threadReadingIsSimpleLayout } from "./mail/threadShellLayout";
import { bindTauriNativeFileDropAsync } from "./mail/composeTauriNativeFileDrop";
import { refreshLlmRuntimeStatus } from "./mail/settingsLlmRuntime";
import { activeMessageTranslationJobCount } from "./mail/threadStatusJobCounts";
import { refreshSavedDraftsMailboxCount } from "./mail/savedDraftsMailboxCountRefresh";
import { bindMicPushToTalk } from "./mail/composeMicDictation";
import { formatWhisperPttKeyLabel } from "./mail/composeMicPtt";
import {
  composeMicButtonTitle,
  micAriaLabel,
  threadQaMicButtonTitle,
} from "./mail/composeMicUiHints";
import {
  hydrateMessageTranslationsFromCacheForThread,
  isSenderBatchSummarizeActive,
  summarizeThread,
  summarizeThreadCore,
  translateThreadCore,
} from "./mail/threadAiRun";
import { registerSettingsWireActionsDeps, finalizeSettingsAiModalClose } from "./mail/settingsWireActions";
import { registerFolderManagerRunDeps } from "./mail/folderManagerActions";
import { wireFolderManagerDnD } from "./mail/folderManagerDnD";
import { registerOrgApplyRunDeps } from "./mail/orgApplyRun";
import { registerOrgV2ApplyRunDeps } from "./mail/orgV2ApplyRun";
import { refreshMailboxesAfterImapChange } from "./mail/orgRefreshMailboxesAfterImap";
import {
  getAddressBookListQuery,
  getAddressBookRowsCache,
} from "./mail/addressBookListState";
import { stopAgentTelemetry } from "./mail/agentWireActions";
import {
  flushThreadActivityClosed,
  syncActivityRecordingPrefs,
} from "./mail/threadActivityTracking";
import {
  getAddressBookEditEmail,
  registerAppShellWireContext,
} from "./mail/appShellRender";
import { openSavedDraftById } from "./mail/savedDraftOpenRun";
import { searchThreads } from "./mail/searchThreadsRun";
import {
  refreshSearchTagCatalog,
} from "./mail/searchTagCatalog";
import {
  activeSavedSearchItem,
  canSaveSearchView,
  canSaveSearchViewInModal,
  inboxSearchContextActive,
  registerSearchViewContextDeps,
  searchViewCanAffinerFlux,
  searchViewCanOpenOrganizer,
} from "./mail/searchViewContext";
import {
  registerSearchAtAutocompleteWireDeps,
} from "./mail/searchAtAutocompleteWire";
import { renderBriefMailViewShell } from "./ui/briefMailShell";
import {
  cancelMailboxDigestLiveDebounce,
  dismissMailboxDigestPanel,
  enqueueMailboxDigestRefreshWhenIdle,
  fetchMailboxDigestRefresh,
  initMailboxDigest,
  mailboxDigestPanelEligible,
  mailboxDigestSlotInList,
  openMailboxDigestPanel,
  resetMailboxDigestForNavigation,
  scheduleMailboxDigestRefresh,
  syncMailboxDigestPanelWithFeaturePref,
  buildMailboxBriefGateBannerHtml,
  isMailboxDigestFeatureEnabled,
} from "./mail/mailboxDigest";
import {
  abortIdleAiCachePrefetchInFlight,
  initIdleAiCachePrefetch,
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
} from "./mail/idleAiCachePrefetch";
import { formatNewsletterRuleInput } from "./lib/newsletterRuleFormat";
import { formatAttachmentSizeKb } from "./lib/attachmentSize";
import { settingsExplainHtml } from "./lib/settingsExplainHtml";
import { tagToSearchDraft, threadTagsForModal } from "./lib/threadTagsModal";
import { registerRenderDeps } from "./ui/render/renderDeps";
import {
  renderFolderSidebarCountPill,
  renderViewNavTrail,
} from "./ui/render/listChrome";
import { renderList } from "./ui/render/listRender";
import {
  renderThread,
  renderThreadNlRuleButton,
  renderThreadParticipantLink,
} from "./ui/render/threadViewRender";
import { renderComposer } from "./ui/render/composerRender";
import { renderOrgThreadSampleRow } from "./ui/render/orgSampleRowRender";
import { registerWireEventsContext } from "./ui/wireEventsBridge";
import { wireEvents } from "./ui/wireEvents";
import { renderAiPanel } from "./ui/render/aiPanelRender";
import { renderSettings, renderSettingsAiModal } from "./ui/render/settingsRender";
import { renderMain } from "./ui/render/mainViewRender";
import { renderSidebar } from "./ui/render/sidebarRender";
import { renderAiQuickPanelOverlay } from "./ui/render/aiQuickPanelRender";
import {
  renderGlobalStatusFooter,
} from "./ui/render/statusFooterRender";
import { renderActionBriefHtml } from "./ui/render/actionBriefHtml";
import {
  renderSearchModal,
} from "./ui/render/searchRender";
import {
  renderThreadTagsDialog,
} from "./ui/render/threadTagsRender";
import {
  renderCloseComposeDialog,
  renderImageDialog,
  renderMailboxManageDialog,
  renderMoveDialog,
  renderQuoteFoldDialog,
  renderResumeDraftDialog,
  renderSplitSendDialog,
} from "./ui/render/modalsRender";
import "../styles.css";

import { escapeAttr, escapeHtml } from "../ui/sanitize";

import {
  renderStatusBarProgressInlineHtml,
  type StatusBarProgressJob,
} from "../statusBarProgress";

import { parseSearchBarDraft } from "../searchBarParse";

import {
  extractNlSearchFallbackText,
  hasCommittedSearchCriteria,
  hasSavableSearchCriteria,
  resetSearchStructuralState,
  searchCriteriaSnapshotsEqual,
  snapshotFromStructuralState,
  type SearchCriteriaSnapshot,
  type SearchStructuralState,
} from "../searchQueryState";

import { recordSearchHistory } from "../searchHistory";

import type { SavedSearchListItem } from "../savedSearches";

import {
  clearSuggestionShownKeys,
  flushActivityQueue,
  recordActivity,
  type SuggestedSavedView,
} from "../activity";

import {
  type AiFeatureKey,
  isAiFeatureEnabled,
  setAllAiFeatures,
} from "../aiFeatures";

import {
  applyEngineConnectionMode,
  isSettingsAiModalId,
  normalizeSettingsAiModalId,
  type SettingsAiModalId,
  type SettingsAiPanelDeps,
} from "../settingsAiPanel";

import { captureAiPrefsFieldsFromDom, syncLlmEnginePrefsToDom, captureAiFeatureTogglesFromDom, persistAiFeaturePrefs } from "../aiPrefsPersist";

import { cancelActiveLlmStreamJob, extractPartialJsonStringField, isLlmCancelledError, runLlmStreamJob } from "../llmStream";

import {
  clearContactProfile,
  getContactDetail,
  getContactsKeywordDraft,
  getContactsListQuery,
  loadContactDetail,
  loadContactProfile,
  contactsListHasMore,
  isContactsListLoading,
  loadContactsList,
  renderContactDetailPage,
  renderContactsListPage,
  setContactsKeywordDraft,
  setContactsListQuery,
} from "../contactsView";

import {
  navApplyPendingScrollRestore,
  navJumpToStackIndex,
  navRenderTrailHtml,
  navCanGoBack,
  navCanGoForward,
  navClearForward,
  navPop,
  navPopForward,
  navPush,
  navPushBackEntry,
  navPushForward,
  navQueueScrollRestore,
  navReset,
  readContactsScrollY,
  readListScrollY,
  type AppView,
  type NavSnapshot,
  type NavSettingsTab,
} from "../navigation";

import {
  defaultOrganizationState,
  optimisticOrgRemoveThreads,
  optimisticPatchOrgReport,
  orgApplyProposal,
  orgPreviewProposal,
  orgRetagAccount,
  orgScanAccount,
  orgUndoLast,
  formatOrgApplyImpact,
  renderOrganizationView,
  type OrgProposal,
  type OrgThreadRef,
  type OrganizationViewState,
} from "../organizationView";

import {
  ORG_V2_APPLY_CHUNK_SIZE,
  chunkStringIds,
  collectOrgProposalApplyIds,
  defaultOrganizationV2State,
  mergeOrgApplyProgress,
  optimisticOrgV2PatchAfterApply,
  optimisticOrgV2RemoveProposal,
  orgV2IgnoreMailbox,
  orgV2ProposalBatchCleared,
  orgV2RecordDecision,
  orgV2ScanAccount,
  orgV2UnignoreMailbox,
  renderOrganizationV2View,
  type OrganizationV2ViewState,
} from "../organizationViewV2";

import type { OrgApplyProgress } from "../organizationView";

import {
  archiveMailboxThreads,
  defaultFolderManagerState,
  deleteMailboxWithContents,
  fetchMailboxTree,
  renderFolderManagerView,
  setMailboxLocked,
  type FolderManagerViewState,
} from "../folderManagerView";

import {
  splitMailboxSegments,
} from "../mailboxTree";

import { state } from "./state";

import { registerRender } from "./dispatch";

import type { View, Tone, Tag, Entity, ThreadListItem, Draft, DraftPreview, DraftRevisionListItem, DraftDiffLine, DraftCompareView, MessageViewMode, ComposeLayout, MicState, MailSecuritySignals, CleanedMessageView, DiscussionThreadView, AppStatus, AppPathsView, AppCapabilities, LlmRuntimeStatus, NewsletterRuleRow, InboxFilterCounts, ActionBriefResult, CloseComposeModal, ResumeDraftModal, OrphanDraftSessionItem, State, SearchViewBatchJob, MailboxFolderStatsRow, SavedDraftListItem, SemanticEmbeddingCountsSnapshot, FluxAffinerResult, MailUnsubscribeLink, InlineAttachPayload, ThreadParticipantLink, ThreadRecipientPresenceEvents, TextPromptModalSpec, ConfirmModalSpec, NavigateOpts, OAuthDesktopLoginOutcome, SummaryResult, ActionBriefEvidenceLink, AddressBookRow, ShortcutRow, SavedDraftOpenPayload, LlmTranslationResult } from "./types";


let autoThreadSummaryDoneFor: string | null = null;

async function flushDraftRevisionPending(): Promise<void> {
  await flushDraftRevisionPendingNow(
    () => state.view === "compose" && Boolean(state.draft && state.draftSessionId),
  );
}

let persistAiPrefsDebounce: ReturnType<typeof setTimeout> | undefined;

registerAppShellWireContext(getAddressBookRowsCache);

registerRenderDeps({
  navCurrentBreadcrumbSegment,
  normalizeThreadSenderLabel,
  formatThreadReadingWhen,
  sortMessagesByReceivedDescending,
  effectiveSearchMailboxPath,
  inboxSearchContextActive,
  canSaveSearchView,
  canSaveSearchViewInModal,
  searchDraftDiffersFromCommitted,
  activeSavedSearchItem,
  searchViewCanOpenOrganizer,
  searchViewCanAffinerFlux,
  sourceMailboxForThread,
  currentAccount,
  activeMessageTranslationJobCount,
  activeSecurityLlmAugmentCount,
  renderThread,
  renderComposer,
  renderSettings,
  renderContactsListPage,
  renderContactDetailPage,
  renderOrganizationPage: () =>
    renderOrganizationView(state.organization, {
      escapeHtml,
      escapeAttr,
      iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
      renderThreadSample: renderOrgThreadSampleRow,
      mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
    }),
  renderOrganizationV2Page: () =>
    renderOrganizationV2View(state.organizationV2, {
      escapeHtml,
      escapeAttr,
      iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
      renderThreadSample: renderOrgThreadSampleRow,
      mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
    }),
  renderFolderManagerPage: () =>
    renderFolderManagerView(state.folderManager, {
      escapeHtml,
      escapeAttr,
      iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
      mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
      renderSearchFilters: () => renderList("filters-only"),
      renderListPanel: () => renderList("threads-only"),
    }),
  renderList,
  threadsVisibleInList,
  isSearchActive,
  folderManagerPanelMailbox,
  threadParticipantsWithEmails,
  threadQuickReplyTargetName,
  threadParticipantFirstMessageIds,
  threadRecipientPresenceEventsByMessageId,
  threadAiSummaryShownInZen,
  threadIsAutoMail,
  threadListFollowed,
  shouldOfferPerMessageTranslate,
  threadTreeLaneRight,
  isOwnSender,
  senderAccentVars,
  receivedAtIsoDatetime,
  effectiveMessageViewMode,
  threadSuppressAutoEnvelopeMeta,
  messageHtmlForDisplay,
  extractUnsubscribeLinksFromHtml,
  threadMessageAnchorId,
  normalizedMailSecurity,
  mailSecurityTierClass,
  mailSecurityFindingsForDisplay,
  zenSummaryHtmlFragments,
  parseMaybeDate,
  dayKey,
  isSecurityLlmAugmentPending,
  draftHasRecipientsExtra,
  attachmentPathsJoinedForHiddenField,
  composeKindTitle,
  composeMicButtonTitle,
  micAriaLabel,
  formatDraftRevisionStamp,
  sanitizeEmailHtml,
  settingsDraftProfile,
  mergedProfileForAccountsForm,
  buildSettingsAiPanelDeps,
  addressBookRowsCache: getAddressBookRowsCache,
  addressBookEditEmail: () => getAddressBookEditEmail(),
  addressBookListQuery: getAddressBookListQuery,
  accountsFormIdentityScratch: getAccountsFormIdentityScratch,
  threadQaMicButtonTitle,
  threadAiSummaryForCurrentThread,
  threadIdsMatch,
  agentStepProgressLabel,
  agentSkillEnabled,
  agentOfferSlotsStep,
  shouldOfferThreadTranslate,
});

registerMailListDeps({
  isSearchActive,
  searchQueryUsesThreadsApi,
  usesSearchContextLoader,
  searchThreads,
});

registerOpenThreadDeps({
  openSavedDraftById,
  navPop,
  threadAiSummaryScoped,
  clearThreadAiSummaryState,
  threadIsAutoMail,
  stopAgentTelemetry,
  loadNewsletterRules,
  hydrateMessageTranslationsFromCacheForThread,
  scheduleSecurityLlmAugment,
  summarizeThread,
  sourceMailboxForThread,
  isSenderBatchSummarizeActive: () => isSenderBatchSummarizeActive(),
  getAutoThreadSummaryDoneFor: () => autoThreadSummaryDoneFor,
  setAutoThreadSummaryDoneFor: (threadId) => {
    autoThreadSummaryDoneFor = threadId;
  },
});

registerSearchCommitDeps({
  loadMailView,
  loadThreadsForSearchContext,
  threadsVisibleInList,
  clearThreadAiSummaryState,
  withLlmQueue,
});

registerSearchBarUiDeps({
  refreshSearchTagCatalog,
  searchDraftDiffersFromCommitted,
});

registerSearchViewContextDeps({
  threadsVisibleInList,
});

registerSearchViewBatchDeps({
  threadsVisibleInList,
  sourceMailboxForThread,
  activeSavedSearchItem,
  refreshMailboxesAfterImapChange,
});

registerSearchLaunchDeps({
  clearThreadAiSummaryState,
  refreshSearchTagCatalog,
});

registerBulkTrashListDeps({
  threadsVisibleInList,
  sourceMailboxForThread,
  loadMailboxUnread,
  loadMailView,
});

registerSearchAtAutocompleteWireDeps({
  composeChipsHandle,
  scheduleDraftRevisionSave,
});

registerEmptyTrashMailboxDeps({
  loadMailView: () => loadMailView(),
  loadMailboxUnread,
});


registerThreadListActionsDeps({
  loadMailboxUnread,
});

registerMailboxManageActionDeps({
  loadMailboxUnread,
  loadMailView,
});

registerThreadScrollToMessageDeps({
  sortMessagesByReceivedDescending,
});

registerSwitchMailboxRunDeps({ loadMailView });

registerComposeCloseFlowDeps({
  persistDraft,
  flushDraftRevisionPending,
  composeDraftHasMeaningfulContent,
  clearDraftRevisionDebounce: clearDraftRevisionDebounceTimer,
  refreshSavedDraftsMailboxCount,
  threadReadingIsSimpleLayout,
});

registerComposeAttachmentsActionDeps({ scheduleDraftRevisionSave });

registerCycleComposeLayoutDeps({
  persistDraft,
  syncPreviewOpenFromComposeLayout,
  refreshDraftRevisions,
  computePreview,
});

registerLlmQueueCancelDeps({
  cancelActiveLlmStreamJob,
  abortIdleAiCachePrefetchInFlight,
  abortLlmQueue: abortLlmQueueJob,
});

registerComposeSendDraftRunDeps({
  loadMailView,
  loadMailboxUnread,
  clearDraftSession,
});

registerComposeDraftPreviewDeps({
  persistDraft,
  sanitizePreviewHtml: (htmlRaw) => sanitizeEmailHtml(htmlRaw, { relocateUnsubscribe: false }).html,
});

registerComposeDraftLocalSaveDeps({
  refreshSavedDraftsMailboxCount,
  loadMailView,
});

registerComposeDraftRevisionAutosaveDeps({
  canScheduleDraftRevisionSave: () =>
    isTauriRuntime() && Boolean(state.draft && state.draftSessionId),
  saveDraftRevisionNow: () => {
    void saveDraftRevisionNow();
  },
});

registerComposeDraftRevisionDiffDeps({ persistDraft });

registerComposePickAttachmentsDeps({ scheduleDraftRevisionSave });

registerSettingsWireActionsDeps({
  syncActivityRecordingPrefs,
});

registerFolderManagerRunDeps({ loadMailView });
registerOrgApplyRunDeps({ loadMailView });
registerOrgV2ApplyRunDeps({ loadMailView });

registerComposeThreadReplyDeps({
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  computePreview,
  scheduleDraftRevisionSave,
  formatThreadReadingWhen,
  enterComposeView,
  startNewDraftSession,
  syncPreviewOpenFromComposeLayout,
});

registerSwitchActiveAccountDeps({
  loadMailView,
  loadMailboxUnread,
  refreshSavedDraftsMailboxCount,
  refreshSavedSearches,
  refreshSuggestedSavedViews,
});

registerAppNavigationStackDeps({
  openThread,
  openContactDetailView,
  fmSelectMailbox,
  refreshFolderManagerTree,
});

initMailboxDigest({
  withTimeout,
  currentAccount,
  refreshLlmRuntimeStatus,
  tauriErrorMessage,
});

initIdleAiCachePrefetch({
  withTimeout,
  currentAccount,
  aiCacheKeySegment,
  refreshLlmRuntimeStatus,
  threadIsAutoMail,
  langFromKindTags,
  normalizeIso639Primary,
  summarizeThreadCore,
  translateThreadCore,
});

export { boot } from "./mail/appBootRun";
