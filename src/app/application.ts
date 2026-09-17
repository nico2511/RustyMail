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

import { inputValue, numberValue, selectValue, checkedValue, formatTime } from "./lib/domForm";

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
import {
  clearDiscoveredServerSnap,
  getDiscoveredServersFormSnap,
  setDiscoveredServersFormSnap,
} from "./account/discoveredServerSnap";
import {
  clearAccountOAuthWizard,
  resetNewAccountSetupState,
} from "./account/accountWizardState";
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
import { normalizeAccountRow } from "./mail/accountRowNormalize";
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
import { registerAccountWireActionsDeps } from "./mail/accountWireActions";
import {
  flushThreadActivityClosed,
  syncActivityRecordingPrefs,
} from "./mail/threadActivityTracking";
import { registerMailContentWireActionsDeps } from "./mail/mailContentWireActions";
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
import { wireEvents, handleAction } from "./ui/wireEvents";
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

import {
  accountFieldTouched,
  applyDomainPresetIfSafe,
  oauthProviderFallbackPreset,
  renderAccountFormMarkup,
  serverFieldSelectors,
  serverSidesFromDiscovery,
  serverSidesFromPreset,
  type Account,
  type DiscoverMailServersResult,
  type MailAuthKind,
  type OAuthAccountWizardPhase,
  type SecurityMode,
} from "../accountSetup";

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

import { root as appShell } from "./dom";

import type { View, Tone, Tag, Entity, ThreadListItem, Draft, DraftPreview, DraftRevisionListItem, DraftDiffLine, DraftCompareView, MessageViewMode, ComposeLayout, MicState, MailSecuritySignals, CleanedMessageView, DiscussionThreadView, AppStatus, AppPathsView, AppCapabilities, LlmRuntimeStatus, NewsletterRuleRow, InboxFilterCounts, ActionBriefResult, CloseComposeModal, ResumeDraftModal, OrphanDraftSessionItem, State, SearchViewBatchJob, MailboxFolderStatsRow, SavedDraftListItem, SemanticEmbeddingCountsSnapshot, FluxAffinerResult, MailUnsubscribeLink, InlineAttachPayload, ThreadParticipantLink, ThreadRecipientPresenceEvents, TextPromptModalSpec, ConfirmModalSpec, NavigateOpts, OAuthDesktopLoginOutcome, SummaryResult, ActionBriefEvidenceLink, AddressBookRow, ShortcutRow, SavedDraftOpenPayload, LlmTranslationResult } from "./types";


let addressBookEditEmail: string | null = null;

let autoThreadSummaryDoneFor: string | null = null;

let llmIdlePrefetchAfterBootScheduled = false;

let subscribedLlmPrefetchProgress = false;

let subscribedModelBootstrapProgress = false;

let skipAccountIdentityCaptureOnce = false;


async function flushDraftRevisionPending(): Promise<void> {
  await flushDraftRevisionPendingNow(
    () => state.view === "compose" && Boolean(state.draft && state.draftSessionId),
  );
}

let composeInteractionsAbort: AbortController | undefined;

