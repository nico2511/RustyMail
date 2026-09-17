/** Wires all mail/UI module deps at startup — extracted from application.ts */
import { invoke } from "@tauri-apps/api/core";

import { listen, TauriEvent } from "@tauri-apps/api/event";

import { getCurrentWebview } from "@tauri-apps/api/webview";

import { ipcThrottleMs, invokeAiCacheGet } from "../../ipc_bridge";

import {
  clearThreadsRecentlyRemoved,
  filterRecentlyRemovedThreads,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";

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
} from "../../mailboxKinds";

import {
  notifyImapWatchFocusedMailbox,
  refreshUiAfterImapPush,
  syncInbox,
} from "./syncInboxRun";

import {
  formatFriendlyThreadListDate,
  parseThreadListActivityDate,
  savedDraftDatesColumnSnippet,
  threadListActivityTooltip,
} from "../../threadListDates";

import type { AppPrefs, AppPrefsAi } from "../../prefs_defaults";

import {
  WHISPER_PTT_KEY_CODES,
  defaultAppPrefs,
  normalizeAiPrefsMerged,
} from "../../prefs_defaults";

import { getUiLocale, localeTag, setLocale, t } from "../../i18n";

import type { PromptCatalogItem } from "../../promptsSettingsPanel";

import { maybeShowFirstRunWizard } from "../../setupWizard";

import { toast } from "../lib/toast";

import { formatTime } from "../lib/domForm";

import { formatPlainTextWithLinks, linkifyPlainSegment, trimUrlTrailingPunct } from "../lib/textFormat";

import { initials, formatTag, isNoisyTag } from "../lib/tags";

import { iconSvg } from "../lib/iconSvg";

import {
  openTextPromptModal,
  finishTextPromptModal,
  renderTextPromptModal,
  openConfirmModal,
  finishConfirmModal,
  renderConfirmModal,
  isTextPromptOpen,
  isConfirmOpen,
} from "../modals/promptConfirm";

import { utf8StringToBase64, mailHtmlMountAttrs } from "../lib/htmlMessage";

