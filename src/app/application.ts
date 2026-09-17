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
import { bindDraftPersistenceFlush, bindKeyboard, bindMouseNavigation } from "./mail/appShellBindings";
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