async function loadBootDeferredPrefs(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    state.appPrefs = await withTimeout(invoke<AppPrefs>("get_app_prefs", {}), BOOT_INVOKE_TIMEOUT_MS);
    state.appPrefs.general = {
      ...defaultAppPrefs().general,
      ...state.appPrefs.general,
    };
    const prefAcc = (state.appPrefs.general.defaultAccountId ?? "").trim();
    if (prefAcc && !state.accounts.some((a) => a.id === prefAcc)) {
      delete state.appPrefs.general.defaultAccountId;
    }
    state.appPrefs.ai = normalizeAiPrefsMerged({
      ...defaultAppPrefs().ai,
      ...state.appPrefs.ai,
    });
    syncMailboxDigestPanelWithFeaturePref();
    setLocale(state.appPrefs.general.motherLanguage ?? "fr");
    state.dictationApiKeySet = await withTimeout(invoke<boolean>("dictation_api_key_status", {}), BOOT_INVOKE_TIMEOUT_MS);
    try {
      state.openrouterApiKeySet = await withTimeout(
        invoke<boolean>("openrouter_api_key_status", {}),
        BOOT_INVOKE_TIMEOUT_MS,
      );
    } catch {
      state.openrouterApiKeySet = false;
    }
    try {
      state.llamaServerApiKeySet = await withTimeout(
        invoke<boolean>("llama_server_api_key_status", {}),
        BOOT_INVOKE_TIMEOUT_MS,
      );
    } catch {
      state.llamaServerApiKeySet = false;
    }
    try {
      state.oauthGoogleConfigured = await withTimeout(
        invoke<boolean>("oauth_google_configured", {}),
        BOOT_INVOKE_TIMEOUT_MS,
      );
    } catch {
      state.oauthGoogleConfigured = false;
    }
    try {
      state.oauthMicrosoftConfigured = await withTimeout(
        invoke<boolean>("oauth_microsoft_configured", {}),
        BOOT_INVOKE_TIMEOUT_MS,
      );
    } catch {
      state.oauthMicrosoftConfigured = false;
    }
    try {
      state.semanticModelAvailable = await withTimeout(
        invoke<boolean>("semantic_model_available", {}),
        BOOT_INVOKE_TIMEOUT_MS
      );
    } catch {
      state.semanticModelAvailable = false;
    }

    if (!subscribedModelBootstrapProgress) {
      subscribedModelBootstrapProgress = true;
      void listen<{ phase?: string; percent?: number }>("model_bootstrap_progress", (e) => {
        const ph = e.payload?.phase ?? "";
        if (ph === "done" || ph === "minilm_done" || ph === "whisper_error") {
          void invoke<boolean>("semantic_model_available", {})
            .then((ok) => {
              state.semanticModelAvailable = ok;
              render();
            })
            .catch(() => {});
        }
        if (ph && ph !== "done") {
          toast(`Téléchargement modèles : ${ph}`);
        }
      });
      void listen<{ minilmOk?: boolean; whisperOk?: boolean; error?: string | null }>(
        "model_bootstrap_done",
        (e) => {
          if (e.payload?.minilmOk) state.semanticModelAvailable = true;
          state.appPrefs.general.bootstrapModelsCompleted = Boolean(
            e.payload?.minilmOk && e.payload?.whisperOk,
          );
          if (e.payload?.error) toast(e.payload.error);
          else if (e.payload?.minilmOk && e.payload?.whisperOk) {
            toast("Modèles légers (MiniLM + dictée) prêts.");
          }
          render();
        },
      );
    }
    if (!subscribedLlmPrefetchProgress) {
      subscribedLlmPrefetchProgress = true;
      void listen<{ percent?: number; phase?: string }>("llm_prefetch_progress", (e) => {
        const raw = typeof e.payload?.percent === "number" ? e.payload.percent : NaN;
        state.llmPrefetchPercent = Number.isFinite(raw)
          ? Math.min(100, Math.max(0, Math.round(raw)))
          : null;
        const ph = e.payload?.phase ?? "";
        if (ph === "done" || ph === "cancelled") {
          state.llmPrefetchPercent = null;
          state.llmPrefetchInFlight = false;
          paintLlmPrefetchProgressDom();
          paintStatusBarProgressDom();
          if (ph === "done") {
            void refreshLlmRuntimeStatus().then(() => {
              if (state.settingsAiModal === "engines") render();
            });
          } else if (state.settingsAiModal === "engines") {
            render();
          }
          return;
        }
        paintLlmPrefetchProgressDom();
        paintStatusBarProgressDom();
      });
    }
    void refreshLlmRuntimeStatus().then(() => {
      if (
        isMailboxDigestFeatureEnabled() &&
        state.mailboxDigestPanelOpen &&
        mailboxDigestPanelEligible()
      ) {
        const accountId = currentAccount()?.id?.trim();
        const mailbox = state.selectedMailbox || "INBOX";
        if (accountId) {
          state.mailboxActionBrief = null;
          state.mailboxBriefBannerHtml = buildMailboxBriefGateBannerHtml();
          state.mailboxDigestKey = `${accountId}|${mailbox}`;
          state.mailboxDigestRefreshing = false;
        }
      }
      render();
    });
    if (state.appPrefs.ai.localLlmEnabled && (state.appPrefs.ai.aiBackgroundLlmPrefetch || state.appPrefs.ai.llamaServerEnabled)) {
      void invoke("prefetch_llm_model", {}).catch(() => {});
    }
    maybeShowFirstRunWizard({
      prefs: state.appPrefs,
      toast,
      onDismiss: (p) => {
        state.appPrefs = p;
        void (async () => {
          try {
            await invoke("set_app_prefs", { prefs: state.appPrefs });
          } catch (e) {
            console.warn("first-run prefs", e);
          }
          render();
        })();
      },
    });
    applyDefaultAccountFromPrefs();
    const prefFilter = defaultListFilterFromPrefs();
    if (
      prefFilter !== state.listFilter &&
      state.view === "list" &&
      !isSearchActive() &&
      !isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")
    ) {
      await applyListFilter(prefFilter);
    }
  } catch (e) {
    console.error("app prefs", e);
    state.appPrefs = defaultAppPrefs();
    state.dictationApiKeySet = false;
    state.openrouterApiKeySet = false;
    state.llamaServerApiKeySet = false;
  }
}

export async function boot() {
  try {
    setLocale(state.appPrefs.general.motherLanguage ?? "fr");
    render();
    bindKeyboard();
    bindMouseNavigation();
    bindMicPushToTalk();
    bindDraftPersistenceFlush();

    state.status = await safeInvoke<AppStatus>("app_status", undefined, fallbackStatus(), BOOT_INVOKE_TIMEOUT_MS);
    await bindTauriNativeFileDropAsync();
    try {
      const capsRaw = await withTimeout(invoke<unknown>("capabilities", {}), BOOT_INVOKE_TIMEOUT_MS);
      state.capabilities = normalizeCapabilities(capsRaw);
    } catch (error) {
      console.error("capabilities", error);
      state.capabilities = fallbackCapabilities();
    }

    try {
      const paths = await withTimeout(invoke<AppPathsView>("app_paths", {}), BOOT_INVOKE_TIMEOUT_MS);
      state.lastAppPaths = paths;
      state.settingsPathsLoadError = "";
    } catch (error) {
      state.lastAppPaths = null;
      state.settingsPathsLoadError = tauriErrorMessage(error);
    }

    await loadAccountsFromBackend({ silent: false });
    if (isTauriRuntime()) {
      await listen<{ accountId: string; mailbox: string; reason: string }>("imap-push", (ev) => {
        const accId = ev.payload.accountId?.trim();
        if (!accId || state.syncInProgress) return;
        const current = currentAccount()?.id?.trim();
        if (current && current !== accId) return;
        // Le backend (IDLE/polling) a déjà fait sync_inbox sur INBOX — éviter une 2e sync IMAP multi-dossiers.
        void refreshUiAfterImapPush(ev.payload.mailbox?.trim() || "INBOX");
      });
      // Sync INBOX au démarrage (cache SQLite + nouveaux mails pendant l’app fermée).
      if (currentAccount()?.id?.trim()) {
        void syncInbox({ background: true });
      }
    }
    render();
    await loadBootDeferredPrefs();
    applyDefaultAccountFromPrefs();
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: currentAccount()?.id ?? null }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
    await loadMailView();
    notifyImapWatchFocusedMailbox(state.selectedMailbox);
    await loadMailboxUnread();
    await refreshSavedDraftsMailboxCount();
    await checkOrphanDraftSessionsOnBoot();
    await loadAddressBookSidebarCount();
    await refreshSavedSearches(true);
    syncActivityRecordingPrefs();
    await refreshSuggestedSavedViews();
    await loadNewsletterRules();
    state.selectedThreadId = state.threads[0]?.id;
    render();

    if (isTauriRuntime() && state.appPrefs.ai.localLlmEnabled) {
      try {
        const st = await withTimeout(invoke<LlmRuntimeStatus>("llm_status", {}), BOOT_INVOKE_TIMEOUT_MS);
        state.llmRuntimeStatus = st;
        if (!st.llmGateOpen && !state.appPrefs.ai.aiCloudLlmFallback) {
          toast(t("toast.aiOfflineLexical"));
        }
      } catch {
        /* statut optionnel */
      }
    }

    if (isTauriRuntime() && !llmIdlePrefetchAfterBootScheduled) {
      llmIdlePrefetchAfterBootScheduled = true;
      window.setTimeout(() => {
        if (!isTauriRuntime()) return;
        const a = state.appPrefs.ai;
        if (!a.localLlmEnabled) return;
        if (!(a.aiBackgroundLlmPrefetch || a.llamaServerEnabled)) return;
        void invoke("prefetch_llm_model", {}).catch(() => {});
      }, 45_000);
    }
  } catch (error) {
    const msg = `boot failed: ${tauriErrorMessage(error)}`;
    render();
    toast(msg);
  }
}