import { composeRewriteStyleFromTone, toneLabelsFr, tones } from "../core/composeTone";
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
} from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import {
  ENABLE_CLEAN_MESSAGE_VIEW,
  LIST_FILTER_VALUES,
} from "../lib/appUiConstants";
import { currentAccount } from "../core/accountContext";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { canonicalEmailForNlMatch } from "./searchAccountResolve";
import {
  folderManagerPanelMailbox,
  listMailboxForPanel,
  listThreadsPayload,
} from "./mailboxPanelContext";
import {
  applyListFilter,
  loadMailView,
  loadMailboxUnread,
  loadThreadsForSearchContext,
  registerMailListDeps,
  reloadCurrentThreadList,
} from "./mailListView";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { openThread, registerOpenThreadDeps } from "./openThreadView";
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
} from "./searchCommitQuery";
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
} from "./searchQueryContext";
import {
  launchContactMailSearch,
  launchDomainMailSearch,
  launchTagMailSearch,
  registerSearchLaunchDeps,
} from "./searchLaunchQueries";
import {
  closeSearchModal,
  openSearchModal,
  registerSearchBarUiDeps,
  syncSearchBarChrome,
} from "./searchBarUi";
import {
  applySavedSearchView,
  acceptSuggestedSavedView,
  deleteSavedSearchView,
  dismissSuggestedSavedView,
  markActiveSavedSearchSeen,
  refreshSavedSearches,
  refreshSuggestedSavedViews,
  saveCurrentSearchView,
} from "./savedSearchViews";
import {
  bulkArchiveSearchViewThreads,
  bulkMarkReadSearchViewThreads,
  registerSearchViewBatchDeps,
  runFluxAffinerFromSearchView,
} from "./searchViewBatch";
import {
  bulkTrashVisibleThreads,
  registerBulkTrashListDeps,
} from "./bulkTrashList";
import {
  confirmMoveDialog,
  onThreadMove,
  onThreadMoveTo,
  onThreadSeen,
  onThreadToggleFollow,
  openMoveDialog,
  registerThreadListActionsDeps,
  sourceMailboxForThread,
} from "./threadListActions";
import {
  mailboxManageAction,
  registerMailboxManageActionDeps,
} from "./mailboxManageAction";
import {
  registerEmptyTrashMailboxDeps,
} from "./emptyTrashMailbox";
import {
  currentThreadIdForReply,
  registerComposeThreadReplyDeps,
} from "./composeThreadReply";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { threadIsAutoMail } from "./threadAutoMail";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { threadMessageAnchorId } from "./threadMessageAnchor";
import { registerThreadScrollToMessageDeps } from "./threadScrollToMessage";
import { writeSidebarCollapsedPreference } from "../lib/sidebarUiPref";
import { draftHasRecipientsExtra } from "./composeDraftRecipients";
import { registerSwitchMailboxRunDeps } from "./switchMailboxAction";
import { loadAddressBookSidebarCount } from "./loadAddressBookSidebarCount";
import { openContactDetailView } from "./addressBookWireActions";
import {
  extractUnsubscribeLinksFromHtml,
  messageHtmlForDisplay,
  sanitizeEmailHtml,
} from "./mailEmailHtmlSanitize";
import {
  sortMessagesByReceivedDescending,
  parseMaybeDate,
  dayKey,
  formatThreadReadingWhen,
  receivedAtIsoDatetime,
} from "./threadMessageSort";
import {
  activeSecurityLlmAugmentCount,
  isSecurityLlmAugmentPending,
  mailSecurityFindingsForDisplay,
  mailSecurityTierClass,
  normalizedMailSecurity,
  scheduleSecurityLlmAugment,
} from "./mailSecurityDisplay";
import { langFromKindTags, shouldOfferPerMessageTranslate, shouldOfferThreadTranslate } from "./threadLangGuess";
import { normalizeIso639Primary } from "./threadLangGuessSamples";
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
} from "./threadViewUiHelpers";
import { composeKindTitle, formatDraftRevisionStamp } from "./composeFormLabels";
import {
  buildSettingsAiPanelDeps,
  mergedProfileForAccountsForm,
  settingsDraftProfile,
} from "./settingsRenderHelpers";
import {
  captureAccountsFormIdentityFromDom,
  getAccountsFormIdentityScratch,
} from "./settingsAccountsFormState";
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
} from "./threadAiStreamDom";
import { attachmentPathsJoinedForHiddenField } from "./composeAttachmentPaths";
import {
  clearDraftSession,
  discardCurrentDraftSession,
  finalizeCloseComposeFromUser,
  leaveComposeViewAfterClose,
  registerComposeCloseFlowDeps,
} from "./composeCloseFlow";
import {
  clearAttachments,
  registerComposeAttachmentsActionDeps,
  removeAttachment,
} from "./composeAttachmentsAction";
import { cancelLlmQueueJob, registerLlmQueueCancelDeps } from "./llmQueueCancel";
import { cycleComposeLayout, registerCycleComposeLayoutDeps } from "./cycleComposeLayout";
import { enterComposeView } from "./composeViewWireActions";
import { registerComposeSendDraftRunDeps } from "./composeSendDraftRun";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import {
  computeDraftDiffAgainstRevision,
  registerComposeDraftRevisionDiffDeps,
} from "./composeDraftRevisionDiff";
import {
  dismissOrphanDraftSession,
  resumeOrphanDraftSession,
} from "./composeOrphanDraftSession";
import { pickAttachments, registerComposePickAttachmentsDeps } from "./composePickAttachments";
import {
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  computePreview,
  schedulePreviewUpdate,
  scheduleDraftRevisionSave,
} from "./composeComposerBridge";
import {
  clearDraftRevisionDebounceTimer,
  flushDraftRevisionPending as flushDraftRevisionPendingNow,
  registerComposeDraftRevisionAutosaveDeps,
} from "./composeDraftRevisionAutosave";
import { persistDraft } from "./composePersistDraft";
import { composeChipsHandle } from "./composeRecipientChipsWire";
import {
  checkOrphanDraftSessionsOnBoot,
  registerComposeDraftLocalSaveDeps,
  saveDraftRevisionNow,
} from "./composeDraftLocalSave";
import { composeDraftHasMeaningfulContent, startNewDraftSession } from "./composeDraftSession";
import { syncPreviewOpenFromComposeLayout } from "./composeLayoutState";
import { registerComposeDraftPreviewDeps } from "./composeDraftPreview";
import { threadsVisibleInList, threadListFollowed } from "./mailListThreadFilter";
import {
  applyDefaultAccountFromPrefs,
  defaultListFilterFromPrefs,
  ensureValidSelectedMailbox,
} from "./accountDefaultPrefs";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import {
  fmSelectMailbox,
  refreshFolderManagerTree,
} from "./orgFolderWireActions";
import { abortLlmQueueJob, withLlmQueue } from "./llmJobQueue";
import { navMailboxSegment, navCurrentBreadcrumbSegment } from "./navBreadcrumbSegments";
import { exitSearchModeForMailboxBrowse } from "./searchMailboxBrowseExit";
import { paintLlmPrefetchProgressDom } from "./llmPrefetchProgressDom";
import { paintStatusBarProgressDom } from "./statusBarProgressJobs";
import { registerSwitchActiveAccountDeps } from "./switchActiveAccountAction";
import {
  beginNavigation,
  captureCurrentNav,
  goBack,
  goForward,
  navigateToBreadcrumbIndex,
  navigateToInbox,
  registerAppNavigationStackDeps,
} from "./appNavigationStack";
import { loadAccountsFromBackend } from "./accountsLoadFromBackend";
import {
  mailboxPathPrefixForCreate,
} from "./folderManagerPanelState";
import { orgApplyStatusMessage } from "./orgApplyStatusMessage";
import { aiSidePanelExpandedForShell, threadReadingIsSimpleLayout } from "./threadShellLayout";
import { bindTauriNativeFileDropAsync } from "./composeTauriNativeFileDrop";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";
import { activeMessageTranslationJobCount } from "./threadStatusJobCounts";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { bindMicPushToTalk } from "./composeMicDictation";
import { formatWhisperPttKeyLabel } from "./composeMicPtt";
import {
  composeMicButtonTitle,
  micAriaLabel,
  threadQaMicButtonTitle,
} from "./composeMicUiHints";
import {
  hydrateMessageTranslationsFromCacheForThread,
  isSenderBatchSummarizeActive,
  summarizeThread,
  summarizeThreadCore,
  translateThreadCore,
} from "./threadAiRun";
import { registerSettingsWireActionsDeps, finalizeSettingsAiModalClose } from "./settingsWireActions";
import { registerFolderManagerRunDeps } from "./folderManagerActions";
import { wireFolderManagerDnD } from "./folderManagerDnD";
import { registerOrgApplyRunDeps } from "./orgApplyRun";
import { registerOrgV2ApplyRunDeps } from "./orgV2ApplyRun";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";
import {
  getAddressBookListQuery,
  getAddressBookRowsCache,
} from "./addressBookListState";
import { stopAgentTelemetry } from "./agentWireActions";
import {
  flushThreadActivityClosed,
  syncActivityRecordingPrefs,
} from "./threadActivityTracking";
import {
  getAddressBookEditEmail,
  registerAppShellWireContext,
} from "./appShellRender";
import { openSavedDraftById } from "./savedDraftOpenRun";
import { searchThreads } from "./searchThreadsRun";
import {
  refreshSearchTagCatalog,
} from "./searchTagCatalog";
import {
  activeSavedSearchItem,
  canSaveSearchView,
  canSaveSearchViewInModal,
  inboxSearchContextActive,
  registerSearchViewContextDeps,
  searchViewCanAffinerFlux,
  searchViewCanOpenOrganizer,
} from "./searchViewContext";
import {
  registerSearchAtAutocompleteWireDeps,
} from "./searchAtAutocompleteWire";
import { renderBriefMailViewShell } from "../ui/briefMailShell";
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
} from "./mailboxDigest";
import {
  abortIdleAiCachePrefetchInFlight,
  initIdleAiCachePrefetch,
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
} from "./idleAiCachePrefetch";
import { formatNewsletterRuleInput } from "../lib/newsletterRuleFormat";
import { formatAttachmentSizeKb } from "../lib/attachmentSize";
import { settingsExplainHtml } from "../lib/settingsExplainHtml";
import { tagToSearchDraft, threadTagsForModal } from "../lib/threadTagsModal";
import { registerRenderDeps } from "../ui/render/renderDeps";
import {
  renderFolderSidebarCountPill,
  renderViewNavTrail,
} from "../ui/render/listChrome";
import { renderList } from "../ui/render/listRender";
import {
  renderThread,
  renderThreadNlRuleButton,
  renderThreadParticipantLink,
} from "../ui/render/threadViewRender";
import { renderComposer } from "../ui/render/composerRender";
import { renderOrgThreadSampleRow } from "../ui/render/orgSampleRowRender";
import { registerWireEventsContext } from "../ui/wireEventsBridge";
import { wireEvents } from "../ui/wireEvents";
import { renderAiPanel } from "../ui/render/aiPanelRender";
import { renderSettings, renderSettingsAiModal } from "../ui/render/settingsRender";
import { renderMain } from "../ui/render/mainViewRender";
import { renderSidebar } from "../ui/render/sidebarRender";
import { renderAiQuickPanelOverlay } from "../ui/render/aiQuickPanelRender";
import {
  renderGlobalStatusFooter,
} from "../ui/render/statusFooterRender";
import { renderActionBriefHtml } from "../ui/render/actionBriefHtml";
import {
  renderSearchModal,
} from "../ui/render/searchRender";
import {
  renderThreadTagsDialog,
} from "../ui/render/threadTagsRender";
import {
  renderCloseComposeDialog,
  renderImageDialog,
  renderMailboxManageDialog,
  renderMoveDialog,
  renderQuoteFoldDialog,
  renderResumeDraftDialog,
  renderSplitSendDialog,
} from "../ui/render/modalsRender";

