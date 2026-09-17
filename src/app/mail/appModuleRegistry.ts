/** Wires mail/UI module deps at startup — extracted from application.ts */
import { cancelActiveLlmStreamJob } from "../../llmStream";
import { navPop } from "../../navigation";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { state } from "../state";
import { getAddressBookRowsCache } from "./addressBookListState";
import { registerAppShellWireContext } from "./appShellRender";
import { registerAppRenderDeps } from "./appRenderRegistry";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import { openContactDetailView } from "./addressBookWireActions";
import { registerAppNavigationStackDeps } from "./appNavigationStack";
import { composeChipsHandle } from "./composeRecipientChipsWire";
import {
  clearDraftRevisionDebounceTimer,
  flushDraftRevisionPending as flushDraftRevisionPendingNow,
  registerComposeDraftRevisionAutosaveDeps,
} from "./composeDraftRevisionAutosave";
import { composeDraftHasMeaningfulContent } from "./composeDraftSession";
import { registerComposeDraftPreviewDeps } from "./composeDraftPreview";
import { registerComposeDraftRevisionDiffDeps } from "./composeDraftRevisionDiff";
import {
  registerComposeDraftLocalSaveDeps,
  saveDraftRevisionNow,
} from "./composeDraftLocalSave";
import {
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  computePreview,
  scheduleDraftRevisionSave,
} from "./composeComposerBridge";
import { registerComposePickAttachmentsDeps } from "./composePickAttachments";
import { registerComposeSendDraftRunDeps } from "./composeSendDraftRun";
import { clearDraftSession, registerComposeCloseFlowDeps } from "./composeCloseFlow";
import { registerComposeAttachmentsActionDeps } from "./composeAttachmentsAction";
import { registerCycleComposeLayoutDeps } from "./cycleComposeLayout";
import { enterComposeView } from "./composeViewWireActions";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import { registerComposeThreadReplyDeps } from "./composeThreadReply";
import { persistDraft } from "./composePersistDraft";
import { syncPreviewOpenFromComposeLayout } from "./composeLayoutState";
import { registerEmptyTrashMailboxDeps } from "./emptyTrashMailbox";
import { fmSelectMailbox, refreshFolderManagerTree } from "./orgFolderWireActions";
import { registerFolderManagerRunDeps } from "./folderManagerActions";
import {
  abortIdleAiCachePrefetchInFlight,
  initIdleAiCachePrefetch,
} from "./idleAiCachePrefetch";
import { initMailboxDigest } from "./mailboxDigest";
import {
  loadMailView,
  loadMailboxUnread,
  loadThreadsForSearchContext,
  registerMailListDeps,
} from "./mailListView";
import { threadsVisibleInList } from "./mailListThreadFilter";
import { registerMailboxManageActionDeps } from "./mailboxManageAction";
import { registerBulkTrashListDeps } from "./bulkTrashList";
import { openThread, registerOpenThreadDeps } from "./openThreadView";
import { registerOrgApplyRunDeps } from "./orgApplyRun";
import { registerOrgV2ApplyRunDeps } from "./orgV2ApplyRun";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";
import { abortLlmQueueJob, withLlmQueue } from "./llmJobQueue";
import { registerLlmQueueCancelDeps } from "./llmQueueCancel";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { openSavedDraftById } from "./savedDraftOpenRun";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { refreshSavedSearches, refreshSuggestedSavedViews } from "./savedSearchViews";
import { refreshSearchTagCatalog } from "./searchTagCatalog";
import { searchDraftDiffersFromCommitted } from "./searchCommitQuery";
import {
  isSearchActive,
  searchQueryUsesThreadsApi,
  usesSearchContextLoader,
} from "./searchQueryContext";
import { registerSearchAtAutocompleteWireDeps } from "./searchAtAutocompleteWire";
import { registerSearchBarUiDeps } from "./searchBarUi";
import { registerSearchCommitDeps } from "./searchCommitQuery";
import { registerSearchLaunchDeps } from "./searchLaunchQueries";
import { registerSearchViewBatchDeps } from "./searchViewBatch";
import { activeSavedSearchItem, registerSearchViewContextDeps } from "./searchViewContext";
import { searchThreads } from "./searchThreadsRun";
import { registerSettingsWireActionsDeps } from "./settingsWireActions";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";
import { sanitizeEmailHtml } from "./mailEmailHtmlSanitize";
import { sortMessagesByReceivedDescending, formatThreadReadingWhen } from "./threadMessageSort";
import { scheduleSecurityLlmAugment } from "./mailSecurityDisplay";
import {
  hydrateMessageTranslationsFromCacheForThread,
  isSenderBatchSummarizeActive,
  summarizeThread,
  summarizeThreadCore,
  translateThreadCore,
} from "./threadAiRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { threadAiSummaryScoped } from "./threadAiStreamDom";
import { threadIsAutoMail } from "./threadAutoMail";
import { langFromKindTags } from "./threadLangGuess";
import { normalizeIso639Primary } from "./threadLangGuessSamples";
import { registerThreadScrollToMessageDeps } from "./threadScrollToMessage";
import { sourceMailboxForThread, registerThreadListActionsDeps } from "./threadListActions";
import { syncActivityRecordingPrefs } from "./threadActivityTracking";
import { stopAgentTelemetry } from "./agentWireActions";
import { registerSwitchActiveAccountDeps } from "./switchActiveAccountAction";
import { registerSwitchMailboxRunDeps } from "./switchMailboxAction";
import { startNewDraftSession } from "./composeDraftSession";
import { threadReadingIsSimpleLayout } from "./threadShellLayout";

let autoThreadSummaryDoneFor: string | null = null;

async function flushDraftRevisionPending(): Promise<void> {
  await flushDraftRevisionPendingNow(
    () => state.view === "compose" && Boolean(state.draft && state.draftSessionId),
  );
}

export function registerAllAppModules(): void {
  registerAppShellWireContext(getAddressBookRowsCache);
  registerAppRenderDeps();

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