let persistAiPrefsDebounce: ReturnType<typeof setTimeout> | undefined;

const AI_PREFS_IMMEDIATE_CHECKBOX_IDS = new Set([
  "prefs-openrouter-enabled",
  "prefs-llama-server-enabled",
  "prefs-llama-server-cpu-override",
  "prefs-llama-server-spawn-enabled",
  "prefs-bg-auto-semantic",
  "prefs-bg-llm-prefetch",
  "prefs-bg-idle-ai-cache",
  "prefs-ai-cloud-fallback",
  "prefs-semantic-search",
]);

async function openAttachmentWithRiskHandling(
  messageId: string,
  attachmentId: string,
  label?: string,
  riskAcknowledged = false
): Promise<string> {
  try {
    return await withTimeout(
      invoke<string>("open_attachment", {
        req: { messageId, attachmentId, riskAcknowledged, openAck: "open-attachment" },
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch (err) {
    const msg = tauriErrorMessage(err);
    if (!riskAcknowledged && msg.startsWith("ATTACHMENT_RISK_CONFIRM:")) {
      const hint = label?.trim() || "pièce jointe";
      const ok = await openConfirmModal({
        title: "Pièce jointe à risque",
        body: `RustyMail signale une pièce potentiellement sensible (${hint}). L’ouvrir quand même ?`,
        danger: true,
        confirmLabel: "Ouvrir quand même",
      });
      if (!ok) throw err;
      return openAttachmentWithRiskHandling(messageId, attachmentId, label, true);
    }
    throw err;
  }
}

async function onAttachmentAction(
  kind: "download" | "open",
  messageId: string,
  attachmentId: string,
  fileName?: string
) {
  if (!messageId.trim() || !attachmentId.trim()) return;
  const cmd = kind === "open" ? "open_attachment" : "download_attachment";
  try {
    const saved =
      kind === "open" ?
        await openAttachmentWithRiskHandling(messageId, attachmentId, fileName)
      : await withTimeout(
          invoke<string>(cmd, { req: { messageId, attachmentId } }),
          MAIL_ACTION_TIMEOUT_MS
        );
    toast(kind === "open" ? `Attachment opened: ${saved}` : `Attachment downloaded: ${saved}`);
  } catch (err) {
    console.error(cmd, err);
    toast(tauriErrorMessage(err));
  }
}

function fileBaseName(path: string) {
  const normalized = String(path).replace(/\\/g, "/");
  const last = normalized.split("/").pop() ?? normalized;
  return last || normalized;
}

async function mailboxAction(kind: "create" | "rename" | "delete" | "subscribe") {
  const account = currentAccount();
  if (!account) {
    toast("Aucun compte actif.");
    return;
  }
  if (kind !== "create" && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Choisissez un dossier IMAP pour gérer les boîtes.");
    return;
  }
  try {
    if (kind === "create") {
      const prefix = mailboxPathPrefixForCreate();
      const def = prefix || "";
      const bodyHint = [
        prefix ? `Préfixe suggéré depuis le dossier courant : ${prefix}` : "",
        `Hiérarchie avec /. Ex. sous « ${state.selectedMailbox || "INBOX"} ».`,
      ]
        .filter(Boolean)
        .join("\n");
      const mailbox =
        (await openTextPromptModal({
          title: "Créer un dossier IMAP",
          body: bodyHint,
          label: "Chemin du dossier",
          defaultValue: def,
        }))?.trim() ?? "";
      if (!mailbox) return;
      toast(await withTimeout(invoke<string>("create_imap_mailbox", { accountId: account.id, mailbox }), MAIL_ACTION_TIMEOUT_MS));
    } else if (kind === "rename") {
      const fromMailbox = state.selectedMailbox;
      const toMailbox =
        (await openTextPromptModal({
          title: "Renommer le dossier",
          body: `Dossier actuel : ${fromMailbox}`,
          label: "Nouveau chemin IMAP",
          defaultValue: "",
        }))?.trim() ?? "";
      if (!toMailbox) return;
      toast(await withTimeout(invoke<string>("rename_imap_mailbox", { accountId: account.id, fromMailbox, toMailbox }), MAIL_ACTION_TIMEOUT_MS));
      // Preserve exact mailbox spelling (leading spaces can be meaningful on some servers).
      state.selectedMailbox = toMailbox;
    } else if (kind === "delete") {
      const mailbox = state.selectedMailbox;
      const ok = await openConfirmModal({
        title: "Supprimer ce dossier IMAP ?",
        body: `La mailbox « ${mailbox} » sera supprimée côté serveur.`,
        danger: true,
        confirmLabel: "Supprimer",
      });
      if (!ok) return;
      toast(
        await withTimeout(
          invoke<string>("delete_imap_mailbox", {
            accountId: account.id,
            mailbox,
            destructiveAck: "delete-mailbox",
          }),
          MAIL_ACTION_TIMEOUT_MS
        )
      );
      state.selectedMailbox = "INBOX";
    } else {
      const mailbox = state.selectedMailbox;
      toast(await withTimeout(invoke<string>("subscribe_imap_mailbox", { accountId: account.id, mailbox }), MAIL_ACTION_TIMEOUT_MS));
    }
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: account.id }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
    await loadMailView(false);
    await loadMailboxUnread();
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
    render();
  } catch (error) {
    toast(tauriErrorMessage(error));
  }
}

async function openSavedDraftById(savedDraftId: string) {
  const sdid = savedDraftId.trim();
  if (!sdid) return;
  if (!isTauriRuntime()) {
    toast("Ouvrir un brouillon enregistré : lancez l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte.");
    return;
  }
  try {
    const res = await withTimeout(
      invoke<SavedDraftOpenPayload>("saved_draft_open", { accountId: account.id, savedDraftId: sdid }),
      MAIL_ACTION_TIMEOUT_MS
    );
    enterComposeView();
    startNewDraftSession();
    state.draftSessionId = res.sessionId;
    state.savedDraftRecordId = res.savedDraftId;
    state.draft = res.draft;
    state.composeCcBccOpen = draftHasRecipientsExtra(res.draft);
    state.composeAdvancedOpen = false;
    state.composeLayout = "historique";
    syncPreviewOpenFromComposeLayout();
    resetMarkdownEditorHistory();
    loadComposeMarkdownIntoEditor(state.draft.markdownBody ?? "");
    state.preview = undefined;
    state.composeMessage = "";
    render();
    window.setTimeout(() => void computePreview(), 0);
    void refreshDraftRevisions(60);
    scheduleDraftRevisionSave(350);
  } catch (error) {
    console.error("saved_draft_open", error);
    toast(tauriErrorMessage(error));
    render();
  }
}

async function deleteSettingsAccount() {
  if (!isTauriRuntime()) {
    toast("La suppression du compte requiert l’app Tauri (npm run tauri:dev).");
    return;
  }
  const id = state.settingsSelectedAccountId;
  if (id === "new") return;
  const confirmed = await openConfirmModal({
    title: "Supprimer ce compte ?",
    body:
      "Toutes les données locales de ce compte seront effacées : messages, pièces jointes en base, cache IMAP, et index de recherche sémantique (vecteurs embeddings) pour ces messages. Le mot de passe IMAP/SMTP sera retiré du trousseau. Les modèles IA téléchargés (ex. MiniLM ONNX) restent sur le disque tant qu’un autre compte peut les réutiliser. Les règles anti-newsletter sont globales au profil : elles ne sont pas supprimées avec un seul compte. Les fichiers enregistrés ailleurs (ex. Téléchargements) ne sont pas effacés.",
    danger: true,
    confirmLabel: "Supprimer le compte",
  });
  if (!confirmed) return;

  try {
    await withTimeout(
      invoke("delete_account", { accountId: id, destructiveAck: "delete-account" }),
      ACCOUNT_INVOKE_TIMEOUT_MS
    );
    const rawAccounts = await withTimeout(invoke<unknown[]>("list_accounts", {}), ACCOUNT_INVOKE_TIMEOUT_MS);
    state.accounts = (Array.isArray(rawAccounts) ? rawAccounts : [])
      .map((row) => normalizeAccountRow(row))
      .filter((a): a is Account => a !== null);
    if (state.selectedAccountId === id) {
      state.selectedAccountId = state.accounts[0]?.id;
    }
    if ((state.appPrefs.general.defaultAccountId ?? "").trim() === id) {
      delete state.appPrefs.general.defaultAccountId;
      try {
        await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
      } catch {
        /* ignore */
      }
    }
    state.settingsSelectedAccountId = state.accounts[0]?.id ?? "new";
    state.accountMessage = "Compte supprimé.";
    if (isTauriRuntime()) {
      state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: currentAccount()?.id ?? null }, [], BOOT_INVOKE_TIMEOUT_MS);
      ensureValidSelectedMailbox();
      await loadMailView();
      await loadMailboxUnread();
    }
  } catch (error) {
    state.accountMessage = `Échec suppression : ${tauriErrorMessage(error)}`;
    console.error("delete_account", error);
    toast(state.accountMessage);
  }
  render();
}

function setOAuthWizardPhase(phase: OAuthAccountWizardPhase, message: string, error?: string | null) {
  state.accountOAuthWizardPhase = phase;
  state.accountOAuthWizardMessage = message;
  state.accountOAuthWizardError = error ?? null;
  render();
}

async function discoverServersSnapForEmail(
  email: string,
  authKind: MailAuthKind,
): Promise<{ snap: { imap: Account["imap"]; smtp: Account["smtp"] }; sourceLabel: string }> {
  accountFieldTouched.serverFields = false;
  let snap: { imap: Account["imap"]; smtp: Account["smtp"] } | null = null;
  let sourceLabel = "";

  const preset = applyDomainPresetIfSafe(email, {
    onApplied(_domain, p) {
      snap = serverSidesFromPreset(p);
      sourceLabel = "Préréglage domaine";
    },
  });
  if (preset && snap) {
    if (isTauriRuntime()) {
      try {
        const raw = await withTimeout(
          invoke<DiscoverMailServersResult>("discover_mail_servers", { email }),
          ACCOUNT_INVOKE_TIMEOUT_MS,
        );
        snap = serverSidesFromDiscovery(raw);
        sourceLabel = raw.sourceLabel;
      } catch {
        /* garde le préréglage */
      }
    }
    return { snap, sourceLabel };
  }

  if (isTauriRuntime()) {
    const raw = await withTimeout(
      invoke<DiscoverMailServersResult>("discover_mail_servers", { email }),
      ACCOUNT_INVOKE_TIMEOUT_MS,
    );
    return { snap: serverSidesFromDiscovery(raw), sourceLabel: raw.sourceLabel };
  }

  const fallback = oauthProviderFallbackPreset(authKind);
  if (!fallback) {
    throw new Error("Impossible de déterminer les serveurs IMAP/SMTP pour cette adresse.");
  }
  return { snap: serverSidesFromPreset(fallback), sourceLabel: "Préréglage fournisseur OAuth" };
}

async function saveAccountProgrammatic(profile: {
  displayName: string;
  email: string;
  authKind: MailAuthKind;
  imap: Account["imap"];
  smtp: Account["smtp"];
}): Promise<Account | null> {
  const emailNorm = profile.email.trim().toLowerCase();
  if (!profile.email.includes("@")) {
    throw new Error("E-mail invalide.");
  }
  if (state.accounts.some((a) => a.id === emailNorm)) {
    throw new Error("Ce compte existe déjà — sélectionnez-le dans la liste.");
  }
  const request = {
    displayName: profile.displayName.trim() || profile.email,
    email: profile.email.trim(),
    password: "",
    authKind: profile.authKind,
    imapHost: profile.imap.host,
    imapPort: profile.imap.port,
    imapSecurity: profile.imap.security,
    imapAllowInvalidTls: profile.imap.allowInvalidTls,
    smtpHost: profile.smtp.host,
    smtpPort: profile.smtp.port,
    smtpSecurity: profile.smtp.security,
    smtpAllowInvalidTls: profile.smtp.allowInvalidTls,
  };
  const savedRaw = await withTimeout(invoke<unknown>("save_account", { request }), ACCOUNT_INVOKE_TIMEOUT_MS);
  const saved = normalizeAccountRow(savedRaw);
  const rawAccounts = await withTimeout(invoke<unknown[]>("list_accounts", {}), ACCOUNT_INVOKE_TIMEOUT_MS);
  const accounts = (Array.isArray(rawAccounts) ? rawAccounts : [])
    .map((row) => normalizeAccountRow(row))
    .filter((a): a is Account => a !== null);
  state.accounts = accounts.length ? accounts : saved ? [saved] : [];
  if (saved) {
    if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
      state.selectedAccountId = saved.id;
    }
    state.settingsSelectedAccountId = saved.id;
  }
  return saved;
}