import { escapeAttr, escapeHtml } from "../../ui/sanitize";

import {
  renderStatusBarProgressInlineHtml,
  type StatusBarProgressJob,
} from "../../statusBarProgress";

import { parseSearchBarDraft } from "../../searchBarParse";

import {
  extractNlSearchFallbackText,
  hasCommittedSearchCriteria,
  hasSavableSearchCriteria,
  resetSearchStructuralState,
  searchCriteriaSnapshotsEqual,
  snapshotFromStructuralState,
  type SearchCriteriaSnapshot,
  type SearchStructuralState,
} from "../../searchQueryState";

import { recordSearchHistory } from "../../searchHistory";

import type { SavedSearchListItem } from "../../savedSearches";

import {
  clearSuggestionShownKeys,
  flushActivityQueue,
  recordActivity,
  type SuggestedSavedView,
} from "../../activity";

import {
  type AiFeatureKey,
  isAiFeatureEnabled,
  setAllAiFeatures,
} from "../../aiFeatures";

import {
  applyEngineConnectionMode,
  isSettingsAiModalId,
  normalizeSettingsAiModalId,
  type SettingsAiModalId,
  type SettingsAiPanelDeps,
} from "../../settingsAiPanel";

import { captureAiPrefsFieldsFromDom, syncLlmEnginePrefsToDom, captureAiFeatureTogglesFromDom, persistAiFeaturePrefs } from "../../aiPrefsPersist";