async function finishOAuthNewAccountAfterLogin(
  authKind: "oauthGoogle" | "oauthMicrosoft",
  email: string,
  displayName: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    toast("OAuth2 : lancez l’application bureau Tauri.");
    return;
  }

  const emailNorm = email.trim().toLowerCase();
  state.accountPasswordSetupExpanded = false;
  state.accountFormAuthKind = authKind;
  state.oauthLockedEmail = emailNorm;
  state.accountFormOAuthPrefill = { email: email.trim(), displayName: displayName.trim() };
  state.accountOAuthWizardRetry = { authKind, email: email.trim(), displayName: displayName.trim() };
  accountFieldTouched.serverFields = false;
  state.accountMessage = "";

  try {
    setOAuthWizardPhase("discover", `Détection des serveurs pour ${email.trim()}…`);
    const { snap, sourceLabel } = await discoverServersSnapForEmail(email.trim(), authKind);
    setDiscoveredServersFormSnap(snap);
    state.accountMessage = sourceLabel;

    setOAuthWizardPhase("save", "Enregistrement du compte (SQLite + trousseau)…");
    const saved = await saveAccountProgrammatic({
      displayName: displayName.trim() || email.trim(),
      email: email.trim(),
      authKind,
      imap: snap.imap,
      smtp: snap.smtp,
    });
    if (!saved) {
      throw new Error("Enregistrement refusé par le serveur local.");
    }

    clearDiscoveredServerSnap();
    state.accountFormOAuthPrefill = null;
    state.oauthLockedEmail = null;

    state.selectedAccountId = saved.id;
    state.settingsSelectedAccountId = saved.id;
    state.listFilter = "all";
    state.search = "";
    state.searchDraft = "";
    state.searchSenders = [];
    state.searchTags = [];
    state.searchLanguageFilter = null;
    state.searchNewsletterRule = null;
    state.searchModifiersTouched = false;
    state.searchMailboxPath = null;
    state.searchNlMode = null;
    state.selectedThreadId = undefined;
    state.selectedThread = undefined;
    navigateToInbox({ resetStack: true });

    if (isTauriRuntime()) {
      state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: saved.id }, [], BOOT_INVOKE_TIMEOUT_MS);
      ensureValidSelectedMailbox();
    }

    setOAuthWizardPhase("sync", `Synchronisation de tous les dossiers · ${saved.email}…`);
    await syncInbox({ allMailboxes: true });

    clearAccountOAuthWizard();
    state.accountOAuthWizardRetry = null;
    state.accountMessage = `Compte ${saved.email} prêt.`;
    toast(`Compte ${saved.displayName || saved.email} ajouté et synchronisé.`);
    render();
  } catch (e) {
    const text = tauriErrorMessage(e);
    state.accountOAuthWizardPhase = "error";
    state.accountOAuthWizardMessage = "La configuration automatique a échoué.";
    state.accountOAuthWizardError = text;
    state.accountMessage = text;
    state.accountServersPanelOpen = true;
    toast(text);
    render();
  }
}

async function discoverMailServersAction(): Promise<void> {
  const emailRaw = inputValue("account-email").trim();
  if (!emailRaw.includes("@")) {
    toast("Saisissez une adresse e-mail complète avant la détection.");
    return;
  }
  if (accountFieldTouched.serverFields) {
    const ok = await openConfirmModal({
      title: "Remplacer les serveurs ?",
      body: "Les serveurs ont été modifiés à la main. Les remplacer par le résultat de la détection ?",
      confirmLabel: "Remplacer",
    });
    if (!ok) return;
    accountFieldTouched.serverFields = false;
  }

  if (!isTauriRuntime()) {
    const preset = applyDomainPresetIfSafe(emailRaw, {
      onApplied(domain, p) {
        setDiscoveredServersFormSnap(serverSidesFromPreset(p));
        state.accountMessage = `Préréglage local (${domain}) — lancez RustyMail en mode bureau pour ISPDB, .well-known et autoconfig.`;
        accountFieldTouched.serverFields = false;
        state.accountServersPanelOpen = true;
        render();
      },
    });
    if (!preset) {
      toast("Aucun préréglage local pour ce domaine · lancement en application bureau nécessaire pour la détection automatique étendue.");
    }
    return;
  }

  try {
    toast("Détection des serveurs (ISPDB Mozilla, .well-known, autoconfig, préréglages locaux…)…");
    const raw = await withTimeout(
      invoke<DiscoverMailServersResult>("discover_mail_servers", { email: emailRaw }),
      ACCOUNT_INVOKE_TIMEOUT_MS,
    );
    setDiscoveredServersFormSnap(serverSidesFromDiscovery(raw));
    accountFieldTouched.serverFields = false;
    state.accountMessage = raw.sourceLabel;
    state.accountServersPanelOpen = true;
    render();
  } catch (err) {
    const text = tauriErrorMessage(err);
    toast(text);
    const preset = applyDomainPresetIfSafe(emailRaw, {
      onApplied(domain, p) {
        setDiscoveredServersFormSnap(serverSidesFromPreset(p));
        state.accountMessage = `Préréglage local (${domain}) après échec : ${text}`;
        accountFieldTouched.serverFields = false;
        render();
      },
    });
    if (!preset) {
      state.accountMessage = text;
      render();
    }
  }
}