import { cancelActiveLlmStreamJob, extractPartialJsonStringField, isLlmCancelledError, runLlmStreamJob } from "../../llmStream";

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
} from "../../contactsView";

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
} from "../../navigation";

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
} from "../../organizationView";

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
} from "../../organizationViewV2";

import type { OrgApplyProgress } from "../../organizationView";

import {
  archiveMailboxThreads,
  defaultFolderManagerState,
  deleteMailboxWithContents,
  fetchMailboxTree,
  renderFolderManagerView,
  setMailboxLocked,
  type FolderManagerViewState,
} from "../../folderManagerView";

import {
  splitMailboxSegments,
} from "../../mailboxTree";

import { state } from "../state";

import { registerRender } from "../dispatch";

import type { View, Tone, Tag, Entity, ThreadListItem, Draft, DraftPreview, DraftRevisionListItem, DraftDiffLine, DraftCompareView, MessageViewMode, ComposeLayout, MicState, MailSecuritySignals, CleanedMessageView, DiscussionThreadView, AppStatus, AppPathsView, AppCapabilities, LlmRuntimeStatus, NewsletterRuleRow, InboxFilterCounts, ActionBriefResult, CloseComposeModal, ResumeDraftModal, OrphanDraftSessionItem, State, SearchViewBatchJob, MailboxFolderStatsRow, SavedDraftListItem, SemanticEmbeddingCountsSnapshot, FluxAffinerResult, MailUnsubscribeLink, InlineAttachPayload, ThreadParticipantLink, ThreadRecipientPresenceEvents, TextPromptModalSpec, ConfirmModalSpec, NavigateOpts, OAuthDesktopLoginOutcome, SummaryResult, ActionBriefEvidenceLink, AddressBookRow, ShortcutRow, SavedDraftOpenPayload, LlmTranslationResult } from "../types";



let autoThreadSummaryDoneFor: string | null = null;

async function flushDraftRevisionPending(): Promise<void> {
  await flushDraftRevisionPendingNow(
    () => state.view === "compose" && Boolean(state.draft && state.draftSessionId),
  );
}

export function registerAllAppModules(): void {
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

}