async function saveAccount() {
  if (!isTauriRuntime()) {
    state.accountMessage = "L’enregistrement du compte sur disque requiert l’app Tauri (npm run tauri:dev), pas le navigateur seul.";
    render();
    toast(state.accountMessage);
    return;
  }

  const emailRaw = inputValue("account-email").trim();
  const emailNorm = emailRaw.toLowerCase();
  const editingId =
    state.view === "settings" && state.settingsTab === "accounts" && state.settingsSelectedAccountId !== "new"
      ? state.settingsSelectedAccountId.trim().toLowerCase()
      : null;
  const isNewProfile = editingId === null;

  const persistedEdit = editingId != null ? state.accounts.find((a) => a.id === editingId) : undefined;
  const authKindForSave: MailAuthKind =
    editingId != null ?
      state.oauthLockedEmail != null || state.accountFormAuthKind !== "password" ?
        state.accountFormAuthKind
      : (persistedEdit?.authKind ?? "password")
    : state.accountFormAuthKind;

  const request = {
    displayName: inputValue("account-display-name"),
    email: emailRaw,
    password: inputValue("account-password"),
    authKind: authKindForSave,
    imapHost: inputValue("imap-host"),
    imapPort: numberValue("imap-port", 993),
    imapSecurity: selectValue("imap-security", "Tls") as SecurityMode,
    imapAllowInvalidTls: checkedValue("imap-allow-invalid-tls"),
    smtpHost: inputValue("smtp-host"),
    smtpPort: numberValue("smtp-port", 587),
    smtpSecurity: selectValue("smtp-security", "StartTls") as SecurityMode,
    smtpAllowInvalidTls: checkedValue("smtp-allow-invalid-tls"),
    ...(editingId ? { previousAccountId: editingId } : {})
  };

  if (!request.email.includes("@")) {
    state.accountMessage = "E-mail invalide.";
    render();
    return;
  }

  if (isNewProfile && state.accounts.some((a) => a.id === emailNorm)) {
    state.accountMessage = "Ce compte existe déjà. Sélectionnez-le dans la liste pour le modifier.";
    render();
    return;
  }

  const oauthNew =
    isNewProfile && (authKindForSave === "oauthGoogle" || authKindForSave === "oauthMicrosoft");

  if (!request.password && isNewProfile && !oauthNew) {
    state.accountMessage = "Mot de passe ou app password requis pour un nouveau compte (mode mot de passe).";
    render();
    return;
  }

  if (!request.imapHost || !request.smtpHost) {
    state.accountMessage = "Renseignez les hôtes IMAP et SMTP.";
    render();
    return;
  }

  state.accountMessage = "Enregistrement en cours (SQLite + trousseau)…";
  render();

  try {
    const savedRaw = await withTimeout(invoke<unknown>("save_account", { request }), ACCOUNT_INVOKE_TIMEOUT_MS);
    const saved = normalizeAccountRow(savedRaw);
    const rawAccounts = await withTimeout(invoke<unknown[]>("list_accounts", {}), ACCOUNT_INVOKE_TIMEOUT_MS);
    const accounts = (Array.isArray(rawAccounts) ? rawAccounts : [])
      .map((row) => normalizeAccountRow(row))
      .filter((a): a is Account => a !== null);
    if (accounts.length === 0) {
      state.accountMessage = "Compte enregistré côté commande, mais la liste rechargée est vide — vérifiez les logs Tauri.";
      state.accounts = saved ? [saved] : [];
    } else {
      state.accounts = accounts;
      if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
        state.selectedAccountId = state.accounts[0]?.id;
      }
      state.accountMessage = `Compte enregistré : ${saved?.email ?? accounts[0]?.email ?? ""} (${accounts.length} dans SQLite).`;
    }
    if (editingId && state.selectedAccountId === editingId && saved) {
      state.selectedAccountId = saved.id;
    }
    if (state.view === "settings" && state.settingsTab === "accounts" && saved) {
      state.settingsSelectedAccountId = saved.id;
    }
    clearDiscoveredServerSnap();
    state.accountFormOAuthPrefill = null;
    state.oauthLockedEmail = null;
    clearAccountOAuthWizard();
    state.accountOAuthWizardRetry = null;
    if (isTauriRuntime()) {
      state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: currentAccount()?.id ?? null }, [], BOOT_INVOKE_TIMEOUT_MS);
      ensureValidSelectedMailbox();
      await loadMailView();
      await loadMailboxUnread();
    }
  } catch (error) {
    const text = tauriErrorMessage(error);
    state.accountMessage = `Échec enregistrement : ${text}`;
    console.error("save_account / list_accounts", error);
    toast(state.accountMessage);
  }
  render();
}

function mouseNavBlockedByOverlay(): boolean {
  return Boolean(
    state.quoteFoldModal ||
      state.threadTagsModalOpen ||
      state.closeComposeModal ||
      state.resumeDraftModal ||
      state.imageModal ||
      state.splitSendConfirm ||
      state.moveOpen ||
      state.mailboxManageOpen ||
      state.searchModalOpen ||
      state.settingsAiModal ||
      isTextPromptOpen() || isConfirmOpen()
  );
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

function singleKeyShortcutsBlocked(): boolean {
  return mouseNavBlockedByOverlay();
}

function keyboardPlainKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}

function bindMouseNavigation() {
  const handleMouseNav = (event: MouseEvent) => {
    if (event.button !== 3 && event.button !== 4) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    if (mouseNavBlockedByOverlay()) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 3) void goBack();
    else if (navCanGoForward()) void goForward();
  };

  document.addEventListener("auxclick", handleMouseNav, { capture: true });
  // Secours WebView2 / certains pilotes qui n’émettent pas auxclick.
  document.addEventListener(
    "mouseup",
    (event) => {
      if (event.button !== 3 && event.button !== 4) return;
      if (event.defaultPrevented) return;
      handleMouseNav(event);
    },
    { capture: true }
  );
}

function bindDraftPersistenceFlush() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushDraftRevisionPending();
    }
  });
  window.addEventListener("pagehide", () => {
    void flushDraftRevisionPending();
  });
}

function bindKeyboard() {
  document.addEventListener("keydown", (event) => {
    // Raccourcis vues enregistrées : Alt+Digit1…9
    if (event.altKey && !event.ctrlKey && !event.metaKey && /^Digit[1-9]$/.test(event.code)) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        /* allow typing */
      } else {
        const code = event.code;
        const byShortcut = state.savedSearches.find(
          (s) => (s.shortcut || "").trim() === code,
        );
        const idx = Number(code.replace("Digit", "")) - 1;
        const byIndex = !byShortcut ? state.savedSearches[idx] : undefined;
        const hit = byShortcut || byIndex;
        if (hit?.id) {
          event.preventDefault();
          void applySavedSearchView(hit.id);
          return;
        }
      }
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "t") {
      event.preventDefault();
      if (state.searchModalOpen) closeSearchModal();
      else openSearchModal();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "F5") {
      event.preventDefault();
      if (!isTauriRuntime()) {
        toast("Sync IMAP : disponible dans l’app Tauri.");
        return;
      }
      if (state.syncInProgress) {
        toast("Synchronisation déjà en cours.");
        return;
      }
      void syncInbox({ background: state.view === "thread" });
      return;
    }
    if (event.key === "Escape") {
      if (state.settingsAiModal) {
        event.preventDefault();
        finalizeSettingsAiModalClose();
        state.settingsAiModal = null;
        render();
        return;
      }
      if (state.resumeDraftModal) {
        event.preventDefault();
        state.resumeDraftModal = null;
        render();
        return;
      }
      if (state.closeComposeModal) {
        event.preventDefault();
        state.closeComposeModal = null;
        render();
        return;
      }
      if (state.searchModalOpen) {
        event.preventDefault();
        closeSearchModal();
        return;
      }
      if (state.quoteFoldModal) {
        state.quoteFoldModal = null;
        event.preventDefault();
        render();
        return;
      }
      if (state.threadTagsModalOpen) {
        state.threadTagsModalOpen = false;
        event.preventDefault();
        render();
        return;
      }
      if (navCanGoBack() || state.view !== "list") {
        event.preventDefault();
        if (state.view === "thread") clearThreadAiSummaryState();
        void goBack();
        return;
      }
      if (state.aiOpen || state.aiQuickPanelOpen || state.mailboxDigestPanelOpen) {
        event.preventDefault();
        state.aiOpen = false;
        state.aiQuickPanelOpen = false;
        if (mailboxDigestSlotInList()) dismissMailboxDigestPanel();
        render();
        return;
      }
      return;
    }
    if (isEditableKeyboardTarget(event.target)) return;
    if (singleKeyShortcutsBlocked()) return;
    if (!keyboardPlainKey(event)) return;

    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      void handleAction("compose");
      return;
    }
    if (key === "r" && state.view === "thread") {
      event.preventDefault();
      void handleAction("reply");
      return;
    }
    if (key === "s" && state.view === "thread") {
      event.preventDefault();
      void handleAction("summarize");
      return;
    }
    if (key === "t" && state.view === "thread") {
      event.preventDefault();
      void handleAction("llm-translate-thread");
      return;
    }
    if (key === "m" && state.view === "compose") {
      event.preventDefault();
      void handleAction("toggle-preview");
      return;
    }
    if (key === "tab" && state.view === "thread") {
      event.preventDefault();
      void handleAction("toggle-ai");
      return;
    }
    if (key === "/") {
      event.preventDefault();
      if (state.view === "thread") clearThreadAiSummaryState();
      state.view = "list";
      render();
      const inboxSearch = document.querySelector<HTMLInputElement>("#search-input");
      if (inboxSearch) inboxSearch.focus();
      else openSearchModal();
    }
  });
}

function fallbackStatus(): AppStatus {
  return {
    appName: "RustyMail",
    version: "0.1.1",
    walEnabled: true,
    vaultKeyLocation: "OS Keyring",
    aiRuntime: "ONNX + whisper.cpp"
  };
}

function fallbackCapabilities(): AppCapabilities {
  return {
    mailCore: true,
    readabilityModules: true,
    aiModules: true,
    dictation: false,
    storage: "browser fallback"
  };
}

function normalizeCapabilities(raw: unknown): AppCapabilities {
  const fb = fallbackCapabilities();
  if (!raw || typeof raw !== "object") return fb;
  const r = raw as Record<string, unknown>;
  const pickBool = (camel: keyof AppCapabilities, snake: string, fallback: boolean): boolean => {
    const v = r[camel] ?? r[snake];
    return typeof v === "boolean" ? v : fallback;
  };
  const storageRaw = r.storage;
  return {
    mailCore: pickBool("mailCore", "mail_core", fb.mailCore),
    readabilityModules: pickBool("readabilityModules", "readability_modules", fb.readabilityModules),
    aiModules: pickBool("aiModules", "ai_modules", fb.aiModules),
    dictation: pickBool("dictation", "dictation", fb.dictation),
    storage: typeof storageRaw === "string" && storageRaw.trim() ? storageRaw : fb.storage
  };
}

function render() {
  syncMailboxDigestPanelWithFeaturePref();
  if (state.view === "settings" && state.settingsTab === "accounts") {
    captureAccountsFormIdentityFromDom(skipAccountIdentityCaptureOnce);
    if (skipAccountIdentityCaptureOnce) {
      skipAccountIdentityCaptureOnce = false;
    }
  } else {
    captureAccountsFormIdentityFromDom(true);
  }

  // Preserve scroll positions across full re-render (appShell.innerHTML rebuilds DOM).
  const prevFolderList = document.querySelector<HTMLElement>(".folder-list");
  const prevSidebarScrollTop = prevFolderList?.scrollTop ?? 0;
  const prevSidebarScrollLeft = prevFolderList?.scrollLeft ?? 0;
  const prevOrgPanel = document.querySelector<HTMLElement>(".organization-panel");
  const prevOrgScrollTop = prevOrgPanel?.scrollTop ?? 0;
  const prevAiModalBody = state.settingsAiModal
    ? document.querySelector<HTMLElement>(".settings-ai-modal-body")
    : null;
  const prevAiModalScrollTop = prevAiModalBody?.scrollTop ?? 0;

  const isCompose = state.view === "compose";
  const aiPanelExpanded = aiSidePanelExpandedForShell();
  appShell.className = `app-shell ${aiPanelExpanded ? "" : "ai-collapsed"}${isCompose ? " compose-fullscreen-active" : ""}${
    !isCompose && state.sidebarCollapsed ? " sidebar-collapsed" : ""
  }`;
  const panelW =
    typeof state.appPrefs.ai.aiPanelWidthPx === "number" && Number.isFinite(state.appPrefs.ai.aiPanelWidthPx) ?
      Math.min(640, Math.max(260, Math.round(state.appPrefs.ai.aiPanelWidthPx)))
    : 340;
  appShell.style.setProperty("--ai-width", aiPanelExpanded ? `${panelW}px` : "0px");
  appShell.innerHTML = `
    <div class="noise"></div>
    ${
      isCompose ?
        `
    ${renderComposer()}
    `
      : `
    ${renderSidebar()}
    <main class="main">${
      !isCompose && state.sidebarCollapsed ?
        `<button type="button" class="main-sidebar-reveal" data-action="toggle-sidebar" aria-label="Afficher le menu des dossiers" title="Menu">☰</button>`
      : ""
    }${renderMain()}</main>
    ${aiPanelExpanded ? renderAiPanel() : ""}
    `
    }
    ${renderMoveDialog()}
    ${renderMailboxManageDialog()}
    ${renderQuoteFoldDialog()}
    ${renderThreadTagsDialog()}
    ${renderCloseComposeDialog()}
    ${renderResumeDraftDialog()}
    ${renderImageDialog()}
    ${renderSplitSendDialog()}
    ${renderTextPromptModal()}
    ${renderConfirmModal()}
    ${renderSearchModal()}
    ${renderSettingsAiModal()}
    ${renderAiQuickPanelOverlay()}
    ${renderGlobalStatusFooter()}
  `;
  wireEvents();
  wireFolderManagerDnD();
  if (isTextPromptOpen()) {
    window.requestAnimationFrame(() => {
      const inp = document.querySelector<HTMLInputElement>("#text-prompt-input");
      if (inp) {
        inp.focus();
        inp.select();
      }
    });
  }
  if (state.searchModalOpen && !isTextPromptOpen()) {
    window.requestAnimationFrame(() => {
      const inp = document.querySelector<HTMLInputElement>("#search-modal-input");
      if (!inp) return;
      inp.focus();
      const len = state.searchDraft.length;
      try {
        inp.setSelectionRange(len, len);
      } catch {
        /* type=search */
      }
    });
  }

  // Restore sidebar scroll after wiring events/layout.
  const nextFolderList = document.querySelector<HTMLElement>(".folder-list");
  if (nextFolderList) {
    nextFolderList.scrollTop = prevSidebarScrollTop;
    nextFolderList.scrollLeft = prevSidebarScrollLeft;
  }
  const nextOrgPanel = document.querySelector<HTMLElement>(".organization-panel");
  if (nextOrgPanel && prevOrgScrollTop > 0) {
    nextOrgPanel.scrollTop = prevOrgScrollTop;
  }
  const nextAiModalBody = state.settingsAiModal
    ? document.querySelector<HTMLElement>(".settings-ai-modal-body")
    : null;
  if (nextAiModalBody && prevAiModalScrollTop > 0) {
    nextAiModalBody.scrollTop = prevAiModalScrollTop;
  }
  window.requestAnimationFrame(() => {
    navApplyPendingScrollRestore();
    if (nextOrgPanel && prevOrgScrollTop > 0) {
      nextOrgPanel.scrollTop = prevOrgScrollTop;
    }
    if (nextAiModalBody && prevAiModalScrollTop > 0) {
      nextAiModalBody.scrollTop = prevAiModalScrollTop;
    }
  });
}






const composeInteractionsAbortRef = {
  get current() {
    return composeInteractionsAbort;
  },
  set current(v: AbortController | undefined) {
    composeInteractionsAbort = v;
  },
};

const skipAccountIdentityCaptureOnceRef = {
  get current() {
    return skipAccountIdentityCaptureOnce;
  },
  set current(v: boolean) {
    skipAccountIdentityCaptureOnce = v;
  },
};

const addressBookEditEmailRef = {
  get current() {
    return addressBookEditEmail;
  },
  set current(v: string | null) {
    addressBookEditEmail = v;
  },
};

registerWireEventsContext({
  addressBookRowsCache: getAddressBookRowsCache,
  skipAccountIdentityCaptureOnceRef,
  addressBookEditEmailRef,
  AI_PREFS_IMMEDIATE_CHECKBOX_IDS,
  composeInteractionsAbortRef,
});

registerRender(render);

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
  addressBookEditEmail: () => addressBookEditEmail,
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
  discoverMailServersAction,
  finishOAuthNewAccountAfterLogin,
  deleteSettingsAccount,
});

registerFolderManagerRunDeps({ loadMailView });
registerOrgApplyRunDeps({ loadMailView });
registerOrgV2ApplyRunDeps({ loadMailView });

registerMailContentWireActionsDeps({
  onAttachmentAction,
});

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

registerAccountWireActionsDeps({
  saveAccount,
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
