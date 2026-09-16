import { invoke } from "@tauri-apps/api/core";

import { listen, TauriEvent } from "@tauri-apps/api/event";

import { getCurrentWebview } from "@tauri-apps/api/webview";

import DOMPurify from "dompurify";

import { ipcThrottleMs, invokeAiCacheGet } from "../ipc_bridge";

import {
  clearThreadsRecentlyRemoved,
  filterRecentlyRemovedThreads,
  markThreadsRecentlyRemoved,
} from "../recentlyRemovedThreads";

import {
  collapseLargeDataImageMarkdown,
  expandInlineImagePlaceholders,
} from "../composeMarkdownImages";

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
  SYNC_MAILBOXES_BATCH_SIZE,
  chunkStringList,
  mergeSyncMailboxesOutcomes,
  syncInvokeTimeoutMs as syncInvokeTimeoutMsFor,
  type SyncMailboxesOutcome,
} from "../imapSyncTypes";

import { notifyImapWatchFocusedMailbox as notifyImapWatchFocusedMailboxCore } from "../imapWatchFocus";

import { mergeServerThreadPage } from "../mailListPage";

import { appendQuotedMessageToDraft } from "../composeQuote";

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

import { utf8StringToBase64, base64ToUtf8String, mailHtmlMountAttrs, flattenNestedParagraphInDocument, base64ToImageBlob } from "./lib/htmlMessage";

import { composeRewriteStyleFromTone, toneLabelsFr, tones } from "./core/composeTone";
import {
  DEFAULT_INVOKE_TIMEOUT_MS,
  BOOT_INVOKE_TIMEOUT_MS,
  ACCOUNTS_BOOT_TIMEOUT_MS,
  ACCOUNT_INVOKE_TIMEOUT_MS,
  OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
  OAUTH_LOOPBACK_DEFAULT_PORT,
  SYNC_INVOKE_TIMEOUT_MS,
  MAIL_ACTION_TIMEOUT_MS,
  LLM_INVOKE_TIMEOUT_MS,
  AI_CACHE_PROMPT_REVISION,
} from "./core/timeouts";
import { isTauriRuntime } from "./lib/tauriRuntime";
import { safeInvoke, tauriErrorMessage, withTimeout } from "./lib/tauriCommand";
import {
  DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY,
  ENABLE_CLEAN_MESSAGE_VIEW,
  LIST_FILTER_VALUES,
  defaultListFilterFromRaw,
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
import { mailboxLogicalPathKey } from "./mail/mailboxPathKeys";
import {
  folderManagerPanelMailbox,
  listMailboxForPanel,
  listThreadsPayload,
} from "./mail/mailboxPanelContext";
import {
  applyListFilter,
  loadMailView,
  loadMailboxUnread,
  registerMailListDeps,
  reloadCurrentThreadList,
} from "./mail/mailListView";
import { fetchOpenThreadOrNotify } from "./mail/fetchOpenThread";
import { openThread, registerOpenThreadDeps } from "./mail/openThreadView";
import {
  buildSearchQueryFromCurrentState,
  registerSearchQueryContext,
  searchAccountIdForQuery,
} from "./mail/searchQueryContext";
import { registerSearchThreadsRunDeps, searchThreads } from "./mail/searchThreadsRun";
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
import { SAVED_VIEW_BATCH_MAX } from "./lib/savedViewBatch";
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
import { registerWireEventsBridge } from "./ui/wireEventsBridge";
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
  renderSearchBadgesHtml,
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

import { attachAtAutocomplete } from "../atAutocomplete";

import { attachHashAutocomplete, isHashAutocompletePanelOpen, type InboxFilterHit } from "../hashAutocomplete";

import { isAtAutocompletePanelOpen } from "../atAutocomplete";

import { parseSearchBarDraft } from "../searchBarParse";

import {
  applyNlSearchQueryToState,
  extractNlSearchFallbackText,
  parsedSearchBarHasModifiers,
  hasCommittedSearchCriteria,
  hasSavableSearchCriteria,
  resetSearchStructuralState,
  searchCriteriaSnapshotsEqual,
  snapshotFromStructuralState,
  type SearchCriteriaSnapshot,
  type SearchStructuralState,
} from "../searchQueryState";

import { buildSearchQueryPayload } from "../searchQueryBuild";

import { recordSearchHistory } from "../searchHistory";

import {
  applySavedSearchToState,
  buildSavedSearchUiState,
  buildSavedSearchUpsert,
} from "../savedSearchApply";

import {
  applySavedSearchCmd,
  deleteSavedSearchCmd,
  listSavedSearchesCmd,
  markSavedSearchSeenCmd,
  upsertSavedSearchCmd,
  type SavedSearchListItem,
} from "../savedSearches";

import {
  clearSuggestionShownKeys,
  dismissViewSuggestionCmd,
  flushActivityQueue,
  listSuggestedSavedViewsCmd,
  markSuggestionShownOnce,
  recordActivity,
  recordActivityImmediate,
  setActivityAccountId,
  setActivityRecordingEnabled,
  type SuggestedSavedView,
} from "../activity";

import {
  mountComposeRecipientChips,
  type ComposeRecipientChipsHandle,
  type ComposeRecipientField,
  type RecipientChip,
} from "../composeRecipientChips";

import {
  type AiFeatureKey,
  isAiFeatureEnabled,
  setAllAiFeatures,
} from "../aiFeatures";

import {
  applyEngineConnectionMode,
  engineConnectionMode,
  isSettingsAiModalId,
  LLM_CONTEXT_PRESETS,
  normalizeSettingsAiModalId,
  type SettingsAiModalId,
  type SettingsAiPanelDeps,
} from "../settingsAiPanel";

import { captureAiPrefsFieldsFromDom, syncLlmEnginePrefsToDom, captureAiFeatureTogglesFromDom, persistAiFeaturePrefs } from "../aiPrefsPersist";

import {
  getAssistSkillUi,
  assistModeLabel,
  assistPhaseForSkill,
  assistSafetyFlagLabel,
  assistSkillLabel,
  assistStepLabel,
  bindAssistTelemetry,
  buildAssistPayload,
  defaultEnabledSkillIds,
  type AssistFactsSnapshot,
  type AssistRecommendation,
  type AssistResult,
  type AssistRoutingPlan,
  type AssistRunStep,
  type AssistMode,
  type AssistSkillId,
} from "../assistAgent";

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
  isDescendantMailboxPath,
  loadFolderTreeExpanded,
  saveFolderTreeExpanded,
  splitMailboxSegments,
} from "../mailboxTree";

import { state } from "./state";

import { registerRender } from "./dispatch";

import { root as appShell } from "./dom";

import type { View, Tone, Tag, Entity, ThreadListItem, Draft, DraftPreview, DraftRevisionListItem, DraftDiffLine, DraftCompareView, MicDictationTarget, MessageViewMode, ComposeLayout, MicState, MailSecuritySignals, CleanedMessageView, DiscussionThreadView, AppStatus, AppPathsView, AppCapabilities, LlmRuntimeStatus, NewsletterRuleRow, InboxFilterCounts, ActionBriefResult, CloseComposeModal, ResumeDraftModal, OrphanDraftSessionItem, State, SearchViewBatchJob, MailboxFolderStatsRow, SavedDraftListItem, SemanticEmbeddingCountsSnapshot, FluxAffinerResult, MailUnsubscribeLink, SplitPlan, InlineAttachPayload, ThreadParticipantLink, ThreadRecipientPresenceEvents, TextPromptModalSpec, ConfirmModalSpec, NavigateOpts, OAuthDesktopLoginOutcome, SummaryResult, ActionBriefEvidenceLink, AddressBookRow, ShortcutRow, SavedDraftOpenPayload, SendDraftOutcome, SplitSendResult, LlmTranslationResult, MicActionOpts } from "./types";

let llmQueueAbort: AbortController | null = null;

let composeChipsTo: ComposeRecipientChipsHandle | null = null;

let composeChipsCc: ComposeRecipientChipsHandle | null = null;

let composeChipsBcc: ComposeRecipientChipsHandle | null = null;

const composeRecipientPendingInput: Partial<Record<ComposeRecipientField, string>> = {};

let atAutocompleteDetach: (() => void) | null = null;

let hashAutocompleteDetach: (() => void) | null = null;

let addressBookListQuery = "";

let addressBookEditEmail: string | null = null;

let securityLlmAugmentBusy: Record<string, boolean> = {};

const securityLlmAugmentCache: Record<string, MailSecuritySignals> = {};

const securityLlmAugmentFailed: Record<string, boolean> = {};

let autoThreadSummaryDoneFor: string | null = null;

let senderBatchSummarizeAbort: AbortController | null = null;

let senderBatchSummarizeActive = false;

const ATTACH_PATH_FIELD_SEP = "\u001f";

function attachmentPathsJoinedForHiddenField(paths: string[]): string {
  return paths.join(ATTACH_PATH_FIELD_SEP);
}

function draftPayloadForRust(d: Draft): Draft {
  const pathsRaw = Array.isArray(d.attachmentPaths) ? d.attachmentPaths : [];
  const attachmentPaths = Array.from(new Set(pathsRaw.map((p) => p.trim()).filter(Boolean)));
  return {
    id: d.id ?? "draft-local",
    kind: d.kind ?? "New",
    to: [...(d.to ?? [])],
    cc: [...(d.cc ?? [])],
    bcc: [...(d.bcc ?? [])],
    subject: d.subject ?? "",
    markdownBody: d.markdownBody ?? "",
    sendHtml: d.sendHtml !== false,
    inReplyTo: d.inReplyTo ?? null,
    references: [...(d.references ?? [])],
    attachmentPaths,
    threadId: d.threadId ?? null,
  };
}

async function rewriteDictatedSegmentWithTone(raw: string): Promise<string> {
  const t = raw.trim();
  if (!t || !isTauriRuntime() || state.view !== "compose") return raw;
  if (!state.appPrefs.ai.dictationRewriteWithStyle) return raw;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled")) return raw;
  try {
    const style = composeRewriteStyleFromTone();
    const res = await withTimeout(
      invoke<{ text: string }>("llm_rewrite_compose", { text: t, style }),
      LLM_INVOKE_TIMEOUT_MS
    );
    const out = (res.text ?? "").trim();
    return out.length ? out : raw;
  } catch {
    toast("Réécriture du texte dicté indisponible (porte LLM fermée ou erreur réseau) — transcription brute conservée.");
    return raw;
  }
}


let threadActivityOpen: {
  threadId: string;
  startedAt: number;
  sender?: string;
  mailbox?: string;
} | null = null;

function activityTrackingEnabled(): boolean {
  return state.appPrefs.general.activitySuggestionsEnabled !== false;
}

function syncActivityRecordingPrefs(): void {
  const acc = currentAccount()?.id?.trim() ?? null;
  setActivityAccountId(acc);
  setActivityRecordingEnabled(activityTrackingEnabled() && Boolean(acc));
}

function flushThreadActivityClosed(): void {
  if (!threadActivityOpen || !activityTrackingEnabled()) {
    threadActivityOpen = null;
    return;
  }
  const durationMs = Math.max(0, Date.now() - threadActivityOpen.startedAt);
  recordActivity({
    eventType: "thread_closed",
    threadId: threadActivityOpen.threadId,
    senderEmail: threadActivityOpen.sender ?? null,
    mailbox: threadActivityOpen.mailbox ?? null,
    durationMs,
  });
  threadActivityOpen = null;
}

function startThreadActivityOpen(threadId: string): void {
  if (!activityTrackingEnabled()) return;
  flushThreadActivityClosed();
  const row = state.threads.find((t) => String(t.id) === String(threadId));
  const sender = row?.participants[0]?.trim() || "";
  threadActivityOpen = {
    threadId: String(threadId),
    startedAt: Date.now(),
    sender: sender || undefined,
    mailbox: row?.mailbox,
  };
  recordActivity({
    eventType: "thread_opened",
    threadId: String(threadId),
    senderEmail: sender || null,
    mailbox: row?.mailbox ?? null,
  });
}

async function refreshSuggestedSavedViews(): Promise<void> {
  if (!isTauriRuntime() || !activityTrackingEnabled()) {
    state.suggestedSavedViews = [];
    clearSuggestionShownKeys();
    return;
  }
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    state.suggestedSavedViews = [];
    clearSuggestionShownKeys();
    return;
  }
  try {
    state.suggestedSavedViews = await listSuggestedSavedViewsCmd(accountId);
    for (const s of state.suggestedSavedViews) {
      markSuggestionShownOnce(`${accountId}:${s.senderEmail}`, () => {
        recordActivity({
          eventType: "suggestion_shown",
          senderEmail: s.senderEmail,
          metaJson: JSON.stringify({ cardKind: "saved_view" }),
        });
      });
    }
  } catch (e) {
    console.warn("list_suggested_saved_views", e);
    state.suggestedSavedViews = [];
  }
}

function recordSearchCommittedActivity(): void {
  if (!activityTrackingEnabled()) return;
  recordActivity({
    eventType: "search_committed",
    senderEmail: state.searchSenders[0] ?? null,
    metaJson: JSON.stringify({
      text: state.search.trim().slice(0, 120),
      senders: state.searchSenders,
    }),
  });
}

async function acceptSuggestedSavedView(senderEmail: string): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  const item = state.suggestedSavedViews.find(
    (s) => s.senderEmail.toLowerCase() === senderEmail.trim().toLowerCase(),
  );
  if (!item) return;
  recordActivityImmediate({
    eventType: "suggestion_clicked",
    senderEmail: item.senderEmail,
    metaJson: JSON.stringify({ cardKind: "saved_view", action: "accept" }),
  });
  const query = buildSearchQueryPayload({
    search: `@${item.senderEmail}`,
    searchTags: [],
    searchSenders: [item.senderEmail],
    searchNlMode: null,
    searchLanguageFilter: null,
    accountId,
    mailbox: null,
    semanticSearchEnabled: Boolean(state.appPrefs.ai?.semanticSearchEnabled),
    semanticModelAvailable: Boolean(state.semanticModelAvailable),
  });
  const ui = buildSavedSearchUiState({
    listFilter: "all",
    searchScope: "account",
    searchNlMode: null,
    searchDraft: `@${item.senderEmail}`,
    searchNewsletterRule: null,
    searchModifiersTouched: true,
  });
  try {
    const saved = await upsertSavedSearchCmd(
      buildSavedSearchUpsert(accountId, item.suggestedName, query, ui),
    );
    await dismissViewSuggestionCmd(accountId, item.senderEmail, "accepted");
    state.activeSavedSearchId = saved.id;
    toast(`Vue « ${item.suggestedName} » enregistrée.`);
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function dismissSuggestedSavedView(
  senderEmail: string,
  decision: "dismiss" | "snooze",
): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  recordActivityImmediate({
    eventType: "suggestion_clicked",
    senderEmail,
    metaJson: JSON.stringify({ cardKind: "saved_view", action: decision }),
  });
  try {
    await dismissViewSuggestionCmd(accountId, senderEmail, decision);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

function applyServerThreadPage(page: ThreadListItem[], append: boolean): void {
  const { threads, threadOffsetReset } = mergeServerThreadPage(state.threads, page, append);
  state.threads = threads;
  if (threadOffsetReset) state.threadOffset = 0;
}

let llmIdlePrefetchAfterBootScheduled = false;

const SIDEBAR_COLLAPSED_STORAGE_KEY = "rustymail.sidebarCollapsed";

let subscribedLlmPrefetchProgress = false;

let subscribedModelBootstrapProgress = false;

let skipAccountIdentityCaptureOnce = false;

let accountsFormIdentityScratch: { displayName: string; email: string } | undefined;

function readSidebarCollapsedPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarCollapsedPreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* navigation privée, quota, etc. */
  }
}

async function refreshSettingsPathsFromBackend(): Promise<void> {
  if (!isTauriRuntime()) return;
  state.settingsPathsLoadError = "";
  try {
    state.lastAppPaths = await withTimeout(invoke<AppPathsView>("app_paths", {}), BOOT_INVOKE_TIMEOUT_MS);
  } catch (e) {
    state.lastAppPaths = null;
    state.settingsPathsLoadError = tauriErrorMessage(e);
  }
  render();
}

function threadMessageAnchorId(messageId: string, index: number): string {
  const raw = messageId.trim();
  const tail = raw ? encodeURIComponent(raw).replace(/%/g, "_") : "empty";
  const base = `msg-${index}-${tail}`;
  return base.length > 240 ? base.slice(0, 240) : base;
}

function currentThreadIdForReply(): string | undefined {
  const a = state.selectedThreadId?.trim();
  if (a) return a;
  const b = state.threads[0]?.id;
  return b ? String(b) : undefined;
}

function syncPreviewOpenFromComposeLayout() {
  state.previewOpen = state.composeLayout !== "write";
}

function newDraftSessionId(): string {
  const anyCrypto = (globalThis as any).crypto as Crypto | undefined;
  const gen = anyCrypto?.randomUUID?.bind(anyCrypto);
  if (gen) return String(gen());
  return `ds-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function startNewDraftSession() {
  state.draftSessionId = newDraftSessionId();
  state.savedDraftRecordId = null;
  state.draftRevisionsLoading = false;
  state.draftRevisions = [];
  state.draftDiffRevisionId = null;
  state.draftDiffLoading = false;
  state.draftDiffLines = [];
  state.draftDiffView = "preview";
  state.draftDiffOtherBody = "";
  state.draftRevisionPreview = null;
  state.draftVersionsListExpanded = false;
}

function clearDraftSession() {
  state.draftSessionId = null;
  state.savedDraftRecordId = null;
  state.draftRevisionsLoading = false;
  state.draftRevisions = [];
  state.draftDiffRevisionId = null;
  state.draftDiffLoading = false;
  state.draftDiffLines = [];
  state.draftDiffView = "preview";
  state.draftDiffOtherBody = "";
  state.draftRevisionPreview = null;
  state.draftVersionsListExpanded = false;
  if (draftRevisionDebounceTimer !== null) {
    window.clearTimeout(draftRevisionDebounceTimer);
    draftRevisionDebounceTimer = null;
  }
}

function splitLines(input: string): string[] {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

function myersDiffLines(a: string[], b: string[]): DraftDiffLine[] {
  // Myers diff O((N+M)D), returns per-line ops.
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  let v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const kIndex = k + offset;
      const down = k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1]);
      let x = down ? v[kIndex + 1] : v[kIndex - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[kIndex] = x;
      if (x >= n && y >= m) {
        // backtrack
        const out: DraftDiffLine[] = [];
        let curX = n;
        let curY = m;
        for (let curD = d; curD >= 0; curD--) {
          const prevV = trace[curD];
          const curK = curX - curY;
          const curKIndex = curK + offset;
          const prevDown =
            curK === -curD || (curK !== curD && prevV[curKIndex - 1] < prevV[curKIndex + 1]);
          const prevK = prevDown ? curK + 1 : curK - 1;
          const prevX = prevDown ? prevV[prevK + offset] : prevV[prevK + offset] + 1;
          const prevY = prevX - prevK;
          while (curX > prevX && curY > prevY) {
            out.push({ kind: "eq", text: a[curX - 1] });
            curX--;
            curY--;
          }
          if (curD === 0) break;
          if (prevDown) {
            // insertion in b
            out.push({ kind: "add", text: b[curY - 1] });
            curY--;
          } else {
            // deletion from a
            out.push({ kind: "del", text: a[curX - 1] });
            curX--;
          }
        }
        out.reverse();
        return out;
      }
    }
  }
  // Fallback: no diff found (shouldn't happen)
  return [
    ...a.map((t) => ({ kind: "del" as const, text: t })),
    ...b.map((t) => ({ kind: "add" as const, text: t })),
  ];
}

async function computeDraftDiffAgainstRevision(revisionId: string) {
  const rid = revisionId.trim();
  const accountId = currentAccount()?.id?.trim() ?? "";
  if (!isTauriRuntime() || !rid || !accountId) return;
  if (!state.draft) return;
  persistDraft();

  state.draftDiffRevisionId = rid;
  state.draftDiffLoading = true;
  state.draftDiffLines = [];
  state.draftDiffOtherBody = "";
  state.draftRevisionPreview = null;
  render();

  try {
    const other = await withTimeout(
      invoke<Draft | null>("draft_revision_restore", { accountId, revisionId: rid }),
      MAIL_ACTION_TIMEOUT_MS
    );
    if (!other) {
      toast("Cette version n’existe plus.");
      state.draftDiffLoading = false;
      render();
      return;
    }
    const curBody = state.draft.markdownBody ?? "";
    const otherBody = other.markdownBody ?? "";
    state.draftDiffOtherBody = otherBody;
    state.draftRevisionPreview = await safeInvoke<DraftPreview>(
      "preview_draft",
      { markdownBody: otherBody },
      {
        textPlain: otherBody,
        html: `<p>${escapeHtml(otherBody).replace(/\n/g, "<br />")}</p>`,
      }
    );
    const a = splitLines(curBody);
    const b = splitLines(otherBody);
    // Guardrail to avoid UI freeze on extreme cases.
    if (a.length + b.length > 8000) {
      toast("Diff trop volumineux : affichez une version plus courte (limite lignes).");
      state.draftDiffLines = [];
    } else {
      state.draftDiffLines = myersDiffLines(a, b);
    }
  } catch (error) {
    console.error("draft_revision_restore (diff)", error);
    toast(`Diff impossible: ${tauriErrorMessage(error)}`);
  } finally {
    state.draftDiffLoading = false;
    render();
  }
}

async function refreshDraftRevisions(limit = 50) {
  const accountId = currentAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  if (!isTauriRuntime() || !accountId || !sessionId) return;
  state.draftRevisionsLoading = true;
  render();
  try {
    state.draftRevisions = await withTimeout(
      invoke<DraftRevisionListItem[]>("draft_revision_list", { accountId, sessionId, limit }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch (error) {
    console.error("draft_revision_list", error);
    toast(`Impossible de charger l’historique: ${tauriErrorMessage(error)}`);
  } finally {
    state.draftRevisionsLoading = false;
    render();
  }
}

async function saveDraftRevisionNow(): Promise<boolean> {
  const accountId = currentAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  if (!isTauriRuntime() || !accountId || !sessionId) return false;
  if (!state.draft) return false;
  persistDraft();
  try {
    await withTimeout(
      invoke("draft_revision_save", {
        accountId,
        sessionId,
        draft: draftPayloadForRust(state.draft),
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    if (state.composeLayout === "historique") {
      void refreshDraftRevisions(60);
    }
    // Autosave « Sauvés » : le brouillon survit à un crash même sans clic Enregistrer.
    if (composeDraftHasMeaningfulContent()) {
      await upsertSavedDraftSilent();
    }
    return true;
  } catch (error) {
    console.error("draft_revision_save", error);
    toast(`Enregistrement local impossible : ${tauriErrorMessage(error)}`);
    return false;
  }
}

async function upsertSavedDraftSilent(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !state.draftSessionId?.trim() || !state.draft) return false;
  const titleRaw = state.draft.subject?.trim() ?? "";
  const title = titleRaw.length ? titleRaw : "Sans objet";
  try {
    const newId = await withTimeout(
      invoke<string>("saved_draft_upsert", {
        accountId,
        sessionId: state.draftSessionId.trim(),
        title,
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    const tid = newId.trim();
    if (tid.length) state.savedDraftRecordId = tid;
    void refreshSavedDraftsMailboxCount();
    return true;
  } catch (e) {
    console.error("saved_draft_upsert (silent)", e);
    return false;
  }
}

function scheduleDraftRevisionSave(delayMs = DRAFT_REVISION_DEBOUNCE_MS) {
  if (!isTauriRuntime()) return;
  if (!state.draft || !state.draftSessionId) return;
  if (draftRevisionDebounceTimer !== null) {
    window.clearTimeout(draftRevisionDebounceTimer);
  }
  draftRevisionDebounceTimer = window.setTimeout(() => {
    draftRevisionDebounceTimer = null;
    void saveDraftRevisionNow();
  }, Math.max(150, delayMs));
}

async function flushDraftRevisionPending(): Promise<void> {
  if (draftRevisionDebounceTimer !== null) {
    window.clearTimeout(draftRevisionDebounceTimer);
    draftRevisionDebounceTimer = null;
  }
  if (state.view === "compose" && state.draft && state.draftSessionId) {
    await saveDraftRevisionNow();
  }
}

function composeDraftHasMeaningfulContent(): boolean {
  if (!state.draft) return false;
  const d = state.draft;
  if (d.subject.trim()) return true;
  if (d.markdownBody.trim()) return true;
  if (d.to.length > 0 || d.cc.length > 0 || d.bcc.length > 0) return true;
  if ((d.attachmentPaths?.length ?? 0) > 0) return true;
  return false;
}

function pickImapMailboxFallback(): string {
  if (state.mailboxes.includes("INBOX")) return "INBOX";
  const sys = pickSystemMailboxes(state.mailboxes);
  if (sys[0]?.name) return sys[0].name;
  return state.mailboxes[0] ?? "INBOX";
}

async function saveDraftToSavedListNow(opts?: { silentToast?: boolean }): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !state.draftSessionId?.trim() || !state.draft) {
    toast("Impossible d’enregistrer : session ou compte indisponible.");
    return false;
  }
  persistDraft();
  await saveDraftRevisionNow();
  const titleRaw = state.draft.subject?.trim() ?? "";
  const title = titleRaw.length ? titleRaw : "Sans objet";
  try {
    const newId = await withTimeout(
      invoke<string>("saved_draft_upsert", {
        accountId,
        sessionId: state.draftSessionId.trim(),
        title,
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    const tid = newId.trim();
    if (tid.length) state.savedDraftRecordId = tid;
    if (!opts?.silentToast) {
      toast("Enregistré dans « Sauvés ».");
    }
    await refreshSavedDraftsMailboxCount();
    if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
      await loadMailView(false);
    }
    render();
    return true;
  } catch (e) {
    toast(tauriErrorMessage(e));
    return false;
  }
}

async function discardCurrentDraftSession(): Promise<void> {
  if (!isTauriRuntime()) {
    clearDraftSession();
    return;
  }
  const accountId = currentAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  const savedId = state.savedDraftRecordId?.trim() ?? "";
  if (draftRevisionDebounceTimer !== null) {
    window.clearTimeout(draftRevisionDebounceTimer);
    draftRevisionDebounceTimer = null;
  }
  try {
    if (accountId && savedId) {
      await withTimeout(
        invoke("saved_draft_delete", { accountId, savedDraftId: savedId }),
        MAIL_ACTION_TIMEOUT_MS
      );
    } else if (accountId && sessionId) {
      await withTimeout(
        invoke("draft_revision_purge_session", { accountId, sessionId }),
        MAIL_ACTION_TIMEOUT_MS
      );
    }
  } catch (e) {
    console.error("discardCurrentDraftSession", e);
    toast(`Impossible de supprimer le brouillon local : ${tauriErrorMessage(e)}`);
  }
  clearDraftSession();
  void refreshSavedDraftsMailboxCount();
}

async function leaveComposeViewAfterClose(): Promise<void> {
  if (navCanGoBack()) {
    await goBack();
    return;
  }
  state.view = state.selectedThread ? "thread" : "list";
  if (state.view === "thread" && state.selectedThread && threadReadingIsSimpleLayout()) {
    state.aiOpen = true;
  }
  render();
}

async function finalizeCloseComposeFromUser() {
  persistDraft();
  await flushDraftRevisionPending();
  if (
    isTauriRuntime() &&
    currentAccount()?.id?.trim() &&
    state.draftSessionId &&
    state.draft &&
    composeDraftHasMeaningfulContent()
  ) {
    // Autosave déjà fait dans flush ; proposer garder / supprimer.
    state.closeComposeModal = {
      subject: state.draft.subject ?? "",
      hasSavedRecord: Boolean(state.savedDraftRecordId),
    };
    render();
    return;
  }
  // Brouillon vide : nettoyer d’éventuelles révisions vides.
  if (isTauriRuntime() && state.draftSessionId && !state.savedDraftRecordId) {
    const accountId = currentAccount()?.id?.trim() ?? "";
    const sessionId = state.draftSessionId.trim();
    if (accountId && sessionId) {
      void invoke("draft_revision_purge_session", { accountId, sessionId }).catch(() => {});
    }
  }
  state.closeComposeModal = null;
  clearDraftSession();
  await leaveComposeViewAfterClose();
}

async function checkOrphanDraftSessionsOnBoot(): Promise<void> {
  if (!isTauriRuntime()) return;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  try {
    const sessions = await withTimeout(
      invoke<OrphanDraftSessionItem[]>("draft_orphan_sessions_list", { accountId, limit: 10 }),
      BOOT_INVOKE_TIMEOUT_MS
    );
    if (sessions?.length) {
      state.resumeDraftModal = { sessions };
      render();
    }
  } catch (e) {
    console.error("draft_orphan_sessions_list", e);
  }
}

async function resumeOrphanDraftSession(sessionId: string): Promise<void> {
  const sid = sessionId.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!sid || !accountId || !isTauriRuntime()) return;
  try {
    const draft = await withTimeout(
      invoke<Draft>("draft_orphan_session_open", { accountId, sessionId: sid }),
      MAIL_ACTION_TIMEOUT_MS
    );
    state.resumeDraftModal = null;
    startNewDraftSession();
    state.draftSessionId = sid;
    state.draft = draft;
    loadComposeMarkdownIntoEditor(draft.markdownBody ?? "");
    enterComposeView();
    state.composeCcBccOpen = draftHasRecipientsExtra(draft);
    state.composeLayout = "split";
    syncPreviewOpenFromComposeLayout();
    resetMarkdownEditorHistory();
    // Rattache à « Sauvés » pour les prochains crashs.
    await upsertSavedDraftSilent();
    toast("Brouillon repris.");
    render();
    window.setTimeout(() => void computePreview(), 0);
    scheduleDraftRevisionSave(350);
  } catch (e) {
    console.error("draft_orphan_session_open", e);
    toast(`Reprise impossible : ${tauriErrorMessage(e)}`);
  }
}

async function dismissOrphanDraftSession(sessionId: string): Promise<void> {
  const sid = sessionId.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!sid || !accountId || !isTauriRuntime()) return;
  try {
    await withTimeout(
      invoke("draft_revision_purge_session", { accountId, sessionId: sid }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch (e) {
    console.error("purge orphan", e);
  }
  if (state.resumeDraftModal) {
    const next = state.resumeDraftModal.sessions.filter((s) => s.sessionId !== sid);
    state.resumeDraftModal = next.length ? { sessions: next } : null;
  }
  render();
}

function composePreviewPaneActive(): boolean {
  return state.view === "compose" && state.composeLayout !== "write" && state.composeLayout !== "historique";
}

let micTimer: number | undefined;

let micMediaRecorder: MediaRecorder | null = null;

let micChunks: Blob[] = [];

let micStream: MediaStream | null = null;

let micDictationTarget: MicDictationTarget = "compose";

let micPttKeyHeld = false;

let draftRevisionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const DRAFT_REVISION_DEBOUNCE_MS = 1800;

function composePushToTalkTargetCode(): string {
  return (state.appPrefs.ai.whisperPttKeyCode ?? "").trim();
}

function formatWhisperPttKeyLabel(code: string): string {
  const c = code.trim();
  if (!c) return "";
  const labels: Record<string, string> = {
    F8: "F8",
    F9: "F9",
    F10: "F10",
    F11: "F11",
    F12: "F12",
    Pause: "Pause",
    ScrollLock: "Arrêt défil.",
    Insert: "Insertion",
    Backquote: "² / sous Échap (selon clavier)",
  };
  return labels[c] ?? c;
}

function composePushToTalkShortcutLabel(): string {
  return formatWhisperPttKeyLabel(composePushToTalkTargetCode());
}

function pushToTalkKeyMatches(event: KeyboardEvent): boolean {
  const code = composePushToTalkTargetCode();
  if (!code) return false;
  const pttViewOk =
    state.view === "compose" ||
    (state.view === "thread" && isAiFeatureEnabled(state.appPrefs.ai, "featureThreadQaEnabled"));
  if (!pttViewOk) return false;
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  return event.code === code;
}

function micTargetFromView(explicit?: MicDictationTarget): MicDictationTarget {
  if (explicit) return explicit;
  return state.view === "thread" ? "thread-qa" : "compose";
}

function dictationBaseTextForTarget(target: MicDictationTarget): string {
  if (target === "thread-qa") {
    const ta = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
    return ta?.value ?? state.threadQaDraft ?? "";
  }
  return state.composeCanonicalBody || state.draft?.markdownBody || state.composeBody || "";
}

function applyDictationToTarget(text: string, target: MicDictationTarget): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (target === "thread-qa") {
    const ta = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
    const base = (ta?.value ?? state.threadQaDraft).trimEnd();
    const joiner = base.length && !/\s$/.test(base) ? " " : "";
    const next = `${base}${joiner}${trimmed}`;
    state.threadQaDraft = next;
    if (ta) {
      ta.value = next;
      ta.focus();
      const end = next.length;
      ta.setSelectionRange(end, end);
    }
    return;
  }
  const base = dictationBaseTextForTarget("compose").trimEnd();
  const joiner = base.length ? "\n\n" : "";
  loadComposeMarkdownIntoEditor(`${base}${joiner}${trimmed}`);
  if (composePreviewPaneActive()) schedulePreviewUpdate(0);
}

function bindMicPushToTalk() {
  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (!state.appPrefs.ai.dictationEnabled || !isTauriRuntime() || event.repeat) return;
      if (!pushToTalkKeyMatches(event)) return;
      if (state.micState !== "idle") return;
      event.preventDefault();
      micPttKeyHeld = true;
      void micAction({ fromPushToTalk: true, target: micTargetFromView() });
    },
    true
  );
  document.addEventListener(
    "keyup",
    (event: KeyboardEvent) => {
      if (!micPttKeyHeld) return;
      const target = composePushToTalkTargetCode();
      if (!target || event.code !== target) return;
      micPttKeyHeld = false;
      if (state.micState === "recording") {
        event.preventDefault();
        void micAction();
      }
    },
    true
  );
}

async function mediaBlobToWav16kMonoPcm16(blob: Blob): Promise<Uint8Array> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let audioBuf: AudioBuffer;
  try {
    audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    await ctx.close().catch(() => undefined);
  }
  const inRate = audioBuf.sampleRate;
  const inCh = audioBuf.numberOfChannels;
  const inLen = audioBuf.length;
  const mono = new Float32Array(inLen);
  for (let i = 0; i < inLen; i++) {
    let s = 0;
    for (let c = 0; c < inCh; c++) s += audioBuf.getChannelData(c)[i];
    mono[i] = s / inCh;
  }
  const outRate = 16_000;
  const outLen = Math.max(1, Math.floor((inLen * outRate) / inRate));
  const resampled = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = (i * inRate) / outRate;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, inLen - 1);
    const f = pos - i0;
    resampled[i] = mono[i0] * (1 - f) + mono[i1] * f;
  }
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = Math.max(-1, Math.min(1, resampled[i]));
    pcm[i] = x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff);
  }
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let j = 0; j < s.length; j++) view.setUint8(off + j, s.charCodeAt(j));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer));
  return new Uint8Array(buf);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

let previewTimer: number | undefined;

let composerDropAbort: AbortController | undefined;

let composeInteractionsAbort: AbortController | undefined;

let composeDragDepth = 0;

const markdownUndoStack: string[] = [];

const markdownRedoStack: string[] = [];

function composeDisplayToCanonical(display: string): string {
  return expandInlineImagePlaceholders(display, state.composeCanonicalBody || state.draft?.markdownBody || display);
}

function setComposeFromTextareaValue(textareaValue: string) {
  state.composeBody = textareaValue;
  const canonical = composeDisplayToCanonical(textareaValue);
  state.composeCanonicalBody = canonical;
  if (state.draft) state.draft.markdownBody = canonical;
}

function loadComposeMarkdownIntoEditor(markdown: string) {
  state.composeCanonicalBody = markdown;
  state.composeBody = collapseLargeDataImageMarkdown(markdown);
  if (state.draft) state.draft.markdownBody = markdown;
}

function resetMarkdownEditorHistory() {
  markdownUndoStack.length = 0;
  markdownRedoStack.length = 0;
}

function markdownPushToolbarUndoSnapshot(value: string) {
  markdownUndoStack.push(value);
  if (markdownUndoStack.length > 42) markdownUndoStack.shift();
  markdownRedoStack.length = 0;
}

function markdownPopPendingToolbarSnapshot() {
  markdownUndoStack.pop();
}

function applyMarkdownUndoRedo(which: "undo" | "redo") {
  const textarea = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (!textarea) return;
  if (which === "undo") {
    if (!markdownUndoStack.length) return;
    markdownRedoStack.push(textarea.value);
    const prev = markdownUndoStack.pop()!;
    textarea.value = prev;
  } else if (!markdownRedoStack.length) {
    return;
  } else {
    markdownUndoStack.push(textarea.value);
    const next = markdownRedoStack.pop()!;
    textarea.value = next;
  }
  setComposeFromTextareaValue(textarea.value);
  schedulePreviewUpdate();
  textarea.focus();
}

function finalizeMarkdownToolbarEdit(textarea: HTMLTextAreaElement) {
  setComposeFromTextareaValue(textarea.value);
  schedulePreviewUpdate();
}

function markdownExpandSelectedLines(textarea: HTMLTextAreaElement) {
  const value = textarea.value;
  const selA = textarea.selectionStart ?? 0;
  const selB = textarea.selectionEnd ?? 0;
  const lo = Math.min(selA, selB);
  const hi = Math.max(selA, selB);
  const ls = value.lastIndexOf("\n", lo - 1) + 1;
  let le = value.indexOf("\n", hi);
  if (le === -1) le = value.length;
  return { value, ls, le };
}

function markdownToggleBulletLines(textarea: HTMLTextAreaElement, prefix = "- ") {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const allPrefixed =
    lines.length > 0 && lines.every((line) => line.trim() === "" || line.startsWith(prefix));
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    if (allPrefixed && line.startsWith(prefix)) return line.slice(prefix.length);
    return `${prefix}${line}`;
  });
  const replacement = nextLines.join("\n");
  textarea.setRangeText(replacement, ls, le, "end");
}

function markdownToggleNumberedLines(textarea: HTMLTextAreaElement) {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const allPrefixed =
    lines.length > 0 && lines.every((line) => line.trim() === "" || /^\s*\d+\.\s/.test(line));
  const nextLines =
    lines.length && allPrefixed
      ? lines.map((line) => (line.trim() === "" ? line : line.replace(/^\s*\d+\.\s*/, "").trimStart()))
      : lines.map((line, idx) =>
          line.trim() === ""
            ? line
            : `${idx + 1}. ${line.replace(/^\s*\d+\.\s*/, "").trimStart()}`
        );
  textarea.setRangeText(nextLines.join("\n"), ls, le, "end");
}

function markdownToggleBlockquoteLines(textarea: HTMLTextAreaElement) {
  markdownToggleBulletLines(textarea, "> ");
}

function markdownToggleHeadingLines(textarea: HTMLTextAreaElement, level: 1 | 2 | 3 = 2) {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const prefix = `${"#".repeat(level)} `;
  const stripRe = /^(#{1,6})\s+/;
  const allAreSameHeading = lines.length > 0 && lines.every((line) => line.trim() === "" || line.startsWith(prefix));
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    const noHeading = line.replace(stripRe, "");
    return allAreSameHeading ? noHeading : `${prefix}${noHeading}`;
  });
  textarea.setRangeText(nextLines.join("\n"), ls, le, "end");
}

function markdownInsertCodeOrFence(textarea: HTMLTextAreaElement, start: number, end: number, selected: string) {
  if (selected && selected.includes("\n")) {
    const replacement = `\`\`\`\n${selected}\n\`\`\``;
    textarea.setRangeText(replacement, start, end, "end");
  } else {
    wrapSelection(textarea, start, end, "`", "`", selected || "code", { selectInnerWhenEmpty: true });
  }
}

function warnOAuthEphemeralRedirect(outcome: OAuthDesktopLoginOutcome): void {
  if (!outcome.ephemeralRedirect) return;
  const uri = (outcome.redirectUri ?? "").trim();
  toast(
    `OAuth : le port ${OAUTH_LOOPBACK_DEFAULT_PORT} est occupé — redirect éphémère ${uri || "(inconnu)"}. ` +
      `N’utilisez pas ce flux sans ajouter cette URI dans Entra, ou fermez l’autre RustyMail / libérez le port ` +
      `(netstat -ano | findstr :${OAUTH_LOOPBACK_DEFAULT_PORT}).`,
    18_000,
  );
}

function navMailboxSegment(mailbox?: string): string {
  const { label } = threadMailboxListLabel(mailbox ?? state.selectedMailbox);
  return label;
}

function navCurrentBreadcrumbSegment(): string | null {
  switch (state.view) {
    case "list":
      return navMailboxSegment();
    case "thread": {
      const subj = state.selectedThread?.subject?.trim();
      return subj ? (subj.length > 36 ? `${subj.slice(0, 33)}…` : subj) : "Fil";
    }
    case "compose":
      return "Composer";
    case "settings":
      return "Paramètres";
    case "contacts":
      return "Carnet";
    case "contact": {
      const em = state.selectedContactEmail ?? getContactDetail()?.email;
      const name = getContactDetail()?.displayName?.trim();
      return name || em || "Contact";
    }
    case "organization":
      return "Organiser";
    case "organizationV2":
      return "Organiser V2";
    case "folderManager":
      return "Dossiers";
    default:
      return null;
  }
}

async function navigateToBreadcrumbIndex(stackIndex: number): Promise<void> {
  if (stackIndex < 0) {
    navigateToInbox();
    return;
  }
  const target = navJumpToStackIndex(stackIndex, captureCurrentNav());
  if (!target) return;
  await applyNavSnapshot(target);
}

function captureCurrentNav(): NavSnapshot {
  const view = state.view;
  let backLabel = "Boîte de réception";
  let breadcrumb: string[] = ["Boîte"];
  switch (view) {
    case "list":
      backLabel = navMailboxSegment();
      breadcrumb = [navMailboxSegment()];
      break;
    case "thread":
      backLabel = navMailboxSegment();
      breadcrumb = [navMailboxSegment()];
      break;
    case "contacts":
      backLabel = "Carnet";
      breadcrumb = ["Carnet"];
      break;
    case "contact": {
      const name = getContactDetail()?.displayName?.trim() || state.selectedContactEmail || "Contact";
      backLabel = "Contact";
      breadcrumb = ["Carnet", name];
      break;
    }
    case "settings":
      backLabel = "Paramètres";
      breadcrumb = ["Paramètres"];
      break;
    case "organization":
      backLabel = "Organiser";
      breadcrumb = ["Organiser"];
      break;
    case "organizationV2":
      backLabel = "Organiser V2";
      breadcrumb = ["Organiser V2"];
      break;
    case "folderManager": {
      const mb = state.folderManager.selectedMailbox?.trim();
      if (mb) {
        const label = threadMailboxListLabel(mb).label;
        backLabel = label;
        breadcrumb = ["Dossiers", label];
      } else {
        backLabel = "Dossiers";
        breadcrumb = ["Dossiers"];
      }
      break;
    }
    case "compose":
      backLabel = state.selectedThread ? "Fil" : navMailboxSegment();
      breadcrumb =
        state.selectedThread ? ["Fil", "Composer"] : [navMailboxSegment(), "Composer"];
      break;
  }
  return {
    view,
    backLabel,
    breadcrumb,
    selectedThreadId: state.selectedThreadId,
    selectedContactEmail: state.selectedContactEmail,
    settingsTab: state.settingsTab,
    selectedMailbox: state.selectedMailbox,
    search: state.search,
    searchDraft: state.searchDraft,
    searchSenders: [...state.searchSenders],
    listFilter: state.listFilter,
    searchScope: state.searchScope,
    searchNlMode: state.searchNlMode,
    contactsListQuery: getContactsListQuery(),
    contactsKeywordDraft: getContactsKeywordDraft(),
    listScrollY: view === "list" ? readListScrollY() : undefined,
    contactsScrollY: view === "contacts" ? readContactsScrollY() : undefined,
    aiOpen: state.aiOpen,
    folderManagerSelectedMailbox:
      view === "folderManager" ? (state.folderManager.selectedMailbox ?? null) : undefined,
  };
}

function shouldPushNavHistory(from: View, to: View): boolean {
  if (from === to) return false;
  const drill =
    (from === "list" && (to === "thread" || to === "compose" || to === "settings")) ||
    (from === "contacts" && (to === "contact" || to === "thread" || to === "compose")) ||
    (from === "contact" && (to === "thread" || to === "compose")) ||
    (from === "thread" && to === "compose") ||
    (from === "organization" && to === "thread") ||
    (from === "list" && to === "contacts") ||
    (from === "list" && to === "organization") ||
    (from === "list" && to === "folderManager") ||
    (from === "list" && to === "settings");
  return drill;
}

function beginNavigation(to: View, opts?: NavigateOpts): void {
  if (state.view === "thread" && to !== "thread") {
    flushThreadActivityClosed();
  }
  if (opts?.resetStack) navReset();
  else if (!opts?.skipHistory) {
    const from = state.view;
    if (shouldPushNavHistory(from, to)) {
      const snap = captureCurrentNav();
      if (opts?.replaceHistory && navCanGoBack()) {
        navPop();
      }
      navPush(snap);
    }
  }
}

async function applyNavSnapshot(snap: NavSnapshot): Promise<void> {
  navQueueScrollRestore(snap);
  state.selectedMailbox = snap.selectedMailbox ?? state.selectedMailbox;
  if (snap.search !== undefined) state.search = snap.search;
  if (snap.searchDraft !== undefined) state.searchDraft = snap.searchDraft;
  if (snap.searchSenders) state.searchSenders = [...snap.searchSenders];
  if (snap.listFilter) state.listFilter = snap.listFilter;
  if (snap.searchScope) state.searchScope = snap.searchScope;
  if (snap.searchNlMode !== undefined) state.searchNlMode = snap.searchNlMode;
  if (snap.contactsListQuery !== undefined) setContactsListQuery(snap.contactsListQuery);
  if (snap.contactsKeywordDraft !== undefined) setContactsKeywordDraft(snap.contactsKeywordDraft);
  state.aiOpen = Boolean(snap.aiOpen);
  state.selectedContactEmail = snap.selectedContactEmail;
  if (snap.settingsTab) state.settingsTab = snap.settingsTab;

  switch (snap.view) {
    case "list":
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
      clearThreadAiSummaryState();
      render();
      if (
        (snap.search?.trim() ?? "") ||
        (snap.searchSenders?.length ?? 0) > 0 ||
        snap.listFilter !== defaultListFilterFromPrefs()
      ) {
        void searchThreads();
      }
      break;
    case "thread": {
      const tid = snap.selectedThreadId?.trim();
      if (!tid) {
        state.view = "list";
        render();
        break;
      }
      await openThread(tid, { skipHistory: true, preserveAi: snap.aiOpen });
      break;
    }
    case "contacts": {
      state.view = "contacts";
      state.selectedContactEmail = undefined;
      clearContactProfile();
      clearThreadAiSummaryState();
      render();
      const acc = currentAccount();
      if (acc?.id) {
        try {
          await loadContactsList(acc.id, { reset: true, query: snap.contactsListQuery });
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      }
      render();
      break;
    }
    case "contact": {
      const em = snap.selectedContactEmail?.trim();
      if (!em) {
        state.view = "contacts";
        render();
        break;
      }
      await openContactDetailView(em, { skipHistory: true });
      break;
    }
    case "settings":
      state.view = "settings";
      state.settingsTab = snap.settingsTab ?? state.settingsTab;
      clearThreadAiSummaryState();
      render();
      break;
    case "organization":
      state.view = "organization";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      render();
      break;
    case "organizationV2":
      state.view = "organizationV2";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      render();
      break;
    case "folderManager": {
      state.view = "folderManager";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      const mb = snap.folderManagerSelectedMailbox ?? null;
      state.folderManager.selectedMailbox = mb;
      if (!mb) state.threads = [];
      render();
      if (mb) await fmSelectMailbox(mb, { skipHistory: true });
      else await refreshFolderManagerTree();
      break;
    }
    case "compose":
      state.view = "compose";
      render();
      break;
    default:
      state.view = "list";
      render();
  }
  window.requestAnimationFrame(() => {
    navApplyPendingScrollRestore();
  });
}

async function goBack(): Promise<void> {
  const snap = navPop();
  if (!snap) {
    if (state.view === "folderManager" && state.folderManager.selectedMailbox) {
      state.folderManager.selectedMailbox = null;
      state.threads = [];
      render();
      return;
    }
    if (state.view !== "list") {
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
      state.selectedContactEmail = undefined;
      state.aiOpen = false;
      clearThreadAiSummaryState();
      render();
    }
    return;
  }
  navPushForward(captureCurrentNav());
  await applyNavSnapshot(snap);
}

async function goForward(): Promise<void> {
  const snap = navPopForward();
  if (!snap) return;
  navPushBackEntry(captureCurrentNav());
  await applyNavSnapshot(snap);
}

function navigateToInbox(opts?: NavigateOpts): void {
  beginNavigation("list", { resetStack: true, ...opts });
  state.view = "list";
  state.selectedContactEmail = undefined;
  state.selectedThread = undefined;
  state.selectedThreadId = undefined;
  state.aiOpen = false;
  clearThreadAiSummaryState();
  render();
}

function enterComposeView(opts?: { skipHistory?: boolean }): void {
  if (!opts?.skipHistory && state.view !== "compose") beginNavigation("compose");
  state.view = "compose";
  state.aiOpen = false;
}

function cleanThreadListPreview(raw: string): string {
  let s = String(raw ?? "");
  // Retire balises HTML
  s = s.replace(/<[^>]*>/g, " ");
  // Retire blocs CSS courants : `selector{ ... }`
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/[^{]{0,120}\{[^}]{0,600}\}/g, " ");
    if (next === s) break;
    s = next;
  }
  // Normalise espaces
  s = s.replace(/\s+/g, " ").trim();
  // Coupe un peu (la CSS brute explose vite)
  if (s.length > 220) s = `${s.slice(0, 220).trim()}…`;
  return s;
}

async function aiCacheKeySegment(): Promise<string> {
  if (!isTauriRuntime()) return "none";
  try {
    const s = await withTimeout(invoke<string>("ai_cache_llm_segment", {}), BOOT_INVOKE_TIMEOUT_MS);
    return (s ?? "none").trim() || "none";
  } catch {
    return "none";
  }
}

function resolveMailboxInList(mailboxes: string[], selected: string | undefined): string | undefined {
  const sel = String(selected ?? "");
  if (!mailboxes.length) return undefined;
  if (mailboxes.includes(sel)) return sel;
  const nk = sel.normalize("NFC");
  for (const m of mailboxes) {
    if (m.normalize("NFC") === nk) return m;
  }
  const trimmed = sel.trim();
  if (!trimmed) return undefined;
  const trimMatches = mailboxes.filter((m) => m.trim() === trimmed);
  if (trimMatches.length === 1) return trimMatches[0];
  return undefined;
}

function resolveSearchMailboxPath(requested: string): string | null {
  const q = requested.trim();
  if (!q || isSavedDraftsVirtualMailbox(q)) return null;
  const mbs = state.mailboxes;
  const exact = resolveMailboxInList(mbs, q);
  if (exact) return exact;

  const wantKey = mailboxLogicalPathKey(q);
  const keyMatches = mbs.filter((m) => mailboxLogicalPathKey(m) === wantKey);
  if (keyMatches.length === 1) return keyMatches[0];
  if (keyMatches.length > 1) {
    return [...keyMatches].sort((a, b) => b.length - a.length)[0] ?? null;
  }

  const qlc = q.toLowerCase();
  const leafExact = mbs.filter((m) => (m.split("/").pop() ?? m).toLowerCase() === qlc);
  if (leafExact.length === 1) return leafExact[0];

  const partial = mbs.filter((m) => {
    const ml = m.toLowerCase();
    const leaf = (m.split("/").pop() ?? m).toLowerCase();
    return ml === qlc || leaf === qlc || ml.includes(qlc) || leaf.includes(qlc);
  });
  if (partial.length === 1) return partial[0];

  return q;
}

function defaultListFilterFromPrefs(): State["listFilter"] {
  return defaultListFilterFromRaw(state.appPrefs.general.defaultListFilter);
}

function defaultAccountIdFromPrefs(): string | undefined {
  const id = (state.appPrefs.general.defaultAccountId ?? "").trim();
  if (!id) return undefined;
  return state.accounts.some((a) => a.id === id) ? id : undefined;
}

function applyDefaultAccountFromPrefs(): void {
  const pref = defaultAccountIdFromPrefs();
  if (pref) {
    state.selectedAccountId = pref;
    return;
  }
  if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
    state.selectedAccountId = state.accounts[0]?.id;
  }
}

function ensureValidSelectedMailbox(): void {
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox) && isTauriRuntime()) return;
  if (!state.mailboxes.length) return;
  const resolved = resolveMailboxInList(state.mailboxes, state.selectedMailbox);
  if (resolved !== undefined) {
    if (resolved !== state.selectedMailbox) state.selectedMailbox = resolved;
    return;
  }
  state.selectedMailbox =
    preferredInboxMailboxName(state.mailboxes) ?? state.mailboxes[0] ?? "INBOX";
}

function shouldShowDefaultAccountPrompt(): boolean {
  if (!isTauriRuntime() || state.view !== "list") return false;
  if (state.accounts.length < 2) return false;
  if (defaultAccountIdFromPrefs()) return false;
  try {
    if (window.localStorage.getItem(DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY) === "1") return false;
  } catch {
    /* ignore */
  }
  return true;
}

async function persistDefaultAccountId(accountId: string): Promise<void> {
  const id = accountId.trim();
  if (!id || !state.accounts.some((a) => a.id === id)) {
    toast("Compte introuvable.");
    return;
  }
  if (!isTauriRuntime()) return;
  state.appPrefs.general.defaultAccountId = id;
  await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
}

async function switchActiveAccount(accountId: string): Promise<void> {
  const id = accountId.trim();
  if (!id || !state.accounts.some((a) => a.id === id)) return;
  state.selectedAccountId = id;
  state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: id }, [], BOOT_INVOKE_TIMEOUT_MS);
  ensureValidSelectedMailbox();
  state.search = "";
  state.searchDraft = "";
  state.searchNewsletterRule = null;
  state.searchModifiersTouched = false;
  state.activeSavedSearchId = null;
  resetMailboxDigestForNavigation();
  state.listFilter = defaultListFilterFromPrefs();
  await loadMailView(false);
  cancelMailboxDigestLiveDebounce();
  if (mailboxDigestSlotInList()) {
    void enqueueMailboxDigestRefreshWhenIdle(false);
  }
  await loadMailboxUnread();
  await refreshSavedDraftsMailboxCount();
  await loadAddressBookSidebarCount();
  await refreshSavedSearches(true);
  syncActivityRecordingPrefs();
  await refreshSuggestedSavedViews();
  state.selectedThreadId = state.threads[0]?.id;
  state.selectedThread = undefined;
}

function extractAddrSpec(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const lo = t.lastIndexOf("<");
  const gc = t.lastIndexOf(">");
  if (lo !== -1 && gc > lo) {
    let inner = t.slice(lo + 1, gc).trim().replace(/^mailto:/i, "");
    if (inner.includes("@")) return inner;
  }
  const loose = t.match(/[^\s<>,;]+@[^\s<>,;]+/);
  return loose?.[0]?.replace(/[>,;]+$/, "") ?? "";
}

function readNlButtonRule(host: HTMLElement | undefined): string {
  if (!host) return "";
  const fromDs = typeof host.dataset?.rule === "string" ? host.dataset.rule.trim() : "";
  if (fromDs) return fromDs;
  const attr = host.getAttribute("data-rule");
  return typeof attr === "string" ? attr.trim() : "";
}

function normalizeNlRuleInvokeInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (!t.includes("@")) return t.toLowerCase();
  const bare = extractAddrSpec(t) || t;
  return bare.trim().toLowerCase();
}

function hostSuffixMatch(host: string, domain: string): boolean {
  const h = host.trim().toLowerCase();
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  return h === d || h.endsWith(`.${d}`);
}

function newsletterEmailListed(email: string): boolean {
  return firstMatchingNewsletterRule(email) !== null;
}

function canonicalEmailForNlMatch(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const bare = extractAddrSpec(trimmed) || trimmed;
  if (!bare.includes("@")) return null;
  return normalizeNlRuleInvokeInput(bare);
}

function firstMatchingNewsletterRule(email: string): NewsletterRuleRow | null {
  const e = canonicalEmailForNlMatch(email);
  if (!e) return null;
  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1) return null;
  const local = e.slice(0, at);
  const host = e.slice(at + 1);
  for (const r of state.newsletterRules) {
    const d = r.domain.toLowerCase();
    const lp = (r.localPart ?? "*").toLowerCase();
    if (!hostSuffixMatch(host, d)) continue;
    if (lp === "*" || lp === local) return r;
  }
  return null;
}

async function loadNewsletterRules(): Promise<void> {
  if (!isTauriRuntime()) {
    state.newsletterRules = [];
    return;
  }
  try {
    state.newsletterRules = await withTimeout(invoke<NewsletterRuleRow[]>("list_newsletter_rules"), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("list_newsletter_rules", error);
    state.newsletterRules = [];
  }
}

let tauriNativeDragDropUnlisten: (() => void) | undefined;

let tauriNativeFileDropReady = false;

function tauriCurrentWebviewLabel(): string | undefined {
  try {
    const w = window as unknown as {
      __TAURI_INTERNALS__?: { metadata?: { currentWebview?: { label?: string } } };
    };
    const label = w.__TAURI_INTERNALS__?.metadata?.currentWebview?.label;
    return typeof label === "string" && label.trim() ? label.trim() : undefined;
  } catch {
    return undefined;
  }
}

function pathsFromTauriDragPayload(payload: unknown): string[] {
  if (payload === null || typeof payload !== "object") return [];
  const rec = payload as Record<string, unknown>;
  if (!Array.isArray(rec.paths)) return [];
  return rec.paths.map((x) => String(x).trim()).filter(Boolean);
}

function setComposerNativeDragHighlight(on: boolean): void {
  const shell = document.querySelector<HTMLElement>(".composer-mail-shell");
  const composeBody = document.querySelector<HTMLElement>(".composer-body");
  shell?.classList.toggle("composer-mail-shell--drag-over", on);
  composeBody?.classList.toggle("drag-over", on);
}

function applyNativeDroppedFilePaths(dropped: string[]): void {
  if (!dropped.length) return;
  if (state.view !== "compose" || !state.draft) {
    toast(`${dropped.length} fichier(s) détecté(s) — ouvrez le composeur pour les ajouter.`);
    return;
  }
  const merged = Array.from(new Set([...(state.draft.attachmentPaths ?? []), ...dropped]));
  state.draft.attachmentPaths = merged;
  const attachmentsField = document.querySelector<HTMLInputElement>("#compose-attachments");
  if (attachmentsField) attachmentsField.value = attachmentPathsJoinedForHiddenField(merged);
  toast(`${dropped.length} pièce(s) jointe(s) ajoutée(s).`);
  render();
}

export async function bindTauriNativeFileDropAsync(): Promise<void> {
  if (!isTauriRuntime() || tauriNativeFileDropReady) return;

  for (let i = 0; i < 60 && !tauriCurrentWebviewLabel(); i++) {
    await new Promise((r) => window.setTimeout(r, 16));
  }

  tauriNativeDragDropUnlisten?.();
  tauriNativeDragDropUnlisten = undefined;

  const runDrop = (pathsRaw: string[]): void => {
    setComposerNativeDragHighlight(false);
    applyNativeDroppedFilePaths(pathsRaw);
  };

  try {
    const wv = getCurrentWebview();
    tauriNativeDragDropUnlisten = await wv.onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "enter") {
        if (state.view === "compose") setComposerNativeDragHighlight(true);
        return;
      }
      if (p.type === "leave") {
        setComposerNativeDragHighlight(false);
        return;
      }
      if (p.type === "over") return;
      if (p.type === "drop") {
        const dropped = p.paths.map((x) => String(x).trim()).filter(Boolean);
        runDrop(dropped);
      }
    });
    tauriNativeFileDropReady = true;
    return;
  } catch (primary) {
    console.warn("[RustyMail] onDragDropEvent indisponible, repli listen()", primary);
  }

  try {
    const unsubs: Array<() => void> = [];
    unsubs.push(
      await listen(TauriEvent.DRAG_ENTER, () => {
        if (state.view === "compose") setComposerNativeDragHighlight(true);
      })
    );
    unsubs.push(
      await listen(TauriEvent.DRAG_LEAVE, () => {
        setComposerNativeDragHighlight(false);
      })
    );
    unsubs.push(
      await listen(TauriEvent.DRAG_DROP, (e) => {
        runDrop(pathsFromTauriDragPayload(e.payload));
      })
    );
    tauriNativeDragDropUnlisten = () => {
      for (const u of unsubs) u();
    };
    tauriNativeFileDropReady = true;
  } catch (fallback) {
    console.error("[RustyMail] drag-drop natif impossible", fallback);
  }
}

function syncInvokeTimeoutMs(mailboxCount: number): number {
  return syncInvokeTimeoutMsFor(mailboxCount, SYNC_INVOKE_TIMEOUT_MS);
}

function accountForImapSync(): Account | undefined {
  if (state.view === "settings" && state.settingsTab === "accounts" && state.settingsSelectedAccountId !== "new") {
    return state.accounts.find((a) => a.id === state.settingsSelectedAccountId);
  }
  return currentAccount();
}

function syncAllAccountMailboxesRequested(options?: { allMailboxes?: boolean }): boolean {
  return (
    options?.allMailboxes === true ||
    (options?.allMailboxes !== false && state.view === "settings" && state.settingsTab === "accounts")
  );
}

async function loadAccountsFromBackend(options?: { silent?: boolean; timeoutMs?: number }): Promise<boolean> {
  state.accountsLoadError = "";
  if (!isTauriRuntime()) {
    state.accounts = [];
    state.accountsLoadError =
      "Mode navigateur : pas de comptes ni de mails persistants. Lancez l’app bureau avec npm run tauri:dev.";
    if (!options?.silent) toast(state.accountsLoadError);
    return false;
  }
  try {
    const raw = await withTimeout(
      invoke<unknown[]>("list_accounts", {}),
      options?.timeoutMs ?? ACCOUNTS_BOOT_TIMEOUT_MS
    );
    state.accounts = (Array.isArray(raw) ? raw : [])
      .map((row) => normalizeAccountRow(row))
      .filter((a): a is Account => a !== null);
    if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
      state.selectedAccountId = state.accounts[0]?.id;
    }
    return state.accounts.length > 0;
  } catch (error) {
    console.error("list_accounts", error);
    state.accounts = [];
    state.accountsLoadError = tauriErrorMessage(error);
    if (!options?.silent) {
      toast(`Impossible de charger les comptes : ${state.accountsLoadError}`);
    }
    return false;
  }
}

function folderManagerBrowsingPanel(): boolean {
  return Boolean(folderManagerPanelMailbox()) && !isSearchActive();
}

function resetFolderManagerPanelSearchState(): void {
  state.listFilter = defaultListFilterFromPrefs();
}

function mailboxPathPrefixForCreate(): string {
  const m = (state.selectedMailbox ?? "").trim();
  if (!m || isVirtualMailbox(m)) return "";
  return m.endsWith("/") ? m : `${m}/`;
}

function effectiveSearchMailboxPath(): string | null {
  const parsed = parseSearchBarDraft(state.searchDraft, state.newsletterRules);
  const fromDraft = parsed.mailboxPath?.trim();
  if (fromDraft && !isSavedDraftsVirtualMailbox(fromDraft)) {
    return resolveSearchMailboxPath(fromDraft);
  }
  const committed = state.searchMailboxPath?.trim();
  if (committed && !isSavedDraftsVirtualMailbox(committed)) return committed;
  return null;
}

function searchQueryUsesThreadsApi(): boolean {
  return Boolean(
    state.search.trim() ||
      state.searchSenders.length > 0 ||
      state.searchTags.length > 0 ||
      state.searchLanguageFilter?.trim() ||
      state.searchRelativeDays != null ||
      state.searchHasAttachment != null ||
      state.searchMinSecurityScore != null ||
      state.searchMailboxPrefix?.trim()
  );
}

function searchQueryMailboxForList(): string {
  const explicit = searchMailboxForQuery();
  if (explicit) return explicit;
  const panelMb = folderManagerPanelMailbox();
  if (panelMb) return panelMb;
  return state.selectedMailbox?.trim() || "INBOX";
}

function searchMailboxForQuery(): string | null {
  const explicit = effectiveSearchMailboxPath();
  if (explicit) return explicit;
  if (state.searchScope === "mailbox") {
    const m = (folderManagerPanelMailbox() ?? state.selectedMailbox)?.trim();
    return m && !isSavedDraftsVirtualMailbox(m) ? m : "INBOX";
  }
  return null;
}

function tagFamilyForInvoke(family: string): Tag["family"] {
  const f = family.trim().toLowerCase();
  if (f === "source") return "Source";
  if (f === "kind") return "Kind";
  if (f === "state") return "State";
  return "Entity";
}

function mergeSearchBarTag(raw: { family: string; value: string }): void {
  const value = raw.value.trim();
  if (!value) return;
  const family = tagFamilyForInvoke(raw.family);
  const key = `${family}:${value}`.toLowerCase();
  if (state.searchTags.some((t) => `${t.family}:${t.value}`.toLowerCase() === key)) return;
  state.searchTags.push({ family, value });
}

function addSearchSender(email: string): void {
  const c = canonicalEmailForNlMatch(email) ?? email.trim().toLowerCase();
  if (!c) return;
  if (!state.searchSenders.some((s) => s.toLowerCase() === c)) state.searchSenders.push(c);
}

function resolveAccountIdFromRef(ref: string): string | null {
  const q = ref.trim().toLowerCase();
  if (!q) return null;
  const hit = state.accounts.find(
    (a) =>
      a.id.toLowerCase() === q ||
      a.email.toLowerCase() === q ||
      a.email.toLowerCase().includes(q) ||
      (a.displayName ?? "").toLowerCase().includes(q)
  );
  return hit?.id ?? null;
}

async function refreshSearchTagCatalog(): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !isTauriRuntime()) {
    state.searchTagCatalog = [];
    return;
  }
  try {
    const rows = await withTimeout(
      invoke<Array<{ family: string; value: string }>>("list_search_tags", { accountId }),
      BOOT_INVOKE_TIMEOUT_MS
    );
    state.searchTagCatalog = (rows ?? []).map((t) => ({
      family: tagFamilyForInvoke(String(t.family ?? "entity")),
      value: String(t.value ?? "").trim(),
    })).filter((t) => t.value.length > 0);
  } catch (error) {
    console.error("list_search_tags", error);
    state.searchTagCatalog = [];
  }
}

function committedSearchCriteriaSnapshot(): SearchCriteriaSnapshot {
  return snapshotFromStructuralState(state);
}

function draftSearchCriteriaSnapshot(draft = state.searchDraft): SearchCriteriaSnapshot {
  const scratch: SearchStructuralState & { searchTags: Tag[] } = {
    search: "",
    searchSenders: [],
    searchTags: [],
    searchMailboxPath: null,
    searchAccountOverrideId: null,
    searchNewsletterRule: null,
    searchScope: "account",
    listFilter: "all",
    searchNlMode: null,
    searchLanguageFilter: null,
    searchRelativeDays: null,
    searchHasAttachment: null,
    searchMinSecurityScore: null,
    searchMailboxPrefix: null,
  };
  resetSearchStructuralState(scratch);
  const parsed = parseSearchBarDraft(draft.trim(), state.newsletterRules);
  applyParsedSearchBarToStructural(scratch, parsed);
  return snapshotFromStructuralState(scratch);
}

function canSaveSearchView(): boolean {
  if (!isTauriRuntime() || !searchAccountIdForQuery()) return false;
  if (state.activeSavedSearchId) return true;
  return hasCommittedSearchCriteria(committedSearchCriteriaSnapshot());
}

function canSaveSearchViewInModal(): boolean {
  if (!isTauriRuntime() || !searchAccountIdForQuery()) return false;
  if (canSaveSearchView()) return true;
  return hasCommittedSearchCriteria(draftSearchCriteriaSnapshot());
}

function syncSearchBarChrome(): void {
  const html = renderSearchBadgesHtml();
  const showPending = searchDraftDiffersFromCommitted();
  const pendingHtml = `<span class="inbox-search-pending dim" title="Entrée pour lancer la recherche">↵</span>`;

  document.querySelectorAll<HTMLElement>(".search-bar-stack, .search-ctx-stack").forEach((stack) => {
    const host =
      stack.querySelector(".search-context-filters") ??
      stack.querySelector(".search-bar-meta__badges") ??
      stack.querySelector(".search-ctx-badges") ??
      stack;
    const existing = host.querySelector(".inbox-search-badges");
    if (html) {
      if (existing) existing.outerHTML = html;
      else host.insertAdjacentHTML("beforeend", html);
    } else {
      existing?.remove();
    }

    const label = stack.querySelector("label.inbox-search");
    const input =
      label?.querySelector<HTMLInputElement>("input[type='search']") ??
      stack.querySelector<HTMLInputElement>("input[type='search']");
    if (!input) return;

    const pending = input.parentElement?.querySelector(".inbox-search-pending");
    if (showPending && !pending) {
      input.insertAdjacentHTML("afterend", pendingHtml);
    } else if (!showPending && pending) {
      pending.remove();
    }
  });
}

function inboxSearchContextActive(): boolean {
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) return false;
  if (state.view === "folderManager" && folderManagerBrowsingPanel()) return false;
  if (state.activeSavedSearchId) return true;
  return hasCommittedSearchCriteria(committedSearchCriteriaSnapshot());
}

function activeSavedSearchItem(): SavedSearchListItem | undefined {
  const id = state.activeSavedSearchId;
  if (!id) return undefined;
  return state.savedSearches.find((s) => s.id === id);
}

function searchViewTargetsInbox(): boolean {
  const mb = (searchMailboxForQuery() ?? state.selectedMailbox ?? "INBOX").trim();
  const u = mb.toUpperCase();
  return u === "INBOX" || u.endsWith(".INBOX");
}

function searchViewCanOpenOrganizer(): boolean {
  return (
    inboxSearchContextActive() &&
    searchViewTargetsInbox() &&
    threadsVisibleInList().length >= 15
  );
}

function searchViewCanAffinerFlux(): boolean {
  return (
    isTauriRuntime() &&
    inboxSearchContextActive() &&
    isAiFeatureEnabled(state.appPrefs.ai, "featureOrgProposalsEnabled") &&
    threadsVisibleInList().length >= 5
  );
}

function patchSavedSearchNewCount(id: string, count: number, lastSeenAt?: string): void {
  const seen = lastSeenAt ?? new Date().toISOString();
  state.savedSearches = state.savedSearches.map((s) =>
    s.id === id ? { ...s, newCount: count, lastSeenAt: seen } : s,
  );
}

function openSearchModal(): void {
  state.searchModalOpen = true;
  void refreshSearchTagCatalog();
  render();
}

function closeSearchModal(): void {
  if (!state.searchModalOpen) return;
  state.searchModalOpen = false;
  render();
}

function activeSearchInputElement(): HTMLInputElement | null {
  if (state.searchModalOpen) {
    return document.querySelector<HTMLInputElement>("#search-modal-input");
  }
  return document.querySelector<HTMLInputElement>("#search-input");
}

async function loadThreadsForSearchContext(append = false): Promise<void> {
  if (isSavedDraftsVirtualMailbox(listMailboxForPanel())) {
    await loadMailView(append);
    return;
  }
  const accountId = searchAccountIdForQuery();
  if (!accountId || !isTauriRuntime()) {
    state.threads = [];
    state.threadOffset = 0;
    state.hasMoreThreads = false;
    return;
  }
  const payload: Record<string, unknown> = {
    accountId,
    pageSize: state.threadPageSize,
    pageOffset: append ? state.threadOffset : 0,
    followedOnly: state.listFilter === "starred",
  };
  const explicitMb = effectiveSearchMailboxPath() ?? state.searchMailboxPath?.trim();
  if (state.searchScope === "account" && !explicitMb) {
    payload.accountWide = true;
  } else {
    payload.mailbox = searchQueryMailboxForList();
  }
  let page: ThreadListItem[];
  try {
    page = await withTimeout(invoke<ThreadListItem[]>("list_threads", payload), BOOT_INVOKE_TIMEOUT_MS);
    state.mailListError = "";
  } catch (error) {
    const detail = tauriErrorMessage(error);
    console.error("list_threads (search context)", error);
    state.mailListError = `Impossible de charger les conversations : ${detail}`;
    if (!append) {
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
    }
    return;
  }
  if (append) {
    applyServerThreadPage(page, true);
  } else {
    applyServerThreadPage(page, false);
  }
  state.threadOffset = state.threads.length;
  state.hasMoreThreads = page.length >= state.threadPageSize;
  if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
  }
  scheduleMailboxDigestRefresh();
  scheduleIdleAiCachePrefetch();
}

async function refreshLlmRuntimeStatus(forceHardwareRescan?: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    state.llmRuntimeStatus = null;
    state.llmCachedGgufFilenames = [];
    return;
  }
  try {
    state.llmRuntimeStatus = await withTimeout(
      invoke<LlmRuntimeStatus>(forceHardwareRescan ? "llm_status_refresh_hardware" : "llm_status", {}),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch {
    state.llmRuntimeStatus = null;
  }
  try {
    state.llmCachedGgufFilenames = await withTimeout(invoke<string[]>("list_cached_gguf_models", {}), 10_000);
  } catch {
    state.llmCachedGgufFilenames = [];
  }
}

function syncAiEngineSettingsTabFromPrefs(): void {
  state.aiEngineSettingsTab = engineConnectionMode(state.appPrefs.ai);
}

async function autoDetectLlamaServerBinary(opts?: { silent?: boolean; persist?: boolean }): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const prev = state.appPrefs.ai.llamaServerBinaryPath.trim();
  try {
    const det = await invoke<{
      onPath: boolean;
      wingetInstalled: boolean;
      resolvedPath?: string | null;
    }>("llama_server_detect", {
      binaryHint: prev || "llama-server",
    });
    let next = prev;
    if (det.resolvedPath?.trim()) {
      next = det.resolvedPath.trim();
    } else if ((det.onPath || det.wingetInstalled) && !prev) {
      next = "llama-server";
    }
    if (next && next !== prev) {
      state.appPrefs.ai.llamaServerBinaryPath = next;
      if (opts?.persist !== false) {
        await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
      }
      if (!opts?.silent) toast(`llama-server : ${next}`);
      return true;
    }
    if (!opts?.silent && (det.onPath || det.wingetInstalled)) {
      toast(`llama-server détecté${det.resolvedPath ? ` (${det.resolvedPath})` : ""}.`);
    } else if (!opts?.silent && !det.onPath && !det.wingetInstalled) {
      toast("llama-server introuvable (PATH et winget).");
    }
  } catch (e) {
    if (!opts?.silent) toast(tauriErrorMessage(e));
  }
  return false;
}

async function openEnginesAiSettingsModal(): Promise<void> {
  state.settingsAiModal = "engines";
  syncAiEngineSettingsTabFromPrefs();
  await autoDetectLlamaServerBinary({ silent: true });
  await refreshLlmRuntimeStatus(false);
  render();
}

function applyContextSliderIndex(idx: number): void {
  const clamped = Math.max(0, Math.min(LLM_CONTEXT_PRESETS.length - 1, Math.trunc(idx)));
  const n = LLM_CONTEXT_PRESETS[clamped] ?? 4096;
  state.appPrefs.ai.localLlmContextSize = n;
  const hidden = document.querySelector<HTMLInputElement>("#prefs-local-llm-ctx");
  const display = document.querySelector<HTMLElement>("#prefs-local-llm-ctx-display");
  const range = document.querySelector<HTMLInputElement>("#prefs-local-llm-ctx-range");
  if (hidden) hidden.value = String(n);
  if (display) display.textContent = String(n);
  if (range) range.value = String(clamped);
  document.querySelectorAll<HTMLElement>(".settings-ctx-slider__tick").forEach((el, i) => {
    el.classList.toggle("settings-ctx-slider__tick--active", i === clamped);
  });
}

async function persistEngineCheckboxToggle(message: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
    toast(message);
    await refreshLlmRuntimeStatus(false);
    if (state.settingsAiModal === "engines") render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function refreshSavedDraftsMailboxCount(): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !isTauriRuntime()) {
    state.savedDraftsMailboxCount = 0;
    return;
  }
  try {
    const n = await withTimeout(invoke<number>("saved_drafts_count", { accountId }), BOOT_INVOKE_TIMEOUT_MS);
    state.savedDraftsMailboxCount =
      typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    state.savedDraftsMailboxCount = 0;
  }
}

async function refreshSemanticEmbeddingCounts(): Promise<void> {
  if (!isTauriRuntime()) {
    state.semanticEmbeddingCounts = null;
    return;
  }
  const account = currentAccount();
  const aid = account?.id?.trim();
  const mailbox = state.selectedMailbox || "INBOX";
  if (!aid || !mailbox) {
    state.semanticEmbeddingCounts = null;
    return;
  }
  try {
    state.semanticEmbeddingCounts = await withTimeout(
      invoke<SemanticEmbeddingCountsSnapshot>("semantic_embedding_counts", { accountId: aid, mailbox }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch {
    state.semanticEmbeddingCounts = null;
  }
  if (state.view === "settings" && state.settingsTab === "ai") {
    render();
  }
}

async function switchMailbox(nextMailbox: string) {
  if (state.view === "folderManager") return;
  // Sidebar navigation while reading a thread should return to list view.
  // Otherwise we can stay on `view=thread` with no loaded thread and show "Fil indisponible…".
  if (
    state.view === "thread" ||
    state.view === "contacts" ||
    state.view === "contact" ||
    state.view === "settings" ||
    state.view === "organization" ||
    state.view === "organizationV2" ||
    state.view === "compose"
  ) {
    navReset();
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
    state.selectedContactEmail = undefined;
    state.aiOpen = false;
    clearThreadAiSummaryState();
  }
  state.selectedMailbox = nextMailbox || "INBOX";
  notifyImapWatchFocusedMailbox(state.selectedMailbox);
  exitSearchModeForMailboxBrowse();
  state.searchScope = "mailbox";
  state.listFilter = defaultListFilterFromPrefs();
  resetMailboxDigestForNavigation();
  invalidateIdleAiCachePrefetch();
  await loadMailView(false);
  cancelMailboxDigestLiveDebounce();
  if (mailboxDigestSlotInList()) {
    void enqueueMailboxDigestRefreshWhenIdle(false);
  }
  await refreshSavedDraftsMailboxCount();
  if (!state.threads.some((t) => t.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
  }
  render();
}

async function onThreadMove(
  kind: "trash" | "archive",
  threadId: string,
  mailboxOverride?: string,
) {
  if (!threadId.trim()) return;
  if (savedDraftIdFromThreadId(threadId)) {
    toast("Archive / corbeille : actions IMAP uniquement.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Déplacer un fil : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const mailbox = mailboxOverride?.trim() || sourceMailboxForThread(threadId);
  const cmd = kind === "trash" ? "move_thread_trash" : "move_thread_archive";
  const prevThreads = state.threads;
  const prevSelectedId = state.selectedThreadId;
  const prevView = state.view;
  const prevOrgReport = state.organization.report;
  markThreadsRecentlyRemoved([threadId]);
  state.threads = state.threads.filter((t) => t.id !== threadId);
  if (state.view === "thread" && state.selectedThreadId === threadId) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, [threadId]);
  }
  render();
  try {
    const msg = await withTimeout(
      invoke<string>(cmd, { accountId: account.id, mailbox, threadId }),
      MAIL_ACTION_TIMEOUT_MS
    );
    toast(msg);
    void loadMailboxUnread();
    if (!state.selectedThreadId) state.selectedThreadId = state.threads[0]?.id;
    render();
    if (state.view === "organization") void refreshOrganizationReport();
  } catch (err) {
    console.error(cmd, err);
    clearThreadsRecentlyRemoved([threadId]);
    state.threads = prevThreads;
    state.selectedThreadId = prevSelectedId;
    state.view = prevView;
    state.organization.report = prevOrgReport;
    toast(tauriErrorMessage(err));
    render();
  }
}

async function bulkTrashVisibleThreads(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Corbeille : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Corbeille : actions IMAP uniquement.");
    return;
  }
  if (mailboxKind(state.selectedMailbox || "") === "trash") {
    toast("Utilisez « Vider la corbeille » dans ce dossier.");
    return;
  }
  if (isSearchActive()) {
    toast("Tout supprimer : désactivé pendant une recherche. Retirez les filtres de recherche d’abord.");
    return;
  }
  const visible = threadsVisibleInList();
  if (!visible.length) {
    toast("Aucune conversation à supprimer dans cette vue.");
    return;
  }
  const lf = state.listFilter;
  const filterLabel =
    lf === "unread"
      ? "Non lus"
      : lf === "focused"
        ? "Priorité"
        : lf === "auto"
          ? "Auto"
          : lf === "starred"
            ? "Suivis"
            : "Tout";
  const ok = await openConfirmModal({
    title: "Tout mettre à la corbeille ?",
    body: `Déplacer vers la corbeille toutes les conversations actuellement affichées dans « ${filterLabel} » (${visible.length}).`,
    danger: true,
    confirmLabel: "Tout supprimer",
  });
  if (!ok) return;

  const prevThreads = state.threads;
  const prevSelectedId = state.selectedThreadId;
  const prevView = state.view;
  const prevOrgReport = state.organization.report;

  const ids = visible.map((t) => String(t.id));
  markThreadsRecentlyRemoved(ids);
  state.threads = state.threads.filter((t) => !ids.includes(String(t.id)));
  if (state.view === "thread" && state.selectedThreadId && ids.includes(String(state.selectedThreadId))) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, ids);
  }
  render();

  let moved = 0;
  const errors: string[] = [];
  const total = ids.length;
  upsertStatusBarJob({ id: "bulk-trash", label: "Corbeille (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < ids.length; i++) {
      const tid = ids[i]!;
      try {
        const mailbox = sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("move_thread_trash", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS
        );
        moved++;
      } catch (err) {
        errors.push(`${tid}: ${tauriErrorMessage(err)}`);
      }
      upsertStatusBarJob({ id: "bulk-trash", label: "Corbeille (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-trash");
  }

  if (errors.length) {
    // On restaure l’état pour éviter une vue incohérente.
    clearThreadsRecentlyRemoved(ids);
    state.threads = prevThreads;
    state.selectedThreadId = prevSelectedId;
    state.view = prevView;
    state.organization.report = prevOrgReport;
    toast(`Échec corbeille (lot) : ${errors[0]}${errors.length > 1 ? "…" : ""}`);
    render();
    return;
  }

  toast(`${moved} conversation${moved === 1 ? "" : "s"} déplacée${moved === 1 ? "" : "s"} dans la corbeille.`);
  void loadMailboxUnread();
  // Recharge pour recalculer compteurs + cohérence.
  await loadMailView(false);
  render();
}

async function onEmptyTrashMailbox() {
  if (!isTauriRuntime()) {
    toast("Vider la corbeille : disponible dans l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const mailbox = state.selectedMailbox || "";
  if (mailboxKind(mailbox) !== "trash") {
    toast("Ouvrez d’abord le dossier corbeille.");
    return;
  }
  if (state.threads.length === 0) {
    toast("La corbeille est déjà vide.");
    return;
  }
  const ok = await openConfirmModal({
    title: "Vider la corbeille ?",
    body: "Supprimer définitivement tous les messages de ce dossier corbeille ? Cette action est irréversible côté serveur.",
    danger: true,
    confirmLabel: "Tout supprimer",
  });
  if (!ok) return;
  try {
    const msg = await withTimeout(
      invoke<string>("empty_trash_mailbox_cmd", { accountId: account.id, mailbox, destructiveAck: "empty-trash" }),
      MAIL_ACTION_TIMEOUT_MS
    );
    toast(msg);
    if (state.view === "thread") {
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
    }
    await loadMailView();
    await loadMailboxUnread();
    state.selectedThreadId = state.threads[0]?.id;
    render();
  } catch (err) {
    console.error("empty_trash_mailbox_cmd", err);
    toast(tauriErrorMessage(err));
    render();
  }
}

function openMoveDialog(threadId: string) {
  state.moveThreadId = threadId;
  const source = sourceMailboxForThread(threadId).toLowerCase();
  const allowed = mailboxesAllowedForMove(state.mailboxes).filter((m) => m.toLowerCase() !== source);
  state.moveTargetMailbox = allowed.includes("INBOX") ? "INBOX" : (allowed[0] ?? "INBOX");
  state.moveOpen = true;
  render();
}

function sourceMailboxForThread(threadId: string): string {
  const row = state.threads.find((t) => String(t.id) === String(threadId));
  const raw = row?.mailbox ?? state.selectedMailbox ?? "INBOX";
  const trimmed = String(raw ?? "").trim();
  return trimmed && trimmed !== LOCAL_SAVED_DRAFTS_MAILBOX ? trimmed : (state.selectedMailbox || "INBOX");
}

async function onThreadMoveTo(threadId: string, destMailbox: string) {
  const tid = String(threadId ?? "").trim();
  const dest = String(destMailbox ?? "").trim();
  if (!tid || !dest) return;
  if (savedDraftIdFromThreadId(tid)) {
    toast("Déplacer : disponible pour les mails IMAP, pas pour les brouillons sauvegardés.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Déplacer un fil : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const source = sourceMailboxForThread(tid);
  if (dest.toLowerCase() === source.toLowerCase()) return;
  const prevThreads = state.threads;
  const prevSelectedId = state.selectedThreadId;
  const prevView = state.view;
  const prevOrgReport = state.organization.report;
  markThreadsRecentlyRemoved([tid]);
  state.threads = state.threads.filter((t) => t.id !== tid);
  if (state.view === "thread" && state.selectedThreadId === tid) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, [tid]);
  }
  render();
  try {
    const msg = await withTimeout(
      invoke<string>("move_thread_mailbox", {
        accountId: account.id,
        mailbox: source,
        threadId: tid,
        destMailbox: dest,
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    toast(msg);
    state.moveOpen = false;
    state.moveThreadId = undefined;
    void loadMailboxUnread();
    if (!state.selectedThreadId) state.selectedThreadId = state.threads[0]?.id;
    render();
    if (state.view === "organization") void refreshOrganizationReport();
  } catch (err) {
    console.error("move_thread_mailbox", err);
    clearThreadsRecentlyRemoved([tid]);
    state.threads = prevThreads;
    state.selectedThreadId = prevSelectedId;
    state.view = prevView;
    state.organization.report = prevOrgReport;
    toast(tauriErrorMessage(err));
    render();
  }
}

async function confirmMoveDialog() {
  const threadId = state.moveThreadId;
  if (!threadId) return;
  await onThreadMoveTo(threadId, state.moveTargetMailbox);
}

async function mailboxManageAction(kind: "create" | "rename" | "delete" | "subscribe") {
  if (!isTauriRuntime()) {
    toast("Mailbox : disponible seulement dans l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  if (kind !== "create" && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Les dossiers IMAP ne s’appliquent pas aux brouillons locaux.");
    return;
  }
  try {
    let msg = "";
    if (kind === "create") {
      const prefix = mailboxPathPrefixForCreate();
      const def = prefix || "";
      const bodyHint = [
        prefix ? `Préfixe depuis le dossier sélectionné : ${prefix}` : "",
        `Ex. sous « ${state.selectedMailbox || "INBOX"} » : nom du sous-dossier ou chemin complet (séparateur /).`,
      ]
        .filter(Boolean)
        .join("\n");
      const name =
        (await openTextPromptModal({
          title: "Créer un dossier IMAP",
          body: bodyHint,
          label: "Chemin du dossier",
          defaultValue: def,
        }))?.trim() ?? "";
      if (!name) return;
      msg = await withTimeout(invoke<string>("create_imap_mailbox", { accountId: account.id, mailbox: name }), MAIL_ACTION_TIMEOUT_MS);
    } else if (kind === "rename") {
      const from = state.selectedMailbox || "INBOX";
      const to =
        (await openTextPromptModal({
          title: "Renommer le dossier",
          body: `Dossier actuel : ${from}`,
          label: "Nouveau chemin IMAP",
          defaultValue: "",
        }))?.trim() ?? "";
      if (!to) return;
      msg = await withTimeout(invoke<string>("rename_imap_mailbox", { accountId: account.id, fromMailbox: from, toMailbox: to }), MAIL_ACTION_TIMEOUT_MS);
    } else if (kind === "delete") {
      const m = state.selectedMailbox || "INBOX";
      const ok = await openConfirmModal({
        title: "Supprimer ce dossier IMAP ?",
        body: `La mailbox « ${m} » sera supprimée côté serveur. Opération irréversible.`,
        danger: true,
        confirmLabel: "Supprimer",
      });
      if (!ok) return;
      msg = await withTimeout(
        invoke<string>("delete_imap_mailbox", {
          accountId: account.id,
          mailbox: m,
          destructiveAck: "delete-mailbox",
        }),
        MAIL_ACTION_TIMEOUT_MS
      );
    } else if (kind === "subscribe") {
      const m = state.selectedMailbox || "INBOX";
      msg = await withTimeout(invoke<string>("subscribe_imap_mailbox", { accountId: account.id, mailbox: m }), MAIL_ACTION_TIMEOUT_MS);
    }
    toast(msg);
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: account.id }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
    state.mailboxManageOpen = false;
    await loadMailboxUnread();
    await loadMailView(false);
    render();
  } catch (err) {
    console.error("mailboxManageAction", err);
    toast(tauriErrorMessage(err));
    render();
  }
}

async function onThreadSeen(kind: "read" | "unread", threadId: string) {
  if (!threadId.trim()) return;
  if (savedDraftIdFromThreadId(threadId)) {
    toast("Marquer lu / non lu : disponible pour les mails IMAP, pas pour les brouillons sauvegardés.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Marquer lu/non-lu : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const mailbox = sourceMailboxForThread(threadId);
  const cmd = kind === "read" ? "thread_mark_read" : "thread_mark_unread";
  try {
    const msg = await withTimeout(
      invoke<string>(cmd, { accountId: account.id, mailbox, threadId }),
      MAIL_ACTION_TIMEOUT_MS
    );
    toast(msg);
    await reloadCurrentThreadList(false);
    await loadMailboxUnread();
    if (state.view === "thread" && state.selectedThreadId === threadId) {
      const refreshed = await fetchOpenThreadOrNotify(threadId);
      if (refreshed) state.selectedThread = refreshed;
    }
    render();
  } catch (err) {
    console.error(cmd, err);
    toast(tauriErrorMessage(err));
    render();
  }
}

async function onThreadToggleFollow(threadId: string) {
  const tid = String(threadId ?? "").trim();
  if (!tid) return;
  if (savedDraftIdFromThreadId(tid)) {
    toast("Suivre : disponible pour les mails IMAP, pas pour les brouillons sauvegardés.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Suivre un fil : requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  try {
    const next = await withTimeout(
      invoke<boolean>("thread_toggle_follow", { accountId: account.id, threadId: tid }),
      MAIL_ACTION_TIMEOUT_MS
    );
    for (const row of state.threads) {
      if (String(row.id) === tid) {
        row.followed = next;
        break;
      }
    }
    toast(next ? "Fil ajouté au suivi." : "Fil retiré du suivi.");
    render();
    await reloadCurrentThreadList(false);
    render();
  } catch (err) {
    console.error("thread_toggle_follow", err);
    toast(tauriErrorMessage(err));
    render();
  }
}

function micPermissionErrorMessage(error: unknown): string {
  const raw = tauriErrorMessage(error);
  const low = raw.toLowerCase();
  if (
    low.includes("permission denied") ||
    low.includes("notallowed") ||
    low.includes("permission") && low.includes("denied")
  ) {
    return (
      "Micro refusé par Windows ou la WebView. Ouvrez Paramètres Windows → Confidentialité → Microphone, " +
      "autorisez RustyMail, puis relancez l’app. Si le problème persiste, utilisez le bouton micro (clic) une fois."
    );
  }
  return `Micro inaccessible : ${raw}`;
}

async function requestMicStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const low = tauriErrorMessage(e).toLowerCase();
    if (
      isTauriRuntime() &&
      (low.includes("permission") || low.includes("notallowed"))
    ) {
      try {
        await invoke("reset_webview_microphone_permission");
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw e;
  }
}

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

function threadReadingIsSimpleLayout(): boolean {
  return true;
}

function aiSidePanelExpandedForShell(): boolean {
  if (state.view === "contacts" || state.view === "contact") return false;
  return state.aiOpen || mailboxDigestSlotInList();
}

function launchTagMailSearch(tag: Tag): void {
  const draft = tagToSearchDraft(tag);
  if (!draft) {
    toast("Ce tag n’est pas utilisable pour la recherche.");
    return;
  }
  navReset();
  state.view = "list";
  state.threadTagsModalOpen = false;
  state.searchModalOpen = false;
  state.searchAccountOverrideId = null;
  state.searchMailboxPath = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchLanguageFilter = null;
  state.searchSenders = [];
  state.search = "";
  state.searchDraft = draft;
  state.listFilter = "all";
  state.searchNlMode = null;
  state.searchScope = "account";
  state.searchModifiersTouched = true;
  clearThreadAiSummaryState();
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
    el.value = draft;
  });
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parseSearchBarDraft(draft, state.newsletterRules));
  render();
  void searchThreads();
}

async function refreshOrganizationReport(): Promise<void> {
  if (state.view !== "organization") return;
  const acc = currentAccount();
  if (!acc?.id) return;
  state.organization.applyMessage = "Mise à jour des propositions…";
  render();
  try {
    const report = await orgScanAccount(acc.id, Boolean(state.appPrefs.ai.featureOrgProposalsEnabled));
    state.organization.report = report;
    state.organization.applyMessage = `${report.proposals.length} proposition(s) à jour.`;
    const llmMsg = report.llmStatus?.message?.trim();
    if (llmMsg) toast(llmMsg);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    if (state.view === "organization") render();
  }
}

async function refreshMailboxesAfterImapChange(): Promise<void> {
  if (!isTauriRuntime()) return;
  const acc = currentAccount();
  if (!acc?.id) return;
  try {
    state.mailboxes = await withTimeout(
      invoke<string[]>("list_imap_mailboxes", { accountId: acc.id }),
      BOOT_INVOKE_TIMEOUT_MS,
    );
  } catch {
    /* garde la liste actuelle */
  }
}

async function confirmThenRunOrgApply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: import("../organizationView").OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  const proposal = state.organization.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    toast("Proposition introuvable — relancez l’analyse du compte.");
    return;
  }
  if (proposal.applicable === false) return;
  const impact = formatOrgApplyImpact(proposal, actionOverride);
  const ok = await openConfirmModal({
    title: "Confirmer l’action",
    body: `${impact}\n\nAppliquer cette action sur le compte ?`,
    confirmLabel: "Appliquer",
  });
  if (!ok) return;
  await runOrgApply(accountId, proposalId, trashAck, actionOverride, deleteMailboxAck, threadIds);
}

async function runOrgApply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: import("../organizationView").OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  state.organization.applying = true;
  state.organization.applyMessage = orgApplyStatusMessage(proposalId, actionOverride);
  render();
  try {
    const proposal = state.organization.report?.proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      toast("Proposition introuvable — relancez l’analyse du compte.");
      return;
    }
    const p = await orgApplyProposal(
      accountId,
      proposalId,
      proposal,
      trashAck,
      actionOverride,
      deleteMailboxAck,
      threadIds,
    );
    state.organization.applyMessage = p.message;
    toast(p.message);
    if (p.errors.length > 0) {
      toast(p.errors.slice(0, 2).join(" · "));
    }
    if (state.organization.report) {
      state.organization.report = optimisticPatchOrgReport(
        state.organization.report,
        proposalId,
        p,
      );
    }
    render();
    const hadImapChange =
      p.done > 0 ||
      (p.mailboxesToSync?.length ?? 0) > 0 ||
      (p.threadsAffected?.length ?? 0) > 0;
    if (hadImapChange) {
      await refreshMailboxesAfterImapChange();
      if (state.view === "list" && isTauriRuntime()) {
        try {
          await loadMailView(false);
        } catch {
          /* liste courante au prochain affichage */
        }
      }
    }
    await refreshOrganizationReport();
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organization.applying = false;
    render();
  }
}

async function openOrganizationView() {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour organiser la boîte.");
    return;
  }
  await loadNewsletterRules();
  beginNavigation("organization", { resetStack: true });
  state.view = "organization";
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  render();
}

async function refreshOrganizationV2Report(): Promise<void> {
  if (state.view !== "organizationV2") return;
  const acc = currentAccount();
  if (!acc?.id) return;
  state.organizationV2.applyMessage = "Mise à jour…";
  render();
  try {
    const report = await orgV2ScanAccount(acc.id);
    state.organizationV2.report = report;
    state.organizationV2.applyMessage = `${report.proposals.length} action(s) en file.`;
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    if (state.view === "organizationV2") render();
  }
}

function exitSearchModeForMailboxBrowse(): void {
  state.search = "";
  state.searchDraft = "";
  state.searchSenders = [];
  state.searchMailboxPath = null;
  state.searchAccountOverrideId = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchLanguageFilter = null;
  state.searchNlMode = null;
  state.searchModifiersTouched = false;
  state.activeSavedSearchId = null;
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
    el.value = "";
  });
}

async function onOrgV2IgnoreMailboxUi(mailbox: string): Promise<void> {
  const acc = currentAccount();
  const mb = mailbox.trim();
  if (!acc?.id || !mb) return;
  try {
    await orgV2IgnoreMailbox(acc.id, mb);
    if (state.organizationV2.report) {
      const mem = state.organizationV2.report.memory;
      const ignored = new Set(mem.ignoredMailboxes);
      ignored.add(mb);
      state.organizationV2.report = {
        ...state.organizationV2.report,
        memory: { ...mem, ignoredMailboxes: [...ignored] },
      };
      state.organizationV2.applyMessage = `Dossier « ${threadMailboxListLabel(mb).label} » exclu de l’analyse.`;
    }
    toast(`« ${threadMailboxListLabel(mb).label} » exclu de l’analyse.`);
    render();
    void refreshOrganizationV2Report();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function onOrgV2UnignoreMailboxUi(mailbox: string): Promise<void> {
  const acc = currentAccount();
  const mb = mailbox.trim();
  if (!acc?.id || !mb) return;
  try {
    await orgV2UnignoreMailbox(acc.id, mb);
    if (state.organizationV2.report) {
      const mem = state.organizationV2.report.memory;
      state.organizationV2.report = {
        ...state.organizationV2.report,
        memory: {
          ...mem,
          ignoredMailboxes: mem.ignoredMailboxes.filter((x) => x !== mb),
        },
      };
      state.organizationV2.applyMessage = `Dossier « ${threadMailboxListLabel(mb).label} » réintégré.`;
    }
    toast(`« ${threadMailboxListLabel(mb).label} » réintégré dans l’analyse.`);
    render();
    void refreshOrganizationV2Report();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function orgV2DismissProposal(proposalId: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const proposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) return;
  try {
    await orgV2RecordDecision(acc.id, proposal, "dismissed");
    if (state.organizationV2.report) {
      state.organizationV2.report = optimisticOrgV2RemoveProposal(state.organizationV2.report, proposalId);
    }
    state.organizationV2.applyMessage = "Proposition ignorée (mémorisée).";
    toast("Ignorée — ne reviendra pas pour ce lot.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

async function orgV2SnoozeProposal(proposalId: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const proposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) return;
  try {
    await orgV2RecordDecision(acc.id, proposal, "snoozed", 7);
    if (state.organizationV2.report) {
      state.organizationV2.report = optimisticOrgV2RemoveProposal(state.organizationV2.report, proposalId);
    }
    state.organizationV2.applyMessage = "Reportée 7 jours.";
    toast("Reportée 7 jours.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

async function confirmThenRunOrgV2Apply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: import("../organizationView").OrgActionOverride | null,
  deleteMailboxAck?: string,
): Promise<void> {
  const proposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    toast("Proposition introuvable — relancez l’analyse.");
    return;
  }
  if (proposal.applicable === false) return;
  let previewLine = formatOrgApplyImpact(proposal, actionOverride);
  try {
    const preview = await orgPreviewProposal(accountId, proposalId, proposal, actionOverride);
    const sample = preview.items
      .slice(0, 5)
      .map((it) => `• ${it.subject || it.threadId} (${it.fromMailbox} → ${it.toMailbox || "—"})`)
      .join("\n");
    previewLine = `${preview.totalCount} fil(s) seront traités.\n${sample}${
      preview.items.length > 5 ? "\n…" : ""
    }`;
  } catch {
    /* garde le résumé impact */
  }
  const ok = await openConfirmModal({
    title: "Prévisualiser puis appliquer",
    body: `${previewLine}\n\nAppliquer cette action ?`,
    confirmLabel: "Appliquer",
  });
  if (!ok) return;
  await runOrgV2Apply(accountId, proposal, trashAck, actionOverride, deleteMailboxAck);
}

async function runOrgV2Apply(
  accountId: string,
  proposal: OrgProposal,
  trashAck?: string,
  actionOverride?: import("../organizationView").OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  const proposalId = proposal.id;
  const applyIds = collectOrgProposalApplyIds(proposal, threadIds);
  const chunks =
    applyIds.length > ORG_V2_APPLY_CHUNK_SIZE
      ? chunkStringIds(applyIds, ORG_V2_APPLY_CHUNK_SIZE)
      : applyIds.length > 0
        ? [applyIds]
        : [null];

  state.organizationV2.applying = true;
  state.organizationV2.applyCancelRequested = false;
  state.organizationV2.applyDone = 0;
  state.organizationV2.applyTotal = applyIds.length > 0 ? applyIds.length : null;
  state.organizationV2.applyMessage =
    applyIds.length > 0 ? `Application… 0/${applyIds.length}` : "Application…";
  render();

  let merged: OrgApplyProgress = {
    done: 0,
    total: applyIds.length,
    message: "",
    errors: [],
    mailboxesToSync: [],
    threadsAffected: [],
  };
  let cancelled = false;

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (state.organizationV2.applyCancelRequested) {
        cancelled = true;
        break;
      }
      const chunk = chunks[i];
      const p = await orgApplyProposal(
        accountId,
        proposalId,
        proposal,
        trashAck,
        actionOverride,
        deleteMailboxAck,
        chunk,
      );
      merged = mergeOrgApplyProgress(merged, p);
      state.organizationV2.applyDone = merged.done;
      if (applyIds.length > 0) {
        state.organizationV2.applyMessage = `Application… ${Math.min(merged.done, applyIds.length)}/${applyIds.length}`;
      } else {
        state.organizationV2.applyMessage = p.message || "Application…";
      }
      if (state.organizationV2.report) {
        state.organizationV2.report = optimisticOrgV2PatchAfterApply(
          state.organizationV2.report,
          proposalId,
          p,
        );
      }
      render();
    }

    const remaining = state.organizationV2.report?.proposals.find((x) => x.id === proposalId);
    const batchCleared = orgV2ProposalBatchCleared(remaining);
    const cleanSuccess = batchCleared && merged.errors.length === 0 && !cancelled;

    if (cleanSuccess) {
      await orgV2RecordDecision(accountId, proposal, "applied");
      if (state.organizationV2.report) {
        state.organizationV2.report = optimisticOrgV2RemoveProposal(
          state.organizationV2.report,
          proposalId,
        );
      }
      state.organizationV2.applyMessage = merged.message || "Lot appliqué.";
      toast(state.organizationV2.applyMessage);
    } else if (cancelled) {
      state.organizationV2.applyMessage = `Interrompu — ${merged.done} traité(s).`;
      toast(state.organizationV2.applyMessage);
    } else if (batchCleared && merged.errors.length > 0) {
      // Carte vide côté UI mais erreurs : ne pas figer la mémoire « applied ».
      state.organizationV2.applyMessage =
        merged.message || `Terminé avec ${merged.errors.length} erreur(s).`;
      toast(state.organizationV2.applyMessage);
    } else {
      state.organizationV2.applyMessage =
        merged.message ||
        `Partiel — ${merged.done} ok${merged.errors.length ? `, ${merged.errors.length} erreur(s)` : ""}.`;
      toast(state.organizationV2.applyMessage);
    }

    if (merged.errors.length > 0) {
      toast(merged.errors.slice(0, 3).join(" · "));
    }

    const hadImapChange =
      merged.done > 0 ||
      (merged.mailboxesToSync?.length ?? 0) > 0 ||
      (merged.threadsAffected?.length ?? 0) > 0;
    if (hadImapChange) {
      await refreshMailboxesAfterImapChange();
      if (state.view === "list" && isTauriRuntime()) {
        try {
          await loadMailView(false);
        } catch {
          /* ok */
        }
      }
    }
    // Rescan seulement si reste du travail / erreurs (évite d’effacer un patch optimiste propre).
    if (!cleanSuccess) {
      await refreshOrganizationV2Report();
    } else {
      // Léger rafraîchissement mémoire / compteurs sans bloquer longtemps.
      void refreshOrganizationV2Report();
    }
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organizationV2.applying = false;
    state.organizationV2.applyCancelRequested = false;
    state.organizationV2.applyTotal = null;
    render();
  }
}

async function openOrganizationV2View() {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour organiser la boîte.");
    return;
  }
  beginNavigation("organizationV2", { resetStack: true });
  state.view = "organizationV2";
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  render();
  state.organizationV2.scanning = true;
  render();
  try {
    const report = await orgV2ScanAccount(acc.id);
    state.organizationV2.report = report;
    state.organizationV2.applyMessage = `${report.proposals.length} action(s).`;
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organizationV2.scanning = false;
    if (state.view === "organizationV2") render();
  }
}

function mailboxPathDelimiter(mb: string): string {
  return mb.includes("/") ? "/" : ".";
}

function mailboxLeafName(path: string): string {
  const segs = splitMailboxSegments(path);
  return segs[segs.length - 1] ?? path;
}

function reparentMailboxPath(from: string, newParent: string): string {
  const leaf = mailboxLeafName(from);
  const parent = newParent.trim();
  if (!parent) return leaf;
  const delim = mailboxPathDelimiter(parent);
  return `${parent.replace(/[/.]$/, "")}${delim}${leaf}`;
}

async function refreshFolderManagerTree(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  state.folderManager.loading = true;
  render();
  try {
    state.folderManager.report = await fetchMailboxTree(acc.id);
    state.folderManager.message = `${state.folderManager.report.entries.length} dossier(s) personnel(s)`;
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.loading = false;
    if (state.view === "folderManager") render();
  }
}

async function fmSelectMailbox(mailbox: string, opts?: { skipHistory?: boolean }): Promise<void> {
  const mb = mailbox.trim();
  if (!mb) return;
  const prev = state.folderManager.selectedMailbox;
  if (
    !opts?.skipHistory &&
    state.view === "folderManager" &&
    prev !== mb
  ) {
    navPushBackEntry(captureCurrentNav());
    navClearForward();
  }
  state.folderManager.selectedMailbox = mb;
  resetFolderManagerPanelSearchState();
  render();
  try {
    await loadMailView(false);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

async function openFolderManagerView(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour gérer les dossiers.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Vue Dossiers : disponible dans l’app Tauri.");
    return;
  }
  beginNavigation("folderManager");
  state.view = "folderManager";
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  state.folderManager.selectedMailbox = null;
  state.threads = [];
  state.folderManager.expandedNodes = loadFolderTreeExpanded();
  render();
  await refreshFolderManagerTree();
}

async function fmSyncMailbox(mailbox: string): Promise<void> {
  const acc = currentAccount();
  const mb = mailbox.trim();
  if (!acc?.id || !mb) return;
  state.folderManager.busyMailbox = mb;
  state.folderManager.busyAction = "sync";
  render();
  try {
    await withTimeout(
      invoke<SyncMailboxesOutcome>("sync_mailboxes", { accountId: acc.id, mailboxes: [mb] }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await refreshFolderManagerTree();
    if (state.folderManager.selectedMailbox === mb) await fmSelectMailbox(mb);
    toast(`Dossier synchronisé : ${mb}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.busyMailbox = null;
    state.folderManager.busyAction = null;
    render();
  }
}

async function fmCreateMailbox(parentPrefix?: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const prefix = parentPrefix?.trim() ? `${parentPrefix.trim().replace(/[/.]$/, "")}${mailboxPathDelimiter(parentPrefix)}` : "";
  const name =
    (await openTextPromptModal({
      title: "Créer un dossier IMAP",
      body: prefix ? `Préfixe parent : ${prefix}` : "Chemin du dossier (ex. Projets/2025)",
      label: "Chemin du dossier",
      defaultValue: prefix,
    }))?.trim() ?? "";
  if (!name) return;
  try {
    await withTimeout(invoke<string>("create_imap_mailbox", { accountId: acc.id, mailbox: name }), MAIL_ACTION_TIMEOUT_MS);
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    await fmSelectMailbox(name);
    toast(`Dossier créé : ${name}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function fmRenameMailbox(from: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const to =
    (await openTextPromptModal({
      title: "Renommer le dossier",
      label: "Nouveau chemin",
      defaultValue: from,
    }))?.trim() ?? "";
  if (!to || to === from) return;
  try {
    await withTimeout(
      invoke<string>("rename_imap_mailbox", { accountId: acc.id, fromMailbox: from, toMailbox: to }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    await fmSelectMailbox(to);
    toast(`Dossier renommé : ${to}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function fmMoveFolder(from: string, newParent: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  if (from.trim().toLowerCase() === newParent.trim().toLowerCase()) return;
  if (isDescendantMailboxPath(from, newParent)) {
    toast("Impossible de déplacer un dossier dans l’un de ses descendants.");
    return;
  }
  const to = reparentMailboxPath(from, newParent);
  if (to.toLowerCase() === from.trim().toLowerCase()) return;
  state.folderManager.busyMailbox = from;
  state.folderManager.busyAction = "move";
  render();
  try {
    await withTimeout(
      invoke<string>("rename_imap_mailbox", { accountId: acc.id, fromMailbox: from, toMailbox: to }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    await fmSelectMailbox(to);
    toast(`Dossier déplacé : ${to}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.busyMailbox = null;
    state.folderManager.busyAction = null;
    state.folderManager.dragFolder = null;
    state.folderManager.dropTarget = null;
    render();
  }
}

async function fmConfirmArchiveMailbox(): Promise<void> {
  const acc = currentAccount();
  const mb = state.folderManager.pendingArchiveMailbox?.trim();
  if (!acc?.id || !mb) return;
  const remember = state.folderManager.archiveRemember;
  state.folderManager.archiveProgress = "Archivage…";
  render();
  try {
    const out = await archiveMailboxThreads(acc.id, mb, remember);
    state.folderManager.archiveConfirmOpen = false;
    state.folderManager.pendingArchiveMailbox = null;
    await refreshFolderManagerTree();
    if (state.folderManager.selectedMailbox === mb) await fmSelectMailbox(mb);
    if (out.errors.length) toast(`Archivage partiel : ${out.errors[0]}`);
    else toast(`${out.archived} conversation(s) archivée(s).`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.archiveProgress = null;
    render();
  }
}

async function fmConfirmDeleteMailbox(): Promise<void> {
  const acc = currentAccount();
  const mb = state.folderManager.pendingDeleteMailbox?.trim();
  if (!acc?.id || !mb || !state.folderManager.deleteConfirmChecked) return;
  state.folderManager.busyMailbox = mb;
  state.folderManager.busyAction = "delete";
  render();
  try {
    const out = await deleteMailboxWithContents(acc.id, mb);
    state.folderManager.deleteConfirmOpen = false;
    state.folderManager.pendingDeleteMailbox = null;
    state.folderManager.deleteConfirmChecked = false;
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    const remaining = state.folderManager.report?.entries.map((e) => e.mailbox) ?? [];
    if (remaining.length) await fmSelectMailbox(remaining[0]!);
    else {
      state.folderManager.selectedMailbox = null;
      state.threads = [];
    }
    if (out.errors.length) toast(`Suppression partielle : ${out.errors[0]}`);
    else toast(`${out.deletedMailboxes} dossier(s) supprimé(s).`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.busyMailbox = null;
    state.folderManager.busyAction = null;
    render();
  }
}

function wireFolderManagerDnD(): void {
  if (state.view !== "folderManager") return;
  document.querySelectorAll<HTMLElement>(".folder-tree-act, .folder-tree-chevron, .folder-tree-drag-handle").forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });
  document.querySelectorAll<HTMLElement>("[data-action=fm-drag-start]").forEach((el) => {
    el.addEventListener("dragstart", (ev) => {
      const mb = el.dataset.mailbox?.trim();
      if (!mb) return;
      state.folderManager.dragFolder = mb;
      ev.dataTransfer?.setData("text/plain", mb);
      ev.dataTransfer!.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => {
      state.folderManager.dragFolder = null;
      state.folderManager.dropTarget = null;
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-drop-mailbox]").forEach((el) => {
    el.addEventListener("dragover", (ev) => {
      const target = el.dataset.dropMailbox?.trim();
      if (!target) return;
      const isThread = ev.dataTransfer?.types.includes("application/x-rustymail-thread");
      const from = state.folderManager.dragFolder;
      if (isThread) {
        ev.preventDefault();
        state.folderManager.dropTarget = target;
        ev.dataTransfer!.dropEffect = "move";
        return;
      }
      if (!from || target === from || isDescendantMailboxPath(from, target)) return;
      ev.preventDefault();
      state.folderManager.dropTarget = target;
      ev.dataTransfer!.dropEffect = "move";
    });
    el.addEventListener("dragleave", () => {
      state.folderManager.dropTarget = null;
    });
    el.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const target = el.dataset.dropMailbox?.trim();
      const tid = ev.dataTransfer?.getData("application/x-rustymail-thread")?.trim();
      const from = state.folderManager.dragFolder ?? ev.dataTransfer?.getData("text/plain")?.trim();
      state.folderManager.dropTarget = null;
      if (tid && target) {
        void onThreadMoveTo(tid, target).then(async () => {
          await refreshFolderManagerTree();
          if (state.folderManager.selectedMailbox) await fmSelectMailbox(state.folderManager.selectedMailbox);
        });
        return;
      }
      if (from && target) void fmMoveFolder(from, target);
    });
  });
  document.querySelectorAll<HTMLElement>(".inbox-thread-row[data-thread-id]").forEach((el) => {
    el.setAttribute("draggable", "true");
    el.addEventListener("dragstart", (ev) => {
      const tid = el.dataset.threadId?.trim();
      if (!tid) return;
      ev.dataTransfer?.setData("application/x-rustymail-thread", tid);
      ev.dataTransfer!.effectAllowed = "move";
    });
  });
}

async function openOrganizationMailbox(mailbox: string) {
  const mb = mailbox.trim();
  if (!mb) return;
  beginNavigation("list");
  state.view = "list";
  state.selectedContactEmail = undefined;
  exitSearchModeForMailboxBrowse();
  await switchMailbox(mb);
  render();
}

async function openContactsView() {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour le carnet.");
    return;
  }
  beginNavigation("contacts", { resetStack: true });
  state.view = "contacts";
  state.selectedContactEmail = undefined;
  clearContactProfile();
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  clearThreadAiSummaryState();
  render();
  try {
    await loadContactsList(acc.id, { reset: true });
    await loadAddressBookSidebarCount();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

async function openContactDetailView(email: string, opts?: { skipHistory?: boolean }) {
  const acc = currentAccount();
  if (!acc?.id) return;
  const em = email.trim().toLowerCase();
  if (!em) return;
  beginNavigation("contact", { skipHistory: opts?.skipHistory });
  state.view = "contact";
  state.selectedContactEmail = em;
  clearContactProfile();
  render();
  try {
    await loadContactDetail(acc.id, em);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  recordActivity({ eventType: "contact_opened", senderEmail: em });
  render();
}

function launchContactMailSearch(opts: {
  email: string;
  listFilter?: State["listFilter"];
  text?: string;
  hybrid?: boolean;
}) {
  const email = opts.email.trim().toLowerCase();
  if (!email) return;
  navReset();
  state.view = "list";
  state.searchModalOpen = false;
  state.searchAccountOverrideId = null;
  state.searchMailboxPath = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchLanguageFilter = null;
  state.searchSenders = [email];
  state.search = opts.text?.trim() ?? "";
  state.searchDraft = state.search;
  state.listFilter = opts.listFilter ?? "all";
  state.searchNlMode = opts.hybrid ? "hybrid" : null;
  state.searchScope = "account";
  state.searchModifiersTouched = true;
  state.selectedContactEmail = undefined;
  render();
  void searchThreads();
}

async function loadAddressBookSidebarCount(): Promise<void> {
  if (!isTauriRuntime()) {
    state.addressBookSidebarCount = null;
    return;
  }
  const acc = currentAccount();
  if (!acc?.id) {
    state.addressBookSidebarCount = null;
    return;
  }
  try {
    const n = await invoke<number>("count_address_contacts_scoped_cmd", { accountId: acc.id });
    state.addressBookSidebarCount = Math.max(0, Math.floor(Number(n)) || 0);
  } catch {
    state.addressBookSidebarCount = null;
  }
}

function syncCommitSearchDraftForSave(): void {
  if (!searchDraftDiffersFromCommitted()) return;
  const draftSnap = draftSearchCriteriaSnapshot();
  if (!hasSavableSearchCriteria(draftSnap)) return;
  if (searchCriteriaSnapshotsEqual(draftSnap, committedSearchCriteriaSnapshot())) return;
  const raw = state.searchDraft.trim();
  const parsed = parseSearchBarDraft(raw, state.newsletterRules);
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parsed);
  state.search = parsed.text;
  state.searchModifiersTouched = false;
}

function suggestSavedSearchName(): string {
  if (state.searchTags.length === 1) {
    const t = state.searchTags[0]!;
    return `#${String(t.family).toLowerCase()}:${t.value}`.slice(0, 100);
  }
  if (state.searchSenders.length === 1) return state.searchSenders[0]!.slice(0, 100);
  const q = state.search.trim();
  if (q) return q.slice(0, 100);
  if (state.searchNewsletterRule) return formatNewsletterRuleInput(state.searchNewsletterRule).slice(0, 100);
  return "Ma vue";
}

function findNewsletterRuleByParts(domain: string, localPart: string | null): NewsletterRuleRow | null {
  const dom = domain.trim().toLowerCase();
  if (!dom) return null;
  const lp = (localPart?.trim() || "*").toLowerCase();
  const hit = state.newsletterRules.find(
    (r) => r.domain.toLowerCase() === dom && (r.localPart ?? "*").toLowerCase() === lp,
  );
  if (hit) return hit;
  return { domain: dom, localPart: lp };
}

async function refreshSavedSearches(includeCounts = true): Promise<void> {
  if (!isTauriRuntime()) {
    state.savedSearches = [];
    return;
  }
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    state.savedSearches = [];
    state.activeSavedSearchId = null;
    return;
  }
  try {
    state.savedSearches = await listSavedSearchesCmd(accountId, includeCounts);
    if (state.activeSavedSearchId && !state.savedSearches.some((s) => s.id === state.activeSavedSearchId)) {
      state.activeSavedSearchId = null;
    }
  } catch (e) {
    console.warn("list_saved_searches", e);
  }
}

async function markActiveSavedSearchSeen(options?: { toast?: boolean }): Promise<boolean> {
  const accountId = currentAccount()?.id?.trim();
  const sid = state.activeSavedSearchId;
  if (!accountId || !sid) {
    if (options?.toast !== false) toast("Aucune vue active à marquer.");
    return false;
  }
  if (state.savedSearchMarkingSeenId === sid) return false;
  state.savedSearchMarkingSeenId = sid;
  try {
    patchSavedSearchNewCount(sid, 0);
    render();
    const updated = await markSavedSearchSeenCmd(accountId, sid);
    patchSavedSearchNewCount(sid, 0, updated.lastSeenAt ?? undefined);
    recordActivity({ eventType: "saved_view_seen", metaJson: JSON.stringify({ savedSearchId: sid }) });
    await refreshSavedSearches(true);
    const row = state.savedSearches.find((s) => s.id === sid);
    if (row && (row.newCount ?? 0) > 0) patchSavedSearchNewCount(sid, 0, updated.lastSeenAt ?? undefined);
    if (options?.toast) toast("Vue marquée à jour.");
    render();
    return true;
  } catch (e) {
    await refreshSavedSearches(true);
    render();
    toast(tauriErrorMessage(e));
    return false;
  } finally {
    state.savedSearchMarkingSeenId = null;
  }
}

async function saveCurrentSearchView(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Vues enregistrées : disponible dans l’app Tauri.");
    return;
  }
  const accountId = searchAccountIdForQuery();
  if (!accountId) {
    toast("Choisissez un compte avant d’enregistrer une vue.");
    return;
  }
  syncCommitSearchDraftForSave();
  if (!canSaveSearchView()) {
    toast("Lancez d’abord la recherche (Entrée), puis enregistrez la vue.");
    return;
  }
  const defaultName = suggestSavedSearchName();
  const name = window.prompt("Nom de la vue enregistrée", defaultName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toast("Nom de vue invalide.");
    return;
  }
  const iconRaw = window.prompt("Icône courte (2–4 caractères)", "Vu");
  if (iconRaw === null) return;
  const icon = (iconRaw.trim() || "Vu").slice(0, 4);
  const query = buildSearchQueryFromCurrentState();
  const ui = buildSavedSearchUiState({
    listFilter: state.listFilter,
    searchScope: state.searchScope,
    searchNlMode: state.searchNlMode,
    searchDraft: state.searchDraft,
    searchNewsletterRule: state.searchNewsletterRule,
    searchModifiersTouched: state.searchModifiersTouched,
  });
  try {
    const saved = await upsertSavedSearchCmd(
      buildSavedSearchUpsert(accountId, trimmed, query, ui, { icon }),
    );
    state.activeSavedSearchId = saved.id;
    await markSavedSearchSeenCmd(accountId, saved.id);
    recordActivity({ eventType: "saved_view_created", metaJson: JSON.stringify({ savedSearchId: saved.id }) });
    toast(`Vue « ${trimmed} » enregistrée — surveillance à jour.`);
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function applySavedSearchView(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    toast("Compte requis pour ouvrir une vue.");
    return;
  }
  try {
    const saved = await applySavedSearchCmd(accountId, id);
    state.activeSavedSearchId = saved.id;
    state.view = "list";
    state.selectedContactEmail = undefined;
    await markSavedSearchSeenCmd(accountId, saved.id);
    applySavedSearchToState(saved, state, {
      findNewsletterRule: findNewsletterRuleByParts,
      resolveMailboxPath: resolveSearchMailboxPath,
    });
    if (saved.query.accountId?.trim()) {
      state.selectedAccountId = saved.query.accountId.trim();
    }
    document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
      el.value = state.searchDraft;
    });
    await searchThreads();
    recordActivity({ eventType: "saved_view_applied", metaJson: JSON.stringify({ savedSearchId: saved.id }) });
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function deleteSavedSearchView(id: string): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !id.trim()) return;
  const item = state.savedSearches.find((s) => s.id === id);
  const ok = await openConfirmModal({
    title: "Supprimer la vue ?",
    body: item ? `« ${item.name} » sera retirée de la sidebar.` : "Cette vue sera supprimée.",
    danger: true,
    confirmLabel: "Supprimer",
  });
  if (!ok) return;
  try {
    await deleteSavedSearchCmd(accountId, id);
    if (state.activeSavedSearchId === id) state.activeSavedSearchId = null;
    toast("Vue supprimée.");
    await refreshSavedSearches(true);
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

function searchViewBatchThreads(): ThreadListItem[] {
  return threadsVisibleInList().slice(0, SAVED_VIEW_BATCH_MAX);
}

async function bulkMarkReadSearchViewThreads(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Marquer lus : IMAP requiert l’app Tauri.");
    return;
  }
  if (!isSearchActive() && !state.activeSavedSearchId) {
    toast("Actions lot : ouvrez une recherche ou une vue enregistrée.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const visible = searchViewBatchThreads();
  if (!visible.length) {
    toast("Aucune conversation dans cette vue.");
    return;
  }
  const ok = await openConfirmModal({
    title: "Marquer comme lus ?",
    body: `Marquer comme lus jusqu’à ${visible.length} conversation(s) affichée(s) (plafond ${SAVED_VIEW_BATCH_MAX}).`,
    confirmLabel: "Marquer lus",
  });
  if (!ok) return;
  recordActivity({
    eventType: "bulk_mark_read",
    metaJson: JSON.stringify({ count: visible.length }),
  });
  const unreadTargets = visible.filter((t) => t.unread);
  let done = 0;
  const errors: string[] = [];
  const total = unreadTargets.length;
  if (total > 0) upsertStatusBarJob({ id: "bulk-mark-read", label: "Marquage lu (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < unreadTargets.length; i++) {
      const t = unreadTargets[i]!;
      const tid = String(t.id);
      try {
        const mailbox = sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("thread_mark_read", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        t.unread = false;
        done++;
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
      upsertStatusBarJob({ id: "bulk-mark-read", label: "Marquage lu (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-mark-read");
  }
  if (errors.length) toast(`Marquage partiel : ${errors[0]}`);
  else toast(done ? `${done} conversation(s) marquée(s) lue(s).` : "Aucun fil non lu dans la sélection.");
  render();
}

async function bulkArchiveSearchViewThreads(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Archivage : IMAP requiert l’app Tauri.");
    return;
  }
  if (!isSearchActive() && !state.activeSavedSearchId) {
    toast("Actions lot : ouvrez une recherche ou une vue enregistrée.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Archivage : actions IMAP uniquement.");
    return;
  }
  const visible = searchViewBatchThreads();
  if (!visible.length) {
    toast("Aucune conversation dans cette vue.");
    return;
  }
  const ok = await openConfirmModal({
    title: "Archiver le lot ?",
    body: `Archiver jusqu’à ${visible.length} conversation(s) (plafond ${SAVED_VIEW_BATCH_MAX}).`,
    confirmLabel: "Archiver",
  });
  if (!ok) return;
  recordActivity({
    eventType: "bulk_archive",
    metaJson: JSON.stringify({ count: visible.length }),
  });
  const prevThreads = state.threads;
  const ids = new Set(visible.map((t) => String(t.id)));
  markThreadsRecentlyRemoved(ids);
  state.threads = state.threads.filter((t) => !ids.has(String(t.id)));
  if (state.view === "thread" && state.selectedThreadId && ids.has(String(state.selectedThreadId))) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  render();
  let moved = 0;
  const errors: string[] = [];
  const idList = [...ids];
  const total = idList.length;
  upsertStatusBarJob({ id: "bulk-archive", label: "Archivage (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < idList.length; i++) {
      const tid = idList[i]!;
      try {
        const mailbox = sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("move_thread_archive", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        moved++;
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
      upsertStatusBarJob({ id: "bulk-archive", label: "Archivage (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-archive");
  }
  if (errors.length) {
    clearThreadsRecentlyRemoved(ids);
    state.threads = prevThreads;
    toast(`Archivage partiel : ${errors[0]}`);
    render();
    return;
  }
  toast(`${moved} conversation(s) archivée(s).`);
  await searchThreads();
}

async function runFluxAffinerFromSearchView(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Affiner : disponible dans l’app Tauri.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureOrgProposalsEnabled")) {
    toast("Activez « Propositions Organiser (LLM) » dans Paramètres → IA.");
    return;
  }
  const account = currentAccount();
  if (!account?.id) {
    toast("Compte requis.");
    return;
  }
  const visible = searchViewBatchThreads().slice(0, 50);
  if (visible.length < 5) {
    toast("Affiner : au moins 5 fils visibles requis.");
    return;
  }
  const viewLabel =
    activeSavedSearchItem()?.name?.trim() ||
    state.search.trim() ||
    "Recherche";
  const samples = visible.map((t) => ({
    subject: t.subject,
    sender: t.participants[0] ?? "",
    mailbox: t.mailbox ?? state.selectedMailbox ?? "INBOX",
  }));
  try {
    const result = await withLlmQueue("Affiner le flux", async (signal) => {
      if (signal.aborted) throw new Error("Annulé");
      return withTimeout(
        invoke<FluxAffinerResult>("llm_affiner_flux_cmd", {
          payload: {
            accountId: account.id,
            viewLabel,
            samples,
            existingMailboxes: state.mailboxes,
          },
        }),
        LLM_INVOKE_TIMEOUT_MS,
      );
    });
    if (!result) return;
    const pct = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100);
    const ok = await openConfirmModal({
      title: "Affiner — dossier suggéré",
      body: `« ${result.folderTitle} » (${pct} % de confiance)\n\n${result.rationale}\n\nCréer ce dossier IMAP et y déplacer ${visible.length} fil(s) ?`,
      confirmLabel: "Créer et déplacer",
    });
    if (!ok) return;
    const mailbox = result.folderTitle.trim();
    const total = visible.length;
    setSearchViewBatchJob({ phase: "create", done: 0, total: 1, target: mailbox });
    toast(`Création du dossier « ${mailbox} »…`, 4500);
    await withTimeout(
      invoke<string>("create_imap_mailbox", { accountId: account.id, mailbox }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    setSearchViewBatchJob({ phase: "move", done: 0, total, target: mailbox });
    toast(`Déplacement de ${total} fil(s) vers « ${mailbox} »…`, 5000);
    const ids = new Set(visible.map((t) => String(t.id)));
    let moved = 0;
    const errors: string[] = [];
    for (const t of visible) {
      const tid = String(t.id);
      const src = (t.mailbox?.trim() || sourceMailboxForThread(tid)).trim() || "INBOX";
      try {
        await withTimeout(
          invoke<string>("move_thread_mailbox", {
            accountId: account.id,
            mailbox: src,
            threadId: tid,
            destMailbox: mailbox,
          }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        moved++;
        setSearchViewBatchJob({ phase: "move", done: moved, total, target: mailbox });
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
    }
    setSearchViewBatchJob(null, false);
    if (moved > 0) {
      state.threads = state.threads.filter((row) => !ids.has(String(row.id)));
      if (state.view === "thread" && state.selectedThreadId && ids.has(String(state.selectedThreadId))) {
        state.view = "list";
        state.selectedThread = undefined;
        state.selectedThreadId = undefined;
      }
    }
    if (errors.length && moved === 0) {
      toast(`Déplacement échoué : ${errors[0]}`, 10_000);
    } else if (errors.length) {
      toast(`${moved}/${total} fil(s) déplacé(s) vers « ${mailbox} » · ${errors.length} échec(s).`, 10_000);
    } else {
      toast(`${moved} fil(s) déplacé(s) vers « ${mailbox} ».`, 10_000);
    }
    state.syncMessage = moved > 0 ? `${moved} déplacé(s) → ${mailbox}` : "";
    if (moved > 0) {
      recordActivity({
        eventType: "affiner_applied",
        metaJson: JSON.stringify({ mailbox, moved, total }),
      });
    }
    await refreshMailboxesAfterImapChange();
    if (moved > 0) await searchThreads();
    else render();
    if (state.syncMessage) {
      window.setTimeout(() => {
        if (state.syncMessage === `${moved} déplacé(s) → ${mailbox}`) {
          state.syncMessage = "";
          render();
        }
      }, 3500);
    }
  } catch (e) {
    setSearchViewBatchJob(null, false);
    const msg = tauriErrorMessage(e);
    if (!msg.toLowerCase().includes("annul")) toast(msg);
  }
}

async function launchDomainMailSearch(domain: string): Promise<void> {
  const dom = domain.trim().toLowerCase().replace(/^@+/, "");
  if (!dom) return;
  const acc = currentAccount();
  if (!acc?.id || !isTauriRuntime()) {
    toast("Recherche domaine : compte ou Tauri requis.");
    return;
  }
  try {
    const senders = await invoke<string[]>("list_sender_emails_for_domain_cmd", {
      accountId: acc.id,
      domain: dom,
    });
    const emails = (senders ?? []).map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@"));
    if (!emails.length) {
      toast(`Aucun expéditeur local pour @${dom}.`);
      return;
    }
    navReset();
    state.view = "list";
    state.searchModalOpen = false;
    state.searchAccountOverrideId = null;
    state.searchMailboxPath = null;
    state.searchTags = [];
    state.searchNewsletterRule = null;
    state.searchLanguageFilter = null;
    state.searchSenders = emails;
    state.search = "";
    state.searchDraft = "";
    state.listFilter = "all";
    state.searchNlMode = null;
    state.searchScope = "account";
    state.searchModifiersTouched = true;
    state.selectedContactEmail = undefined;
    render();
    void searchThreads();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

function isSearchActive(): boolean {
  if (state.view === "folderManager" && folderManagerPanelMailbox()) return false;
  if (state.activeSavedSearchId) return true;
  return hasCommittedSearchCriteria(committedSearchCriteriaSnapshot());
}

function usesSearchContextLoader(): boolean {
  if (state.view === "folderManager" && folderManagerBrowsingPanel()) return false;
  if (isSavedDraftsVirtualMailbox(listMailboxForPanel())) return false;
  if (isSearchActive()) return true;
  return (
    state.searchScope === "account" &&
    (state.listFilter !== "all" || state.searchNewsletterRule !== null)
  );
}

function threadMatchesNewsletterRule(thread: ThreadListItem, rule: NewsletterRuleRow): boolean {
  for (const p of thread.participants) {
    const matched = firstMatchingNewsletterRule(p);
    if (!matched) continue;
    if (
      matched.domain.toLowerCase() === rule.domain.toLowerCase() &&
      matched.localPart.toLowerCase() === (rule.localPart ?? "*").toLowerCase()
    ) {
      return true;
    }
  }
  return false;
}

function mergeSearchBarTagOnTarget(
  target: SearchStructuralState & { searchTags: Tag[] },
  raw: { family: string; value: string }
): void {
  const value = raw.value.trim();
  if (!value) return;
  const family = tagFamilyForInvoke(raw.family);
  const key = `${family}:${value}`.toLowerCase();
  if (target.searchTags.some((t) => `${t.family}:${t.value}`.toLowerCase() === key)) return;
  target.searchTags.push({ family, value });
}

function addSearchSenderOnTarget(target: SearchStructuralState, email: string): void {
  const c = canonicalEmailForNlMatch(email) ?? email.trim().toLowerCase();
  if (!c) return;
  if (!target.searchSenders.some((s) => s.toLowerCase() === c)) target.searchSenders.push(c);
}

function applyParsedSearchBarToStructural(
  target: SearchStructuralState & { searchTags: Tag[] },
  parsed: ReturnType<typeof parseSearchBarDraft>
): void {
  target.search = parsed.text;
  if (parsed.scope !== undefined) target.searchScope = parsed.scope;
  if (parsed.mailboxPath !== undefined) {
    const raw = parsed.mailboxPath?.trim() || null;
    target.searchMailboxPath = raw ? resolveSearchMailboxPath(raw) : null;
    if (target.searchMailboxPath) target.searchScope = "mailbox";
  }
  if (parsed.accountRef !== undefined) {
    const id = parsed.accountRef?.trim() ? resolveAccountIdFromRef(parsed.accountRef) : null;
    target.searchAccountOverrideId = id;
    if (id && target === state) {
      state.selectedAccountId = id;
      target.searchScope = "account";
    } else if (id) {
      target.searchScope = "account";
    } else if (!parsed.accountRef?.trim()) {
      target.searchAccountOverrideId = null;
    }
  }
  for (const s of parsed.senders) addSearchSenderOnTarget(target, s);
  for (const t of parsed.tags) mergeSearchBarTagOnTarget(target, t);
  if (parsed.listFilter !== undefined) {
    target.listFilter = parsed.listFilter;
    if (parsed.listFilter === "all") target.searchNewsletterRule = null;
  }
  if (parsed.newsletterRule !== undefined) {
    target.searchNewsletterRule = parsed.newsletterRule;
  }
  if (parsed.relativeDays !== undefined) {
    target.searchRelativeDays =
      parsed.relativeDays > 0 ? Math.floor(parsed.relativeDays) : null;
  }
  if (parsed.hasAttachment !== undefined) {
    target.searchHasAttachment = parsed.hasAttachment;
  }
  if (parsed.minSecurityScore !== undefined) {
    target.searchMinSecurityScore = Number.isFinite(parsed.minSecurityScore)
      ? parsed.minSecurityScore
      : null;
  }
  if (parsed.mailboxPrefix !== undefined) {
    const prefix = parsed.mailboxPrefix?.trim() || null;
    target.searchMailboxPrefix = prefix;
    if (prefix) target.searchScope = "account";
  }
}

function applyParsedSearchBarToState(parsed: ReturnType<typeof parseSearchBarDraft>): void {
  applyParsedSearchBarToStructural(state, parsed);
}

function hasSearchBarCriteria(): boolean {
  return Boolean(
    state.search.trim() ||
      state.searchSenders.length > 0 ||
      state.searchMailboxPath?.trim() ||
      state.searchAccountOverrideId?.trim() ||
      state.searchTags.length > 0 ||
      state.searchNewsletterRule ||
      state.searchLanguageFilter?.trim() ||
      state.listFilter !== "all" ||
      state.searchModifiersTouched ||
      state.searchRelativeDays != null ||
      state.searchHasAttachment != null ||
      state.searchMinSecurityScore != null ||
      state.searchMailboxPrefix?.trim()
  );
}

function toastSearchBarResult(): void {
  const n = threadsVisibleInList().length;
  const mbTarget = searchMailboxForQuery();
  const scope =
    state.searchScope === "account" && !mbTarget
      ? " · tout le compte"
      : ` · ${threadMailboxListLabel(mbTarget ?? (state.selectedMailbox || "INBOX")).full}`;
  const parts: string[] = [];
  if (state.searchSenders.length) parts.push(`de: ${state.searchSenders.join(", ")}`);
  if (state.searchMailboxPath?.trim()) parts.push(`dossier: ${state.searchMailboxPath}`);
  if (state.searchTags.length) parts.push(`${state.searchTags.length} tag(s)`);
  if (state.search.trim()) parts.push(`« ${state.search.trim()} »`);
  if (state.searchNewsletterRule) parts.push(formatNewsletterRuleInput(state.searchNewsletterRule));
  if (state.listFilter === "auto") parts.push("auto");
  else if (state.listFilter === "focused") parts.push("priorité");
  else if (state.listFilter === "unread") parts.push("non lus");
  else if (state.listFilter === "starred") parts.push("suivis");
  const hint = parts.length ? parts.join(" · ") : "tous les messages";
  if (n === 0) {
    const scopeHint =
      state.searchScope === "mailbox"
        ? " Essayez #compte dans la barre si les messages sont dans un autre dossier."
        : "";
    toast(`Aucun résultat (${hint})${scope}.${scopeHint}`);
  }
  else toast(`${n} conversation${n === 1 ? "" : "s"} · ${hint}${scope}.`);
}

async function applySearchBarQuery(): Promise<void> {
  if (searchQueryUsesThreadsApi()) {
    await searchThreads();
    return;
  }
  if (isSearchActive()) {
    await loadThreadsForSearchContext(false);
    return;
  }
  await loadMailView(false);
}

function applyHashAutocompleteHitToState(hit: InboxFilterHit): void {
  state.searchModifiersTouched = true;
  const searchIn = document.querySelector<HTMLInputElement>("#search-input");
  if (searchIn) state.searchDraft = searchIn.value;

  if (hit.id.startsWith("mailbox:")) {
    const raw = hit.id.slice(8);
    state.searchMailboxPath = resolveSearchMailboxPath(raw) ?? raw;
    state.searchScope = "mailbox";
    return;
  }
  if (hit.id.startsWith("account:")) {
    const id = hit.id.slice(8);
    state.searchAccountOverrideId = id;
    state.selectedAccountId = id;
    state.searchScope = "account";
    return;
  }
  if (hit.id.startsWith("tag:")) {
    const body = hit.id.slice(4);
    const sep = body.indexOf("\0");
    if (sep >= 0) {
      mergeSearchBarTag({ family: body.slice(0, sep), value: body.slice(sep + 1) });
    }
    return;
  }
  if (hit.id === "scope:account") {
    state.searchScope = "account";
    state.searchMailboxPath = null;
    return;
  }
  if (hit.id === "scope:mailbox") {
    state.searchScope = "mailbox";
    state.searchMailboxPath = null;
  }
}

async function applyInboxFilterFromHashHit(hit: InboxFilterHit): Promise<void> {
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) return;
  applyHashAutocompleteHitToState(hit);
  if (hit.id.startsWith("mailbox:")) {
    toast(`Dossier : ${state.searchMailboxPath}`);
    if (hasSearchBarCriteria()) {
      await applySearchBarQuery();
      toastSearchBarResult();
    }
    render();
    return;
  }
  if (hit.id.startsWith("account:")) {
    const id = hit.id.slice(8);
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: id }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
    const acc = state.accounts.find((a) => a.id === id);
    toast(`Compte : ${acc?.email ?? id}`);
    void refreshSearchTagCatalog();
    if (hasSearchBarCriteria()) {
      await applySearchBarQuery();
      toastSearchBarResult();
    }
    render();
    return;
  }
  if (hit.id.startsWith("tag:")) {
    const body = hit.id.slice(4);
    const sep = body.indexOf("\0");
    if (sep >= 0) {
      toast(`Tag : ${body.slice(0, sep)}:${body.slice(sep + 1)}`);
      if (hasSearchBarCriteria()) {
        await applySearchBarQuery();
        toastSearchBarResult();
      }
    }
    render();
    return;
  }
  if (hit.id.startsWith("scope:")) {
    toast(
      state.searchScope === "account"
        ? "Portée : tout le compte (tous dossiers synchronisés)"
        : `Portée : ${threadMailboxListLabel(state.selectedMailbox || "INBOX").full}`
    );
    if (hasSearchBarCriteria()) {
      await applySearchBarQuery();
      toastSearchBarResult();
    }
    render();
    return;
  }
  resetManualSearchNlFilters();
  state.searchSenders = [];
  state.search = "";
  state.searchDraft = "";
  if (hit.id.startsWith("list:")) {
    state.searchNewsletterRule = null;
    const kind = hit.id.slice(5) as State["listFilter"];
    state.listFilter = kind;
    await applySearchBarQuery();
    toastSearchBarResult();
    render();
    return;
  }
  if (hit.id.startsWith("rule:")) {
    const body = hit.id.slice(5);
    const sep = body.indexOf("\0");
    if (sep < 0) return;
    state.searchNewsletterRule = {
      domain: body.slice(0, sep),
      localPart: body.slice(sep + 1),
    };
    state.listFilter = "all";
    await applySearchBarQuery();
    toastSearchBarResult();
    render();
  }
}

function searchDraftDiffersFromCommitted(): boolean {
  return !searchCriteriaSnapshotsEqual(
    draftSearchCriteriaSnapshot(),
    committedSearchCriteriaSnapshot()
  );
}

function resetManualSearchNlFilters(): void {
  state.searchNlMode = null;
  state.searchLanguageFilter = null;
}

function resetSearchStructuralModifiers(): void {
  resetSearchStructuralState(state);
}

async function clearSearchAndReloadInbox(): Promise<void> {
  state.search = "";
  state.searchDraft = "";
  state.searchSenders = [];
  state.searchMailboxPath = null;
  state.searchAccountOverrideId = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchScope = "account";
  state.searchModifiersTouched = false;
  state.searchRelativeDays = null;
  state.searchHasAttachment = null;
  state.searchMinSecurityScore = null;
  state.searchMailboxPrefix = null;
  state.activeSavedSearchId = null;
  resetManualSearchNlFilters();
  await loadMailView(false);
  render();
}

function threadsVisibleInList(): ThreadListItem[] {
  let base = state.threads;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) return base;
  if (state.searchNewsletterRule) {
    const rule = state.searchNewsletterRule;
    base = base.filter((t) => threadMatchesNewsletterRule(t, rule));
  }
  /** Résultats recherche : ne pas masquer via les puces Non lus / Priorité / Auto. */
  if (isSearchActive()) return base;
  if (state.listFilter === "unread") return base.filter((t) => t.unread);
  if (state.listFilter === "starred") return base.filter((t) => threadListFollowed(t));
  if (state.listFilter === "focused") return base.filter((t) => !t.isNewsletterThread);
  if (state.listFilter === "auto") return base.filter((t) => Boolean(t.isNewsletterThread));
  return base;
}

function threadListFollowed(thread: ThreadListItem): boolean {
  return Boolean(thread.followed);
}

function activeMessageTranslationJobCount(): number {
  return Object.values(state.messageTranslationBusy).filter(Boolean).length;
}

function activeSecurityLlmAugmentCount(): number {
  let n = 0;
  for (const v of Object.values(securityLlmAugmentBusy)) {
    if (v) n += 1;
  }
  return n;
}

function orgApplyStatusMessage(
  proposalId: string,
  actionOverride?: import("../organizationView").OrgActionOverride | null,
): string {
  if (actionOverride === "trash") return "Mise en corbeille (lot)…";
  if (actionOverride === "archive") return "Archivage (lot)…";
  if (actionOverride === "markRead") return "Marquage comme lu (lot)…";
  const p = state.organization.report?.proposals.find((x) => x.id === proposalId);
  if (!p) return "Traitement organisation…";
  switch (p.suggestedAction) {
    case "retag":
      return "Normalisation des tags (lot)…";
    case "archive":
      return "Archivage (lot)…";
    case "trash":
      return "Mise en corbeille (lot)…";
    case "markRead":
      return "Marquage comme lu (lot)…";
    case "move":
      return p.targetMailbox ? `Déplacement vers « ${p.targetMailbox} »…` : "Déplacement (lot)…";
    case "deleteMailbox":
      return "Suppression des dossiers vides…";
    default:
      return "Traitement organisation…";
  }
}

let statusBarProgressPaintQueued = false;

function upsertStatusBarJob(job: StatusBarProgressJob, renderNow = false): void {
  const idx = state.statusBarJobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) state.statusBarJobs[idx] = job;
  else state.statusBarJobs.push(job);
  if (renderNow) {
    render();
    return;
  }
  scheduleStatusBarProgressPaint();
}

function clearStatusBarJob(id: string, renderNow = false): void {
  const before = state.statusBarJobs.length;
  state.statusBarJobs = state.statusBarJobs.filter((j) => j.id !== id);
  if (before === state.statusBarJobs.length && !renderNow) return;
  if (renderNow) render();
  else scheduleStatusBarProgressPaint();
}

function scheduleStatusBarProgressPaint(): void {
  if (statusBarProgressPaintQueued) return;
  statusBarProgressPaintQueued = true;
  requestAnimationFrame(() => {
    statusBarProgressPaintQueued = false;
    paintStatusBarProgressDom();
  });
}

function gatherStatusBarProgressJobs(): StatusBarProgressJob[] {
  const byId = new Map<string, StatusBarProgressJob>();
  const put = (job: StatusBarProgressJob) => {
    byId.set(job.id, job);
  };

  for (const j of state.statusBarJobs) put(j);

  const batch = state.searchViewBatchJob;
  if (batch) {
    const target = batch.target.trim() || "dossier";
    put({
      id: "search-view-batch",
      label: batch.phase === "create" ? `Création « ${target} »` : `Déplacement → ${target}`,
      done: batch.done,
      total: batch.total,
    });
  }

  if (state.syncInProgress) {
    const batchProg = state.syncProgressBatch;
    put({
      id: "imap-sync",
      label: (state.syncMessage || "Synchronisation IMAP").replace(/^Sync…\s*/i, "").trim() || "Synchronisation IMAP",
      done: batchProg?.current ?? 0,
      total: batchProg?.total ?? null,
    });
  }

  if (state.organization.scanning) {
    put({ id: "org-scan", label: "Analyse Organiser", done: 0, total: null });
  } else if (state.organization.applying) {
    const msg = (state.organization.applyMessage || "Application Organiser").replace(/…+$/, "").trim();
    put({ id: "org-apply", label: msg || "Application Organiser", done: 0, total: null });
  }

  if (state.organizationV2.scanning) {
    put({ id: "org-v2-scan", label: "Analyse Organiser V2", done: 0, total: null });
  } else if (state.organizationV2.applying) {
    const msg = (state.organizationV2.applyMessage || "Application Organiser V2").replace(/…+$/, "").trim();
    put({
      id: "org-v2-apply",
      label: msg || "Application Organiser V2",
      done: state.organizationV2.applyDone,
      total: state.organizationV2.applyTotal,
    });
  }

  if (state.folderManager.archiveProgress?.trim()) {
    put({
      id: "folder-archive",
      label: state.folderManager.archiveProgress.replace(/…+$/, "").trim() || "Archivage dossier",
      done: 0,
      total: null,
    });
  }

  if (state.llmJobLabel?.trim()) {
    put({
      id: "llm-queue",
      label: state.llmJobLabel.trim(),
      done: 0,
      total: null,
    });
  }

  if (state.llmPrefetchPercent != null) {
    put({
      id: "llm-prefetch",
      label: "Téléchargement modèle LLM",
      done: state.llmPrefetchPercent,
      total: 100,
    });
  }

  return Array.from(byId.values());
}

function paintLlmPrefetchProgressDom(): void {
  const pct = state.llmPrefetchPercent;
  const active = state.llmPrefetchInFlight || (pct != null && Number.isFinite(pct));
  const pctRounded =
    pct != null && Number.isFinite(pct) ? Math.min(100, Math.max(0, Math.round(pct))) : 0;
  const labelHtml =
    pct != null && Number.isFinite(pct)
      ? `Téléchargement : <strong>${pctRounded}%</strong>`
      : "Téléchargement du modèle…";
  document.querySelectorAll<HTMLElement>("[data-llm-prefetch-block]").forEach((block) => {
    block.hidden = !active;
    if (!active) return;
    const label = block.querySelector<HTMLElement>("[data-llm-prefetch-label]");
    if (label) label.innerHTML = labelHtml;
    const fill = block.querySelector<HTMLElement>("[data-llm-prefetch-fill]");
    if (fill) fill.style.width = `${pctRounded}%`;
    const track = block.querySelector<HTMLElement>("[data-llm-prefetch-track]");
    if (track) track.setAttribute("aria-valuenow", String(pctRounded));
    const cancelBtn = block.querySelector<HTMLButtonElement>('[data-action="cancel-llm-prefetch"]');
    if (cancelBtn) cancelBtn.disabled = !state.llmPrefetchInFlight && pct == null;
  });
}

function paintStatusBarProgressDom(): void {
  const bar = document.querySelector<HTMLElement>(".status-bar-wrap > .status-bar");
  if (!bar) return;
  const jobs = gatherStatusBarProgressJobs();
  const html = renderStatusBarProgressInlineHtml(jobs, escapeHtml, escapeAttr);
  const existing = bar.querySelector(".status-bar-progress-slot");
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.outerHTML = html;
    return;
  }
  const anchor = bar.querySelector(".status-bar-compact") ?? bar.querySelector(".status-bar-sep");
  if (anchor) anchor.insertAdjacentHTML("afterend", html);
  else bar.insertAdjacentHTML("beforeend", html);
}

function searchViewBatchJobStatusText(): string {
  const j = state.searchViewBatchJob;
  if (!j) return "";
  const target = j.target.trim() || "dossier";
  if (j.phase === "create") return `Création « ${target} »…`;
  return `Déplacement ${j.done}/${j.total} → ${target}…`;
}

function setSearchViewBatchJob(job: SearchViewBatchJob | null, renderNow = true): void {
  state.searchViewBatchJob = job;
  if (renderNow) render();
  else scheduleStatusBarProgressPaint();
}

async function onOrgSyncMailbox(mailbox: string): Promise<void> {
  const mb = mailbox.trim();
  if (!mb || !isTauriRuntime()) {
    toast("Synchronisation : disponible dans l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account?.id) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  state.organization.rowSyncMailbox = mb;
  render();
  try {
    const outcome = await withTimeout(
      invoke<SyncMailboxesOutcome>("sync_mailboxes", {
        accountId: account.id,
        mailboxes: [mb],
        focusMailbox: mb,
        limitPerMailbox: 80,
      }),
      SYNC_INVOKE_TIMEOUT_MS,
    );
    const n = (outcome.results ?? []).reduce((s, r) => s + (r.fetchedUids ?? 0), 0);
    toast(n > 0 ? `${n} message(s) importé(s) · ${mb}` : `Dossier à jour · ${mb}`);
    await refreshOrganizationReport();
    if (state.view === "list" && state.selectedMailbox === mb) {
      await reloadCurrentThreadList(false);
    }
    await loadMailboxUnread();
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organization.rowSyncMailbox = null;
    render();
  }
}

function findEmptyMailboxesProposal(): OrgProposal | undefined {
  return (
    state.organizationV2.report?.proposals.find((p) => p.id === "empty-mailboxes") ??
    state.organization.report?.proposals.find((p) => p.id === "empty-mailboxes")
  );
}

async function onOrgDeleteMailboxOne(mailbox: string, mailboxRefId: string): Promise<void> {
  const mb = mailbox.trim();
  const refId = mailboxRefId.trim();
  if (!mb || !refId) return;
  const ok = await openConfirmModal({
    title: "Supprimer ce dossier vide ?",
    body: `Le dossier « ${mb} » sera supprimé côté serveur IMAP s’il est vide. Action irréversible.`,
    danger: true,
    confirmLabel: "Supprimer le dossier",
  });
  if (!ok) return;
  const acc = currentAccount();
  if (!acc?.id) return;
  const proposal = findEmptyMailboxesProposal();
  if (!proposal) {
    toast("Proposition introuvable — relancez l’analyse.");
    return;
  }
  const useV2 = Boolean(state.organizationV2.report?.proposals.some((p) => p.id === "empty-mailboxes"));
  if (useV2) {
    await runOrgV2Apply(acc.id, proposal, undefined, undefined, "delete-mailbox", [refId]);
    return;
  }
  await runOrgApply(acc.id, "empty-mailboxes", undefined, undefined, "delete-mailbox", [refId]);
}


function unsubscribeHrefScore(hrefRaw: string): number {
  const href = decodeHtmlEntitiesLoose(hrefRaw.trim());
  const low = href.toLowerCase();
  let score = 0;
  if (/^https?:\/\//i.test(href)) score += 30;
  if (/^mailto:/i.test(href)) score += 10;
  if (/unsubscribe|opt[-_]?out|optout|desinscri|desabonner/i.test(low)) score += 80;
  if (/\/un\/|\/unsub\b|\/opt-?out\b|\/manage-subscription/i.test(low)) score += 70;
  if (/list-unsubscribe|list-manage|subscription|preferences/i.test(href)) score += 25;
  if (/unsub\.aspx/i.test(href)) score += 35;
  // De-prioritize generic click-tracking / “view online” redirectors.
  if (/\/ats\/show\.aspx/i.test(low)) score -= 60;
  if (/(\/click|\/redirect|\/track|\/open)\b/i.test(low)) score -= 20;
  if (/utm_/i.test(low)) score -= 5;
  return score;
}

function sortUnsubscribeLinks(links: string[]): string[] {
  return [...links].sort((a, b) => unsubscribeHrefScore(b) - unsubscribeHrefScore(a));
}

function linkLooksLikeUnsubscribe(anchor: HTMLAnchorElement): boolean {
  const href = (anchor.getAttribute("href") || "").trim();
  const hrefLc = href.toLowerCase();
  const text = (anchor.textContent || "").trim().toLowerCase();
  const title = (anchor.getAttribute("title") || "").trim().toLowerCase();
  const blob = `${hrefLc} ${text} ${title}`;
  if (
    /\bunsubscribe\b|opt\s*-?\s*out|optout|d[ée]sinscri|d[ée]sabonner|d[ée]sinscription|list-unsubscribe|list-manage|subscription\s*center|one\s*-?\s*click|email\s*preferences|communication\s*preferences|advertising\s*preferences/i.test(
      blob
    )
  ) {
    return true;
  }
  if (/unsubscribe|opt[-_]out|optout|subscription|preferences\/email|email-preference|list-manage|\/u\/\d+\/unsub/i.test(hrefLc)) {
    return true;
  }
  if (/^mailto:/i.test(hrefLc) && /unsubscribe|d[ée]sinscri|opt[-_]out/i.test(blob)) return true;
  try {
    const base =
      typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://local.invalid";
    const u = new URL(href, base);
    const path = `${u.pathname}${u.search}`.toLowerCase();
    if (/unsubscribe|optout|opt_out|subscription|preferences|list-manage/i.test(path)) return true;
    if (/\/un\/|\/unsub\b|\/opt-?out\b|\/manage-subscription/i.test(path)) return true;
  } catch {
    /* ignore */
  }
  if (
    /^(ici|here|cliquez ici|click here)$/i.test(text) &&
    /\bd[ée]s(inscri|abonner)|unsubscribe|opt\s*-?\s*out/i.test(blob)
  ) {
    return true;
  }
  return false;
}

function unsubscribeLinkLabel(anchor: HTMLAnchorElement): string {
  const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length >= 3 && text.length <= 80) return text;
  const title = (anchor.getAttribute("title") || "").replace(/\s+/g, " ").trim();
  if (title.length >= 3 && title.length <= 80) return title;
  const href = (anchor.getAttribute("href") || "").trim();
  if (/^mailto:/i.test(href)) return "Se désinscrire (courriel)";
  return "Se désinscrire";
}

function collectUnsubscribeLinksFromDoc(doc: Document): MailUnsubscribeLink[] {
  const seen = new Set<string>();
  const out: MailUnsubscribeLink[] = [];
  doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    if (!linkLooksLikeUnsubscribe(a)) return;
    const href = normalizeMailHrefForOpen(a.getAttribute("href") || "");
    if (!href || seen.has(href)) return;
    seen.add(href);
    out.push({ href, label: unsubscribeLinkLabel(a) });
  });
  return out;
}

function blockIsMostlyUnsubscribe(el: Element): boolean {
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  const links = el.querySelectorAll<HTMLAnchorElement>("a.mail-unsubscribe-link");
  if (!links.length) return false;
  const linkText = [...links].map((a) => (a.textContent || "").trim()).join(" ");
  const rest = text.replace(linkText, "").replace(/\s+/g, " ").trim();
  return !rest || /^[|·•\-–—\s]+$/.test(rest);
}

function hideRelocatedUnsubscribeInDoc(doc: Document): void {
  doc.querySelectorAll<HTMLAnchorElement>("a.mail-unsubscribe-link").forEach((a) => {
    a.classList.add("mail-unsubscribe-link--relocated");
    const p = a.closest("p");
    if (p && blockIsMostlyUnsubscribe(p)) {
      p.classList.add("mail-unsubscribe-section--relocated");
    }
    const row = a.closest("tr");
    if (row && blockIsMostlyUnsubscribe(row)) {
      row.classList.add("mail-unsubscribe-section--relocated");
    }
    const cell = a.closest("td, th");
    if (cell && blockIsMostlyUnsubscribe(cell)) {
      cell.classList.add("mail-unsubscribe-section--relocated");
    }
  });
  doc.querySelectorAll("article.rm-amazon-digest, article.rm-deblock-digest").forEach((article) => {
    const h3 = article.querySelector(":scope > h3");
    if (!h3 || !/désabon|unsub/i.test(h3.textContent || "")) return;
    h3.classList.add("mail-unsubscribe-section--relocated");
    let sib = h3.nextElementSibling;
    while (sib && (sib.tagName === "TABLE" || sib.tagName === "P")) {
      sib.classList.add("mail-unsubscribe-section--relocated");
      if (sib.tagName === "TABLE") break;
      sib = sib.nextElementSibling;
    }
  });
}

function extractUnsubscribeLinksFromHtml(raw: string): MailUnsubscribeLink[] {
  if (!raw.trim()) return [];
  return sanitizeEmailHtml(raw, { allowRemoteImages: false, relocateUnsubscribe: false }).unsubscribeLinks;
}

function messageHtmlForDisplay(message: CleanedMessageView, mode: MessageViewMode): string | null {
  if (mode === "original") return message.htmlBody?.trim() || null;
  const clean = message.cleanedHtmlBody?.trim();
  if (clean) return clean;
  return message.htmlBody?.trim() || null;
}

function normalizeMailHrefForOpen(href: string): string | null {
  const t = href.trim();
  if (!t || /^javascript:/i.test(t)) return null;
  if (t.startsWith("#")) return null;
  if (t.startsWith("cid:")) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  if (/^mailto:/i.test(t) || /^tel:/i.test(t)) return t;
  return null;
}

function decodeHtmlEntitiesLoose(input: string): string {
  // `data-*` attrs are usually decoded by the DOM, but keep this as a safety net
  // for copied/serialized fragments where `&amp;` survives.
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function mailUrlLooksRemote(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim()) || raw.trim().startsWith("//");
}

function safeDataImageSrc(raw: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(raw.trim());
}

async function openExternalFromMailHref(href: string): Promise<void> {
  const raw = href.trim();
  if (!raw) return;
  try {
    if (isTauriRuntime()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(raw);
    } else {
      // `mailto:` should trigger the system mail composer (not a browser tab).
      if (/^mailto:/i.test(raw)) {
        window.location.assign(raw);
        return;
      }
      window.open(raw, "_blank", "noopener,noreferrer");
    }
  } catch (e) {
    console.error("openExternalFromMailHref", e);
    toast(`Impossible d'ouvrir le lien : ${tauriErrorMessage(e)}`);
  }
}

function sanitizeEmailHtml(
  input: string,
  opts?: { allowRemoteImages?: boolean; relocateUnsubscribe?: boolean; stripOutlookNoise?: boolean }
): { html: string; unsubscribeLinks: MailUnsubscribeLink[] } {
  const allowRemoteImages = opts?.allowRemoteImages === true;
  const relocateUnsubscribe = opts?.relocateUnsubscribe !== false;
  const stripOutlookNoise = opts?.stripOutlookNoise === true;
  try {
    const clean = DOMPurify.sanitize(String(input), {
      FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta", "base", "form", "input", "button", "textarea", "select"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cid):|data:image\/)/i
    });
    const doc = new DOMParser().parseFromString(String(clean), "text/html");
    flattenNestedParagraphInDocument(doc);
    doc.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
      const v = (el.getAttribute("style") || "").toLowerCase();
      if (
        /(position\s*:\s*(fixed|sticky))/.test(v) ||
        /(z-index\s*:)/.test(v) ||
        /(behavior\s*:)/.test(v) ||
        /url\s*\(/.test(v) ||
        /expression\s*\(/.test(v)
      ) {
        el.removeAttribute("style");
      }
    });
    doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const normalized = normalizeMailHrefForOpen(href);
      if (!normalized) {
        a.removeAttribute("href");
        a.removeAttribute("target");
        a.removeAttribute("rel");
        a.classList.add("mail-link-disabled");
        return;
      }
      a.setAttribute("href", normalized);
      a.rel = "noreferrer noopener";
      a.target = "_blank";
      if (linkLooksLikeUnsubscribe(a)) {
        a.classList.add("mail-unsubscribe-link");
        if (!a.getAttribute("aria-label")) {
          a.setAttribute("aria-label", "Lien de désinscription ou de gestion des envois");
        }
      }
    });
    doc.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      img.removeAttribute("width");
      img.removeAttribute("height");
      img.removeAttribute("srcset");
      const src = (img.getAttribute("src") || "").trim();
      if (src && mailUrlLooksRemote(src) && !allowRemoteImages) {
        img.setAttribute("data-remote-src", src);
        img.removeAttribute("src");
        img.classList.add("mail-remote-image-blocked");
        if (!img.getAttribute("alt")) img.setAttribute("alt", "Image distante bloquée");
      } else if (src && /^data:image\//i.test(src) && !safeDataImageSrc(src)) {
        img.removeAttribute("src");
        img.classList.add("mail-image-blocked");
        if (!img.getAttribute("alt")) img.setAttribute("alt", "Image data non autorisée");
      }
      const rawStyle = (img.getAttribute("style") || "").trim();
      if (!rawStyle) return;
      const pieces = rawStyle
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((rule) => {
          const prop = rule.split(":")[0]?.trim().toLowerCase() ?? "";
          return !/^(width|height|max-width|max-height|min-width|min-height)$/.test(prop);
        });
      if (!pieces.length) img.removeAttribute("style");
      else img.setAttribute("style", pieces.join("; "));
    });
    const unsubscribeLinks = collectUnsubscribeLinksFromDoc(doc);
    if (relocateUnsubscribe && unsubscribeLinks.length) hideRelocatedUnsubscribeInDoc(doc);
    const hasConversationReport = Boolean(doc.querySelector("article.rm-conversation-report"));
    if (stripOutlookNoise && !hasConversationReport) stripOutlookDisplayNoiseFromDoc(doc);
    return { html: doc.body?.innerHTML ?? String(clean), unsubscribeLinks };
  } catch {
    return { html: escapeHtml(input), unsubscribeLinks: [] };
  }
}

function stripOutlookDisplayNoiseFromDoc(doc: Document): void {
  const ids = ["Signature", "x_Signature", "signature", "divRplyFwdMsg", "x_divRplyFwdMsg"];
  for (const id of ids) {
    doc.getElementById(id)?.remove();
  }
  doc.querySelectorAll("[id*='LSI_marker']").forEach((el) => el.remove());
  doc.querySelectorAll('img[data-outlook-trace], img[id*="x0000_i"], img[id*="_x0000_"]').forEach((img) => {
    const wrap = img.parentElement;
    img.remove();
    if (wrap && wrap.tagName === "SPAN" && !(wrap.textContent ?? "").trim()) wrap.remove();
  });
  const reQuote = /(?:de\s*:|from\s*:|-----original message-----).*?(?:envoy[ée]\s*:|sent\s*:).*?(?:objet\s*:|subject\s*:)/is;
  const quoteBlocks = [...doc.querySelectorAll<HTMLElement>("div, p, blockquote")]
    .map((el) => ({ el, text: (el.textContent ?? "").replace(/\u00a0/g, " ") }))
    .filter(({ text }) => text.length > 0 && text.length <= 5000 && reQuote.test(text))
    .sort((a, b) => a.text.length - b.text.length);
  for (const { el } of quoteBlocks) {
    if (el.isConnected) el.remove();
  }
}

function pickImgSrcForLightbox(img: HTMLImageElement): string {
  // `getAttribute("src")` peut être vide si l’image vient de `srcset`.
  // `currentSrc` est la source réellement utilisée par le navigateur.
  const current = (img.currentSrc || "").trim();
  if (current) return current;
  const prop = (img.src || "").trim();
  if (prop) return prop;
  return (img.getAttribute("src") || "").trim();
}

function mailImageSrcLooksLikeCid(raw: string): boolean {
  return /^cid:/i.test(String(raw).trim());
}

function normalizeMailCidToken(cidUrl: string): string {
  const tail = cidUrl.trim().replace(/^cid:/i, "").trim();
  try {
    return decodeURIComponent(tail).replace(/^<|>$/g, "").trim().toLowerCase();
  } catch {
    return tail.replace(/^<|>$/g, "").trim().toLowerCase();
  }
}

async function resolveSrcForMailImageLightbox(rawSrc: string, messageId?: string | null): Promise<{ src: string; revokeObjectUrl?: string | null }> {
  let src = String(rawSrc).trim();
  if (!src) return { src };

  const mid = (messageId ?? "").trim();
  if (mid && mailImageSrcLooksLikeCid(src) && isTauriRuntime()) {
    try {
      const token = normalizeMailCidToken(src);
      if (token) {
        const fetched = await invoke<InlineAttachPayload | null>("inline_attachment_fetch", { messageId: mid, cid: token });
        if (fetched?.dataBase64 && fetched.mimeType) {
          const blob = base64ToImageBlob(fetched.dataBase64, fetched.mimeType);
          const objectUrl = URL.createObjectURL(blob);
          return { src: objectUrl, revokeObjectUrl: objectUrl };
        }
      }
    } catch {
      /* garder rawSrc pour afficher l’icône « image cassée » */
    }
  }
  return { src };
}

function readMailHtmlRawFromHost(host: HTMLDivElement): string {
  const b64 = host.dataset.emailHtmlB64?.trim();
  if (b64) {
    try {
      return base64ToUtf8String(b64);
    } catch {
      return host.dataset.emailHtml ?? "";
    }
  }
  return host.dataset.emailHtml ?? "";
}

function buildMailShadowInnerHtml(messageId: string, raw: string, isCleanView = false): string {
  const allowRemoteImages = Boolean(messageId && state.remoteImagesAllowedByMessage[messageId]);
  const { html: sanitized } = sanitizeEmailHtml(raw, {
    allowRemoteImages,
    relocateUnsubscribe: true,
    stripOutlookNoise: isCleanView
  });
  const blockedRemoteImages = !allowRemoteImages && sanitized.includes("data-remote-src=");
  const remoteImageBanner = blockedRemoteImages ?
    `<div class="remote-images">
        <span>Images distantes bloquées pour protéger votre confidentialité.</span>
        <button type="button" class="mail-load-remote-images">Charger les images</button>
      </div>`
  : "";
  return `
      <style>
        :host{display:block;box-sizing:border-box;color:var(--text);font-family:system-ui,-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif;padding:0 2px}
        .mail{padding:0;line-height:1.55;font-size:13px;background:transparent}
        .mail :is(p, ul, ol, blockquote, pre, table){margin:0 0 10px}
        .mail :is(h1,h2,h3){margin:8px 0 10px;font-family:ui-serif,Georgia,Cambria,"Times New Roman",serif;font-weight:400;letter-spacing:-0.02em}
        .mail a{color:var(--accent)}
        .remote-images{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;margin:0 0 10px;padding:10px 16px;box-sizing:border-box;max-width:100%;border:1px solid rgba(232,228,223,.14);border-radius:10px;background:rgba(255,255,255,.035);color:var(--dim,rgba(238,240,238,.72));font-size:12px;line-height:1.45}
        .remote-images span{flex:1 1 10rem;min-width:0}
        .remote-images button{flex:0 0 auto;margin-left:auto;border:1px solid rgba(232,228,223,.18);border-radius:999px;background:rgba(255,255,255,.06);color:var(--text);padding:6px 12px;cursor:pointer}
        .mail a.mail-link-disabled{color:var(--dim,rgba(238,240,238,.56));text-decoration:line-through;cursor:not-allowed}
        .mail a.mail-unsubscribe-link{
          display:inline-flex;
          align-items:center;
          gap:6px;
          margin:12px 0;
          padding:9px 16px;
          border-radius:10px;
          font-weight:650;
          font-size:13px;
          line-height:1.25;
          text-decoration:none !important;
          color:var(--text) !important;
          background:rgba(108,200,138,.16);
          border:1px solid rgba(108,200,138,.42);
          box-shadow:0 1px 0 rgba(0,0,0,.12);
        }
        .mail a.mail-unsubscribe-link:hover{
          background:rgba(108,200,138,.26);
          border-color:rgba(108,200,138,.58);
        }
        .mail .mail-unsubscribe-link--relocated,
        .mail .mail-unsubscribe-section--relocated{display:none !important}
        .mail img{
          box-sizing:border-box;
          max-width:100% !important;
          width:auto !important;
          height:auto !important;
          max-height:min(50vh,520px) !important;
          object-fit:contain;
          display:block;
          border-radius:12px;
          border:1px solid rgba(232,228,223,.10);
          cursor:zoom-in
        }
        .mail img.mail-remote-image-blocked,.mail img.mail-image-blocked{
          min-height:42px;
          padding:10px;
          cursor:default;
          background:rgba(255,255,255,.035);
        }
        .mail code{background:rgba(255,255,255,.065);padding:3px 7px;border-radius:6px;font-size:12px}
        .mail article.rm-deblock-digest table,.mail article.rm-amazon-digest table{width:100%;border-collapse:collapse;font-size:inherit}
        .mail article.rm-deblock-digest th,.mail article.rm-deblock-digest td,
        .mail article.rm-amazon-digest th,.mail article.rm-amazon-digest td{padding:7px 12px 7px 0;vertical-align:top;text-align:left;line-height:1.45}
        .mail article.rm-deblock-digest th,.mail article.rm-amazon-digest tbody th{font-weight:600;white-space:nowrap;width:1%;color:var(--dim,rgba(238,240,238,.58))}
        .mail article.rm-deblock-digest tbody tr:not(:first-child) th,.mail article.rm-deblock-digest tbody tr:not(:first-child) td,
        .mail article.rm-amazon-digest tbody tr:not(:first-child) th,.mail article.rm-amazon-digest tbody tr:not(:first-child) td{border-top:1px solid rgba(120,119,117,.16)}
        .mail article.rm-conversation-report{display:flex;flex-direction:column;gap:14px;margin:0}
        .mail article.rm-conversation-report .rm-conversation-turn{padding:12px 14px;border:1px solid rgba(120,119,117,.18);border-radius:10px;background:rgba(255,255,255,.025)}
        .mail article.rm-conversation-report .rm-conversation-turn--cited{border-left:2px solid rgba(232,228,223,.14)}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="1"]{margin-left:12px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="2"]{margin-left:24px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="3"]{margin-left:36px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="4"]{margin-left:48px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="5"]{margin-left:60px}
        .mail article.rm-conversation-report .rm-conversation-envelope{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 10px}
        .mail article.rm-conversation-report .rm-conversation-envelope th,.mail article.rm-conversation-report .rm-conversation-envelope td{padding:4px 12px 4px 0;vertical-align:top;text-align:left;line-height:1.4}
        .mail article.rm-conversation-report .rm-conversation-envelope th{font-weight:600;white-space:nowrap;width:1%;color:var(--dim,rgba(238,240,238,.58))}
        .mail article.rm-conversation-report .rm-conversation-envelope tr:not(:first-child) th,.mail article.rm-conversation-report .rm-conversation-envelope tr:not(:first-child) td{border-top:1px solid rgba(120,119,117,.12)}
        .mail article.rm-conversation-report .rm-conversation-participants{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .mail article.rm-conversation-report .rm-conversation-chip{display:inline-flex;align-items:center;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;line-height:1.3;background:rgba(173,188,216,.10);color:var(--text);border:1px solid rgba(173,188,216,.18);cursor:default}
        .mail article.rm-conversation-report .rm-conversation-body{margin:0;line-height:1.55}
        .mail article.rm-conversation-report .rm-conversation-body :is(p, div){margin:0 0 10px}
        .mail article.rm-conversation-report .rm-conversation-body br{display:block;content:"";margin-bottom:0.45em}
        .mail table{max-width:100%;width:100%;border-collapse:collapse}
        .mail blockquote{padding:8px 12px;border-left:2px solid rgba(232,228,223,.12);background:rgba(255,255,255,.02);border-radius:10px}
        .mail :is(.gmail_quote, .gmail_quote_container, blockquote.gmail_quote){display:none !important}
        .mail .rm-mail-signature{display:none !important}
        .mail :is(.rm-mail-forward-header, .rm-mail-outlook-quote-header){display:none !important}
        /* Vue clean : filet si le marqueur rm-mail-* manque (HTML déjà nettoyé sans wrapper). */
        .mail.mail--clean :is(#Signature, #x_Signature, #signature, #divRplyFwdMsg, #x_divRplyFwdMsg){display:none !important}
        .mail *{max-width:100%}
      </style>
      ${remoteImageBanner}
      <div class="mail${isCleanView ? " mail--clean" : ""}">${sanitized}</div>
    `;
}

function bindMailShadowClick(shadow: ShadowRoot, host: HTMLDivElement): void {
  const shadowState = shadow as unknown as { __mailClickBound?: boolean };
  if (shadowState.__mailClickBound) return;
  shadowState.__mailClickBound = true;
  shadow.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    const remoteBtn = t.closest(".mail-load-remote-images") as HTMLButtonElement | null;
    if (remoteBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const mid = (host.dataset.messageId ?? "").trim();
      if (mid) state.remoteImagesAllowedByMessage[mid] = true;
      remountMailHtmlShadow(host);
      return;
    }
    const a = t.closest("a[href]") as HTMLAnchorElement | null;
    if (a) {
      ev.preventDefault();
      ev.stopPropagation();
      const href = a.getAttribute("href")?.trim() ?? "";
      const normalized = normalizeMailHrefForOpen(href);
      if (normalized) void openExternalFromMailHref(normalized);
      return;
    }
    if (t.tagName !== "IMG") return;
    const img = t as HTMLImageElement;
    const messageId = (host.dataset.messageId ?? "").trim();
    const src = pickImgSrcForLightbox(img);
    if (!src) return;
    const alt = (img.getAttribute("alt") || "").trim();
    void resolveSrcForMailImageLightbox(src, messageId).then((resolved) => {
      state.imageModal = { src: resolved.src, alt, revokeObjectUrl: resolved.revokeObjectUrl ?? null };
      render();
    });
  });
}

function remountMailHtmlShadow(host: HTMLDivElement): void {
  const messageId = (host.dataset.messageId ?? "").trim();
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const isCleanView = host.classList.contains("message-html--clean");
  shadow.innerHTML = buildMailShadowInnerHtml(messageId, readMailHtmlRawFromHost(host), isCleanView);
  bindMailShadowClick(shadow, host);
}

function hydrateEmailHtml() {
  const nodes = document.querySelectorAll<HTMLDivElement>(
    ".message-html[data-email-html-b64], .message-html[data-email-html]"
  );
  nodes.forEach((host) => {
    if ((host as unknown as { __hydrated?: boolean }).__hydrated) return;
    (host as unknown as { __hydrated?: boolean }).__hydrated = true;
    remountMailHtmlShadow(host);
  });
}

function uniqueSendersOrdered(msgs: CleanedMessageView[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const m of msgs) {
    const s = m.sender.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    names.push(s);
  }
  return names;
}

function threadParticipantsWithEmails(messages: CleanedMessageView[]): ThreadParticipantLink[] {
  const map = new Map<string, string>();
  for (const m of sortMessagesByReceivedAscending(messages)) {
    const name = m.sender.trim();
    if (!name || map.has(name)) continue;
    const email = (m.senderEmail ?? "").trim().toLowerCase();
    map.set(name, email.includes("@") ? email : "");
  }
  return [...map.entries()].map(([name, email]) => ({ name, email }));
}

function sortMessagesByReceivedAscending(messages: CleanedMessageView[]): CleanedMessageView[] {
  return sortMessagesByReceivedAt(messages, "asc");
}

function sortMessagesByReceivedDescending(messages: CleanedMessageView[]): CleanedMessageView[] {
  return sortMessagesByReceivedAt(messages, "desc");
}

function groupCollapsedQuotesByAttribution(lines: string[]): string[] {
  const trimmed = lines.map((s) => s.replace(/\r$/, ""));
  if (!trimmed.length) return [];

  const isAttributionHeader = (raw: string) => {
    const t = raw.trim();
    return (
      /^On\s+.+\bwrote:?/i.test(t) ||
      /^Le\s.+a\s+[éeè]crit\s*:?/i.test(t) ||
      /^[\s_*-]*(forwarded message|original message|\|)\s*[:\-_]?\s*$/i.test(t) ||
      /^[\s_-]{3,}.{0,80}(forwarded|message original)/i.test(t)
    );
  };

  const groups: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    const joined = buf.join("\n").trimEnd();
    buf = [];
    if (joined.length) groups.push(joined);
  };

  for (const line of trimmed) {
    if (isAttributionHeader(line) && buf.length > 0) flush();
    buf.push(line);
  }
  flush();
  return groups;
}

function sortMessagesByReceivedAt(messages: CleanedMessageView[], direction: "asc" | "desc"): CleanedMessageView[] {
  const cmp = direction === "asc" ? 1 : -1;
  const indexed = messages.map((m, index) => ({ m, index, t: parseMaybeDate(m.receivedAt)?.getTime() ?? Number.NaN }));
  indexed.sort((a, b) => {
    const aOk = Number.isFinite(a.t);
    const bOk = Number.isFinite(b.t);
    if (aOk && bOk && a.t !== b.t) return cmp * (a.t - b.t);
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    const idCmp = a.m.messageId.localeCompare(b.m.messageId);
    if (idCmp !== 0) return direction === "asc" ? idCmp : -idCmp;
    return a.index - b.index;
  });
  return indexed.map((x) => x.m);
}

function normalizeThreadSenderLabel(sender: string): string {
  return sender.trim().toLowerCase().replace(/\s+/g, " ");
}

function messagePlainSampleForLangGuess(message: CleanedMessageView): string {
  const raw = (message.cleanedText || message.sourceText || "").trim();
  if (!raw) return "";
  return raw.slice(0, 4000);
}

function normalizeIso639Primary(langRaw: string): string {
  const t = langRaw.trim().toLowerCase();
  if (t.length < 2) return "fr";
  const two = t.slice(0, 2);
  return /^[a-z]{2}$/.test(two) ? two : "fr";
}

const LANG_GUESS_HINTS: Readonly<Record<string, readonly string[]>> = {
  fr: [
    " le ",
    " la ",
    " les ",
    " l'",
    " un ",
    " une ",
    " des ",
    " du ",
    " de ",
    " et ",
    " est ",
    " que ",
    " qui ",
    " pour ",
    " dans ",
    " pas ",
    " avec ",
    " sur ",
    " par ",
    " vous ",
    " nous ",
    " été ",
    " tout ",
    " comme ",
    " salut ",
    " comment ",
    " vas ",
    " peux ",
    " veux ",
    " faire ",
    " cette ",
    " merci ",
    " bonjour ",
    " mais ",
    " aussi ",
    " leur ",
    " aux ",
    " je ",
    " te ",
    " tu ",
    " moi ",
    " mon ",
    " ma ",
    " mes ",
    " son ",
    " sa ",
    " ses ",
    " ce ",
    " ces ",
    " ou ",
    " où ",
    " très ",
    " plus ",
    " bien ",
    " s'il ",
    " n'est ",
    " d'un ",
    " d'une ",
  ],
  en: [
    " the ",
    " and ",
    " that ",
    " this ",
    " with ",
    " from ",
    " have ",
    " were ",
    " been ",
    " are ",
    " was ",
    " for ",
    " not ",
    " you ",
    " they ",
    " your ",
    " what ",
    " when ",
    " will ",
    " would ",
    " there ",
    " could ",
    " about ",
    " hello ",
    " thanks ",
    " please ",
    " does ",
    " how ",
    " it's ",
    " don't ",
    " i'm ",
    " we ",
    " our ",
    " has ",
    " had ",
  ],
  it: [
    " il ",
    " la ",
    " lo ",
    " gli ",
    " le ",
    " un ",
    " una ",
    " uno ",
    " per ",
    " con ",
    " che ",
    " non ",
    " sono ",
    " questo ",
    " anche ",
    " dalla ",
    " nella ",
    " grazie ",
    " ciao ",
    " buongiorno ",
    " come ",
    " molto ",
    " tutto ",
    " stato ",
    " hai ",
    " ho ",
    " mi ",
    " ti ",
    " era ",
    " suo ",
    " sua ",
    " degli ",
    " delle ",
    " quando ",
    " dove ",
  ],
  de: [
    " der ",
    " die ",
    " das ",
    " und ",
    " nicht ",
    " mit ",
    " von ",
    " den ",
    " dem ",
    " ein ",
    " eine ",
    " ist ",
    " auf ",
    " für ",
    " wie ",
    " auch ",
    " als ",
    " an ",
    " des ",
    " zu ",
    " sie ",
    " wir ",
    " ich ",
    " noch ",
    " nur ",
    " oder ",
    " wenn ",
    " aber ",
    " guten ",
    " danke ",
    " hallo ",
    " haben ",
    " sein ",
  ],
  es: [
    " el ",
    " la ",
    " los ",
    " las ",
    " de ",
    " que ",
    " y ",
    " en ",
    " para ",
    " con ",
    " una ",
    " un ",
    " por ",
    " no ",
    " como ",
    " más ",
    " su ",
    " del ",
    " se ",
    " ha ",
    " está ",
    " yo ",
    " hola ",
    " gracias ",
    " muy ",
    " todo ",
    " este ",
    " esta ",
    " también ",
  ],
  pt: [
    " o ",
    " a ",
    " os ",
    " as ",
    " de ",
    " e ",
    " do ",
    " da ",
    " dos ",
    " das ",
    " em ",
    " com ",
    " não ",
    " um ",
    " uma ",
    " para ",
    " por ",
    " que ",
    " se ",
    " como ",
    " mais ",
    " seu ",
    " obrigado ",
    " olá ",
    " bom ",
    " está ",
    " tem ",
  ],
};

function guessIso6391FromMessageText(raw: string): string | null {
  const sample = raw.slice(0, 4000).toLowerCase().normalize("NFC");
  if (sample.trim().length < 24) return null;

  if (/\p{Script=Han}/u.test(sample)) return "zh";
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(sample)) return "ja";
  if (/\p{Script=Hangul}/u.test(sample)) return "ko";
  if (/\p{Script=Cyrillic}/u.test(sample)) return "ru";
  if (/\p{Script=Arabic}/u.test(sample)) return "ar";
  if (/\p{Script=Greek}/u.test(sample)) return "el";

  const normalized = sample.replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  const blob = ` ${normalized} `;
  let best: string | null = null;
  let bestScore = 0;
  let second = 0;
  for (const [lang, hints] of Object.entries(LANG_GUESS_HINTS)) {
    let s = 0;
    for (const h of hints) {
      if (blob.includes(h)) s += 1;
    }
    if (s > bestScore) {
      second = bestScore;
      bestScore = s;
      best = lang;
    } else if (s > second) {
      second = s;
    }
  }
  if (bestScore < 4) return null;
  if (bestScore - second < 2 && second >= 4) return null;
  return best;
}

function normalizeDetectedLangIso639(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (!t || t === "und" || t === "unknown" || t === "xxx") return null;
  const two = t.slice(0, 2);
  return /^[a-z]{2}$/.test(two) ? two : null;
}

function langFromKindTags(tags: Tag[]): string | null {
  for (const t of tags) {
    if (String(t.family).toLowerCase() !== "kind") continue;
    const v = String(t.value).trim().toLowerCase();
    if (!v.startsWith("lang-")) continue;
    const iso = normalizeIso639Primary(v.slice(5));
    if (iso) return iso;
  }
  return null;
}

function shouldOfferPerMessageTranslate(
  message: CleanedMessageView,
  motherLangRaw: string,
  threadTags?: Tag[]
): boolean {
  if (!isTauriRuntime()) return false;
  const mother = normalizeIso639Primary(motherLangRaw || "fr");

  const fromTags = langFromKindTags(message.tags) ?? (threadTags?.length ? langFromKindTags(threadTags) : null);
  if (fromTags && fromTags === mother) return false;

  const fromDb = normalizeDetectedLangIso639(message.detectedLang);
  if (fromDb) {
    return fromDb !== mother;
  }

  const plain = messagePlainSampleForLangGuess(message);
  if (plain.trim().length < 24) return false;

  const guess = guessIso6391FromMessageText(plain);
  if (guess === null) return false;
  return guess !== mother;
}

function shouldOfferThreadTranslate(
  thread: { messages: CleanedMessageView[]; tags?: Tag[] },
  motherLangRaw: string,
): boolean {
  if (!isTauriRuntime()) return false;
  const mother = motherLangRaw || "fr";
  return thread.messages.some((m) => shouldOfferPerMessageTranslate(m, mother, thread.tags));
}

function repairUtf8Mojibake(s: string): string {
  const t = s ?? "";
  if (!t.includes("Ã") && !t.includes("Â")) return t;
  try {
    const bytes = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) bytes[i] = t.charCodeAt(i) & 0xff;
    const dec = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!dec || dec === t) return t;
    const mojib = (x: string) => (x.match(/Ã.|Â[^\s]/g) ?? []).length;
    return mojib(dec) <= mojib(t) ? dec : t;
  } catch {
    return t;
  }
}

function threadParticipantDedupKey(msg: CleanedMessageView): string {
  const c = canonicalEmailForNlMatch(msg.senderEmail ?? "");
  if (c) return `e:${c}`;
  return `s:${normalizeThreadSenderLabel(msg.sender)}`;
}

function threadParticipantFirstMessageIds(messages: CleanedMessageView[]): Set<string> {
  const asc = sortMessagesByReceivedAscending(messages);
  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const m of asc) {
    const k = threadParticipantDedupKey(m);
    if (seen.has(k)) continue;
    seen.add(k);
    ids.add(m.messageId);
  }
  return ids;
}

function repairSummaryResultStrings(o: SummaryResult): SummaryResult {
  return {
    ...o,
    title: repairUtf8Mojibake(String(o.title ?? "")),
    bullets: (o.bullets ?? []).map((b) => repairUtf8Mojibake(String(b))),
  };
}

function summaryResultToZenText(o: SummaryResult): string {
  const r = repairSummaryResultStrings(o);
  return `${r.title}\n\n${r.bullets.map((bullet) => `- ${bullet}`).join("\n")}`;
}

async function withLlmQueue<T>(
  label: string,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T | null> {
  if (state.llmJobLabel) {
    toast(`IA occupée (${state.llmJobLabel}). Annulez ou attendez la fin.`);
    return null;
  }
  abortIdleAiCachePrefetchInFlight();
  const ac = new AbortController();
  llmQueueAbort = ac;
  state.llmJobLabel = label;
  render();
  try {
    return await fn(ac.signal);
  } finally {
    if (llmQueueAbort === ac) llmQueueAbort = null;
    state.llmJobLabel = null;
    render();
  }
}

function cancelLlmQueueJob(): void {
  cancelActiveLlmStreamJob();
  abortIdleAiCachePrefetchInFlight();
  llmQueueAbort?.abort();
}

function commitSearchQuery(opts?: { fromModal?: boolean }): void {
  const input = activeSearchInputElement();
  const raw = (input?.value ?? state.searchDraft).trim();
  const parsed = parseSearchBarDraft(raw, state.newsletterRules);
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parsed);
  state.searchDraft = raw;
  state.searchModifiersTouched = false;
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
    el.value = raw;
  });
  const closeModal = opts?.fromModal ?? state.searchModalOpen;
  if (!hasSearchBarCriteria()) {
    if (closeModal) state.searchModalOpen = false;
    void clearSearchAndReloadInbox();
    return;
  }
  const plainTextOnly =
    !parsedSearchBarHasModifiers(parsed) &&
    state.search.trim().split(/\s+/).filter((w) => w.length > 0).length >= 3 &&
    isAiFeatureEnabled(state.appPrefs.ai, "featureSearchNlEnabled") &&
    isTauriRuntime();

  if (plainTextOnly) {
    const accountId = state.selectedAccountId?.trim();
    const phrase = state.searchDraft.trim();
    if (!accountId || !phrase) {
      void applySearchBarQuery().then(() => {
        toastSearchBarResult();
        if (closeModal) state.searchModalOpen = false;
        if (state.view === "thread") clearThreadAiSummaryState();
        if (state.view !== "list") state.view = "list";
        render();
      });
      return;
    }
    void (async () => {
      const ran = await withLlmQueue("Recherche NL", async (signal) => {
        if (signal.aborted) return;
        let sq:
          | {
              text?: string | null;
              sender?: string | null;
              senders?: string[];
              tags?: Tag[];
              mode?: string | null;
              accountId?: string | null;
              mailbox?: string | null;
              language?: string | null;
            }
          | null = null;
        try {
          sq = await withTimeout(
            invoke<{
              text?: string | null;
              sender?: string | null;
              senders?: string[];
              tags?: Tag[];
              mode?: string | null;
              accountId?: string | null;
              mailbox?: string | null;
              language?: string | null;
            }>("llm_search_nl", { accountId, phrase }),
            LLM_INVOKE_TIMEOUT_MS
          );
        } catch (err) {
          console.error("llm_search_nl from search bar", err);
        }
        if (signal.aborted) return;
        if (sq) {
          applySearchQueryFromNl(sq);
          if (!state.search.trim() && !state.searchSenders.length && !state.searchTags.length && phrase) {
            const fb = extractNlSearchFallbackText(phrase);
            if (fb) {
              state.search = fb;
              state.searchDraft = fb;
              state.searchNlMode = "lexical";
            }
          }
        } else {
          const fb = extractNlSearchFallbackText(phrase);
          if (fb) {
            state.search = fb;
            state.searchDraft = fb;
            state.searchNlMode = "lexical";
          } else {
            state.search = phrase;
            state.searchDraft = phrase;
            state.searchNlMode = null;
          }
        }
        if (
          !state.search.trim() &&
          !state.searchSenders.length &&
          !state.searchTags.length &&
          !state.searchLanguageFilter?.trim()
        ) {
          toast(
            "Recherche NL : aucun critère exploitable. Reformulez avec des mots-clés (ex. facture, Amazon) ou un expéditeur."
          );
          return;
        }
        await searchThreads();
        const n = threadsVisibleInList().length;
        const bits = [
          n === 0 ? "aucun résultat" : `${n} fil${n === 1 ? "" : "s"}`,
          state.searchNlMode ? `mode ${state.searchNlMode}` : null,
          state.searchLanguageFilter ? `langue ${state.searchLanguageFilter.toUpperCase()}` : null,
        ].filter(Boolean);
        const scope =
          state.searchScope === "account"
            ? " (compte entier)"
            : effectiveSearchMailboxPath()
              ? " (dossier précis)"
              : "";
        toast(`Recherche NL : ${bits.join(" · ")}${scope}.`);
        recordSearchCommittedActivity();
      });
      if (!ran) return;
      if (closeModal) state.searchModalOpen = false;
      if (state.view === "thread") clearThreadAiSummaryState();
      if (state.view !== "list") state.view = "list";
      render();
    })();
  } else {
    void applySearchBarQuery().then(() => {
      toastSearchBarResult();
      recordSearchCommittedActivity();
      if (closeModal) state.searchModalOpen = false;
      if (state.view === "thread") clearThreadAiSummaryState();
      if (state.view !== "list") state.view = "list";
      render();
    });
  }
}

function applySearchQueryFromNl(sq: {
  text?: string | null;
  sender?: string | null;
  senders?: string[];
  tags?: Tag[];
  mode?: string | null;
  language?: string | null;
  mailbox?: string | null;
  accountId?: string | null;
}): void {
  const applied: SearchStructuralState = {
    search: "",
    searchSenders: [],
    searchTags: [],
    searchMailboxPath: null,
    searchAccountOverrideId: null,
    searchNewsletterRule: null,
    searchScope: "account",
    listFilter: "all",
    searchNlMode: null,
    searchLanguageFilter: null,
    searchRelativeDays: null,
    searchHasAttachment: null,
    searchMinSecurityScore: null,
    searchMailboxPrefix: null,
  };
  applyNlSearchQueryToState(
    applied,
    sq,
    (raw) => canonicalEmailForNlMatch(raw) ?? (raw.trim().toLowerCase() || null),
    (id) => state.accounts.some((a) => a.id === id)
  );
  state.search = applied.search;
  state.searchDraft = applied.search;
  state.searchSenders = applied.searchSenders;
  state.searchMailboxPath = applied.searchMailboxPath;
  state.searchAccountOverrideId = applied.searchAccountOverrideId;
  state.searchNewsletterRule = applied.searchNewsletterRule as typeof state.searchNewsletterRule;
  state.searchScope = applied.searchScope;
  state.listFilter = applied.listFilter;
  state.searchNlMode = applied.searchNlMode;
  state.searchLanguageFilter = applied.searchLanguageFilter;
  state.searchRelativeDays = applied.searchRelativeDays;
  state.searchHasAttachment = applied.searchHasAttachment;
  state.searchMinSecurityScore = applied.searchMinSecurityScore;
  state.searchMailboxPrefix = applied.searchMailboxPrefix;
  state.searchTags = [];
  for (const t of applied.searchTags) mergeSearchBarTag(t);
  const aid = sq.accountId?.trim();
  if (aid && state.accounts.some((a) => a.id === aid)) {
    state.selectedAccountId = aid;
  }
  state.searchModifiersTouched = true;
}

function scrollToThreadMessage(messageId: string): void {
  const thread = state.selectedThread;
  if (!thread) return;
  const msgs = sortMessagesByReceivedDescending(thread.messages);
  const idx = msgs.findIndex((m) => m.messageId === messageId.trim());
  if (idx < 0) {
    toast("Message introuvable dans ce fil.");
    return;
  }
  const anchorId = threadMessageAnchorId(messageId, idx);
  const el = document.getElementById(anchorId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("thread-msg--evidence-flash");
    window.setTimeout(() => el.classList.remove("thread-msg--evidence-flash"), 2400);
  } else {
    toast("Message introuvable dans la vue.");
  }
}

function normalizeRecipientEmailForDiff(email: string): string {
  return email.trim().toLowerCase();
}

function recipientMapForDiff(msg: CleanedMessageView): Map<string, { name?: string | null; email: string }> {
  const m = new Map<string, { name?: string | null; email: string }>();
  for (const r of msg.recipients ?? []) {
    const k = normalizeRecipientEmailForDiff(r.email ?? "");
    if (!k) continue;
    if (!m.has(k)) m.set(k, r);
  }
  return m;
}

function threadRecipientPresenceEventsByMessageId(
  messages: CleanedMessageView[],
): Map<string, ThreadRecipientPresenceEvents> {
  const asc = sortMessagesByReceivedAscending(messages);
  const firstIndex = new Map<string, number>();
  const lastIndex = new Map<string, number>();
  const firstInfo = new Map<string, { name?: string | null; email: string }>();
  const lastInfo = new Map<string, { name?: string | null; email: string }>();

  const acc = currentAccount();
  const ownEmailLower = acc?.email?.trim().toLowerCase() ?? "";
  const ownCanon = canonicalEmailForNlMatch(acc?.email ?? "") ?? "";
  const isOwnRecipientKey = (k: string): boolean => {
    if (!k) return false;
    if (ownEmailLower && k === ownEmailLower) return true;
    if (ownCanon) {
      const kCanon = canonicalEmailForNlMatch(k);
      if (kCanon) return kCanon === ownCanon;
    }
    return false;
  };

  // Certains messages n’ont pas d’enveloppe To/Cc remontée (recipients absent/vides).
  // On évite de générer de faux "+ To/Cc" en prenant le 1er message avec enveloppe connue comme baseline.
  let firstKnownIdx = -1;
  let lastKnownIdx = -1;
  let maxEnvelopeSize = 0;

  for (let i = 0; i < asc.length; i++) {
    const msg = asc[i]!;
    const env = recipientMapForDiff(msg);
    if (env.size > maxEnvelopeSize) maxEnvelopeSize = env.size;
    if (env.size === 0) continue;
    if (firstKnownIdx < 0) firstKnownIdx = i;
    lastKnownIdx = i;
    for (const [k, r] of env) {
      if (isOwnRecipientKey(k)) continue;
      if (!firstIndex.has(k)) {
        firstIndex.set(k, i);
        firstInfo.set(k, r);
      }
      lastIndex.set(k, i);
      lastInfo.set(k, r);
    }
  }

  // En 1-to-1, l’enveloppe To/Cc dépend du sens (entrant vs sortant) et produit des faux “ajouts”.
  // On n’affiche ces événements que si l’enveloppe est réellement "groupe" (≥2 destinataires).
  if (maxEnvelopeSize <= 1) return new Map();

  const out = new Map<string, ThreadRecipientPresenceEvents>();
  const get = (id: string): ThreadRecipientPresenceEvents => {
    const hit = out.get(id);
    if (hit) return hit;
    const created: ThreadRecipientPresenceEvents = { added: [], removed: [] };
    out.set(id, created);
    return created;
  };

  for (const [k, idx] of firstIndex) {
    // Baseline : 1ère enveloppe connue — on ne sait pas ce qui était avant, donc pas d’“ajout”.
    if (idx === firstKnownIdx) continue;
    const msg = asc[idx];
    if (!msg) continue;
    const info = firstInfo.get(k);
    if (!info) continue;
    get(msg.messageId).added.push(info);
  }

  for (const [k, idx] of lastIndex) {
    // Dernière enveloppe connue (ou fin du fil) : ne pas afficher un “retiré” sans preuve.
    if (idx === lastKnownIdx || idx >= asc.length - 1) continue;
    const msg = asc[idx];
    if (!msg) continue;
    const info = lastInfo.get(k);
    if (!info) continue;
    get(msg.messageId).removed.push(info);
  }

  return out;
}

function threadTreeLaneRight(thread: { messages: CleanedMessageView[] }, message: CleanedMessageView): { isRoot: boolean; laneRight: boolean } {
  const ascending = sortMessagesByReceivedAscending(thread.messages);
  const rootId = ascending[0]?.messageId ?? "";
  const isRoot = Boolean(rootId) && message.messageId === rootId;
  if (isRoot) return { isRoot: true, laneRight: false };
  if (isOwnSender(message.sender)) return { isRoot: false, laneRight: true };

  const lanes = new Map<string, boolean>();
  let nextRight = false; // 1er expéditeur rencontré (hors root, hors moi) => gauche
  for (const m of ascending.slice(1)) {
    if (m.messageId === rootId) continue;
    const key = normalizeThreadSenderLabel(m.sender);
    if (!key) continue;
    if (isOwnSender(m.sender)) {
      lanes.set(key, true);
      continue;
    }
    if (lanes.has(key)) continue;
    lanes.set(key, nextRight);
    nextRight = !nextRight;
  }
  const k = normalizeThreadSenderLabel(message.sender);
  return { isRoot: false, laneRight: lanes.get(k) ?? false };
}

function senderAccentVars(sender: string): string {
  const s = (sender || "").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const fg = `hsla(${hue} 56% 70% / 1)`;
  const bg = `hsla(${hue} 56% 70% / 0.18)`;
  return `--sender-accent:${fg};--sender-accent-bg:${bg};`;
}

function threadQuickReplyTargetName(msgs: CleanedMessageView[]): string {
  for (let i = 0; i < msgs.length; i++) {
    if (!isOwnSender(msgs[i].sender)) return msgs[i].sender;
  }
  return msgs[0]?.sender ?? "…";
}

function formatThreadReadingWhen(receivedAt: string): string {
  const d = parseMaybeDate(receivedAt);
  if (!d) return receivedAt;
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).replace(/\.$/, "");
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  // Heure d’abord pour une lecture chronologique évidente (puis jour).
  return `${time} · ${day}`;
}

function receivedAtIsoDatetime(receivedAt: string): string {
  const d = parseMaybeDate(receivedAt);
  return d ? d.toISOString() : "";
}

function zenSummaryHtmlFragments(text: string): string {
  const lines = repairUtf8Mojibake(text).replace(/\r\n/g, "\n").split("\n");
  const chunks: string[] = [];
  let inList = false;
  const closeList = (): void => {
    if (!inList) return;
    chunks.push("</ul>");
    inList = false;
  };
  for (const line of lines) {
    const t = line.trim();
    if (/^[-•]\s+/.test(t)) {
      if (!inList) {
        chunks.push('<ul class="thread-zen-list">');
        inList = true;
      }
      chunks.push(`<li>${escapeHtml(t.replace(/^[-•]\s+/, ""))}</li>`);
    } else if (t) {
      closeList();
      chunks.push(`<p class="thread-zen-par">${escapeHtml(t)}</p>`);
    }
  }
  closeList();
  return chunks.join("") || `<p class="thread-zen-par">${escapeHtml(text)}</p>`;
}

function normalizeForCleanCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hasStructuredHtmlCleaningProvider(message: CleanedMessageView): boolean {
  const p = message.htmlCleaningProvider;
  if (p && p !== "generic") return true;
  const ch = message.cleanedHtmlBody ?? "";
  return (
    ch.includes("rustymail:amazon-digest") ||
    ch.includes("rustymail:deblock-digest") ||
    ch.includes("rustymail:github-digest")
  );
}

function messagePrefersCleanByDefault(message: CleanedMessageView): boolean {
  if (hasStructuredHtmlCleaningProvider(message)) return true;

  const ch = message.cleanedHtmlBody?.trim();
  const hb = message.htmlBody?.trim();
  if (hb && ch) {
    return normalizeForCleanCompare(ch) !== normalizeForCleanCompare(hb);
  }

  const st = message.sourceText.trim();
  const ct = (message.cleanedText ?? "").trim();
  if (!ct) return false;
  return normalizeForCleanCompare(ct) !== normalizeForCleanCompare(st);
}

function effectiveMessageViewMode(message: CleanedMessageView, userMode: MessageViewMode): MessageViewMode {
  if (!ENABLE_CLEAN_MESSAGE_VIEW) return "original";
  if (userMode === "original") return "original";
  return messagePrefersCleanByDefault(message) ? "clean" : "original";
}

function threadIsAutoMail(thread?: { isNewsletterThread?: boolean } | null, threadId?: string | null): boolean {
  if (thread?.isNewsletterThread) return true;
  const tid = threadId ?? state.selectedThreadId;
  if (!tid) return false;
  const row = state.threads.find((t) => String(t.id) === String(tid));
  return Boolean(row?.isNewsletterThread);
}

function threadSuppressAutoEnvelopeMeta(
  thread: { isNewsletterThread?: boolean },
  message: CleanedMessageView,
  nlListedHere: boolean
): boolean {
  return threadIsAutoMail(thread) || Boolean(message.isNewsletter) || nlListedHere;
}

function defaultMailSecuritySignals(): MailSecuritySignals {
  return {
    severity: "ok",
    summaryFr: "Rien d’inhabituel détecté selon les règles locales.",
    findings: []
  };
}

function normalizedMailSecurity(message: CleanedMessageView): MailSecuritySignals {
  const mid = message.messageId?.trim();
  const cached = mid ? securityLlmAugmentCache[mid] : undefined;
  if (cached) return cached;
  return message.mailSecurity ?? defaultMailSecuritySignals();
}

function mailSecurityFindingsForDisplay(
  message: CleanedMessageView,
  ms: MailSecuritySignals
): MailSecuritySignals["findings"] {
  const mid = message.messageId?.trim();
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureSecurityLlmEnabled")) {
    return ms.findings ?? [];
  }
  if (mid && securityLlmAugmentCache[mid]) {
    return ms.findings ?? [];
  }
  if (mid && securityLlmAugmentFailed[mid]) {
    return ms.findings ?? [];
  }
  if (mid && securityLlmAugmentBusy[mid]) {
    return [];
  }
  if (mid) {
    return [];
  }
  return ms.findings ?? [];
}

function isSecurityLlmAugmentPending(messageId: string): boolean {
  const mid = messageId.trim();
  if (!mid) return false;
  return Boolean(
    securityLlmAugmentBusy[mid] && !securityLlmAugmentCache[mid] && !securityLlmAugmentFailed[mid],
  );
}

function scheduleSecurityLlmAugment(message: CleanedMessageView): void {
  const mid = message.messageId?.trim();
  if (!mid || !isTauriRuntime()) return;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureSecurityLlmEnabled")) return;
  const base = message.mailSecurity ?? defaultMailSecuritySignals();
  if (base.severity === "ok") return;
  if (securityLlmAugmentCache[mid] || securityLlmAugmentBusy[mid]) return;
  delete securityLlmAugmentFailed[mid];
  securityLlmAugmentBusy[mid] = true;
  void (async () => {
    try {
      const augmented = await invoke<MailSecuritySignals>("llm_security_signals_augment", {
        payload: base,
      });
      securityLlmAugmentCache[mid] = augmented;
      if (state.view === "thread" && state.selectedThread?.messages?.some((m) => m.messageId === mid)) {
        render();
      }
    } catch {
      securityLlmAugmentFailed[mid] = true;
    } finally {
      delete securityLlmAugmentBusy[mid];
      if (state.view === "thread" && state.selectedThread?.messages?.some((m) => m.messageId === mid)) {
        render();
      }
    }
  })();
}

function mailSecurityTierClass(ms: MailSecuritySignals): string {
  return ms.severity === "ok"
    ? "mail-security-tier--ok"
    : ms.severity === "attention"
      ? "mail-security-tier--attention"
      : "mail-security-tier--suspicion";
}

function parseMaybeDate(value: string): Date | null {
  const raw = String(value).trim();
  if (!raw || raw === "—" || raw === "-" || raw === "–") return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

function formatThreadCompactClock(receivedAt: string): string {
  const d = parseMaybeDate(receivedAt);
  if (!d) return receivedAt.trim() || "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isOwnSender(sender: string) {
  const account = currentAccount();
  const s = sender.trim().toLowerCase();
  if (!s) return false;
  const byEmail = account?.email?.trim().toLowerCase();
  const byName = account?.displayName?.trim().toLowerCase();
  return Boolean((byEmail && s === byEmail) || (byName && s === byName) || s === "sarah chen");
}

function draftHasRecipientsExtra(draft?: Draft): boolean {
  if (!draft) return false;
  const hasEmails = (list: Draft["to"]) => list.some((x) => Boolean(x.email?.trim()));
  return hasEmails(draft.cc) || hasEmails(draft.bcc);
}

function composeKindTitle(kind?: Draft["kind"]): string {
  switch (kind) {
    case "Reply":
      return "Réponse";
    case "Forward":
      return "Transfert";
    default:
      return "Nouveau message";
  }
}

function formatDraftRevisionStamp(iso: string): string {
  const raw = iso.trim();
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return raw;
  return new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function settingsDraftProfile(): Account | undefined {
  if (state.settingsSelectedAccountId === "new") return undefined;
  return state.accounts.find((a) => a.id === state.settingsSelectedAccountId);
}

function mergedProfileForAccountsForm(): Account | undefined {
  const base = settingsDraftProfile();
  const scratch = state.accountFormOAuthPrefill ?? accountsFormIdentityScratch;
  if (!getDiscoveredServersFormSnap() || accountFieldTouched.serverFields) {
    return base;
  }

  const displayName = scratch?.displayName?.trim() ?? base?.displayName ?? "";
  const email = scratch?.email?.trim() ?? base?.email ?? "";
  const snapImap = getDiscoveredServersFormSnap()!.imap;
  const snapSmtp = getDiscoveredServersFormSnap()!.smtp;
  if (base) {
    return { ...base, imap: snapImap, smtp: snapSmtp };
  }
  return {
    id: "__draft__",
    displayName,
    email,
    imap: snapImap,
    smtp: snapSmtp,
    authKind: state.accountFormAuthKind,
  };
}

let addressBookRowsCache: AddressBookRow[] = [];

async function refreshAddressBookList(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id || !isTauriRuntime()) {
    addressBookRowsCache = [];
    return;
  }
  try {
    const res = await invoke<{ items: AddressBookRow[]; total: number }>("list_address_contacts_cmd", {
      accountId: acc.id,
      query: addressBookListQuery,
      offset: 0,
      limit: 80,
    });
    addressBookRowsCache = res?.items ?? [];
  } catch {
    addressBookRowsCache = [];
  }
}

function buildSemanticStatsBlockHtml(): string {
  const accForStats = currentAccount();
  const mbNorm = (state.selectedMailbox || "INBOX").toLowerCase();
  const cnt = state.semanticEmbeddingCounts;
  const countsOk = Boolean(
    cnt &&
      accForStats &&
      cnt.accountId === accForStats.id &&
      cnt.mailbox.trim().toLowerCase() === mbNorm
  );
  const mailboxSide = state.selectedMailbox || "INBOX";
  if (!isTauriRuntime()) {
    return `<p class="settings-explain settings-explain--lead" role="status">${escapeHtml(t("semantic.tauriOnly"))}</p>`;
  }
  if (!accForStats) {
    return `<p class="settings-explain settings-explain--lead" role="status">${escapeHtml(t("semantic.pickAccount"))}</p>`;
  }
  if (!countsOk || !cnt) {
    return `<p class="settings-explain settings-explain--lead" role="status">${escapeHtml(t("semantic.loading", { mailbox: mailboxSide }))}</p>`;
  }
  const c = cnt;
  return `<div class="settings-semantic-stats surface-sm" role="status" style="margin:0 0 14px;padding:12px 14px;border-radius:var(--radius-lg);font-size:13px;line-height:1.55">
            <strong>${escapeHtml(t("semantic.title", { model: c.modelId }))}</strong>
            <ul style="margin:8px 0 0;padding-left:1.15em">
              <li>${escapeHtml(t("semantic.mailboxLine", { mailbox: c.mailbox, embedded: c.embeddingsInMailbox, cached: c.messagesInMailboxCached }))}</li>
              <li>${escapeHtml(t("semantic.accountLine", { total: c.embeddingsTotalForAccount }))}</li>
            </ul>
            <p class="dim" style="margin:10px 0 0;font-size:12px;line-height:1.5">${escapeHtml(t("semantic.hint"))}</p>
          </div>`;
}

function buildSettingsAiPanelDeps(): SettingsAiPanelDeps {
  return {
    ai: state.appPrefs.ai,
    escapeHtml,
    escapeAttr,
    iconSvg,
    settingsExplainHtml,
    formatWhisperPttKeyLabel,
    isTauri: isTauriRuntime(),
    semanticStatsBlock: buildSemanticStatsBlockHtml(),
    semOk: state.semanticModelAvailable,
    keyHint:
      state.openrouterApiKeySet || state.dictationApiKeySet
        ? "Clé cloud enregistrée dans le trousseau."
        : "Aucune clé cloud.",
    dictationApiKeySet: state.dictationApiKeySet,
    openrouterApiKeySet: state.openrouterApiKeySet,
    llamaServerApiKeySet: state.llamaServerApiKeySet,
    llmRuntimeStatus: state.llmRuntimeStatus,
    llmPrefetchPercent: state.llmPrefetchPercent,
    llmPrefetchInFlight: state.llmPrefetchInFlight,
    llmCachedGgufFilenames: state.llmCachedGgufFilenames,
    bootstrapModelsCompleted: Boolean(state.appPrefs.general.bootstrapModelsCompleted),
    engineSettingsTab: state.aiEngineSettingsTab,
  };
}

function clearThreadAiSummaryState(): void {
  state.aiOutput = "";
  state.aiThreadScope = null;
  state.quickReplySuggestions = [];
  state.agentSession = null;
  state.threadQaAnswer = null;
  state.threadQaStreamText = "";
}

function threadAiSummaryLiveFor(threadId: string): boolean {
  const tid = String(threadId).trim();
  return (
    state.view === "thread" &&
    Boolean(tid) &&
    threadIdsMatch(state.selectedThreadId, tid) &&
    threadIdsMatch(state.aiThreadScope, tid)
  );
}

function applyThreadAiOutputIfLive(threadId: string, text: string): boolean {
  if (!threadAiSummaryLiveFor(threadId)) return false;
  state.aiOutput = text;
  return true;
}

let aiStreamPaintRaf = 0;

let aiStreamPaintFn: (() => void) | null = null;

function scheduleAiStreamDomPaint(paint: () => void): void {
  aiStreamPaintFn = paint;
  if (aiStreamPaintRaf) return;
  aiStreamPaintRaf = window.requestAnimationFrame(() => {
    aiStreamPaintRaf = 0;
    aiStreamPaintFn?.();
    aiStreamPaintFn = null;
  });
}

function paintThreadAiSummaryDom(text: string): void {
  scheduleAiStreamDomPaint(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const html = zenSummaryHtmlFragments(trimmed);
    document.querySelectorAll<HTMLElement>(".thread-reading .thread-zen .thread-zen-body").forEach((el) => {
      el.classList.add("is-ai-streaming");
      if (el.innerHTML !== html) el.innerHTML = html;
    });
    document.querySelectorAll<HTMLElement>(".ai-thread-summary__body").forEach((el) => {
      el.classList.add("is-ai-streaming");
      if (el.innerHTML !== html) el.innerHTML = html;
    });
  });
}

function paintThreadQaStreamDom(text: string): void {
  scheduleAiStreamDomPaint(() => {
    const el = document.querySelector<HTMLElement>(".ai-qa-answer--stream .ai-qa-answer__text");
    if (!el) return;
    const html = formatPlainTextWithLinks(text);
    if (el.innerHTML !== html) el.innerHTML = html;
  });
}

function paintAgentDraftDom(text: string): void {
  const ta = document.querySelector<HTMLTextAreaElement>("#agent-draft-text");
  if (!ta) {
    render();
    return;
  }
  scheduleAiStreamDomPaint(() => {
    if (ta.value !== text) ta.value = text;
  });
}

function threadAiSummaryScoped(): boolean {
  return Boolean(state.aiOutput?.trim() && state.aiThreadScope);
}

function threadAiSummaryForCurrentThread(): boolean {
  return threadAiSummaryScoped() && threadAiSummaryLiveFor(String(state.aiThreadScope));
}

function threadAiSummaryShownInZen(): boolean {
  return state.view === "thread" && Boolean(state.selectedThread) && threadAiSummaryForCurrentThread();
}

function openSettingsView() {
  beginNavigation("settings", { resetStack: true });
  state.view = "settings";
  state.aiOpen = false;
  clearThreadAiSummaryState();
  state.settingsTab = "accounts";
  clearDiscoveredServerSnap();
  state.settingsSelectedAccountId =
    state.selectedAccountId && state.accounts.some((a) => a.id === state.selectedAccountId)
      ? state.selectedAccountId
      : (state.accounts[0]?.id ?? "new");
  accountFieldTouched.serverFields = false;
  state.accountServersPanelOpen = state.settingsSelectedAccountId !== "new";
  render();
}

function agentOfferSlotsStep(session: NonNullable<typeof state.agentSession>): boolean {
  return session.plan?.offerSlotStep ?? session.offerSlotsStep;
}

function agentPrepareReplyStepCount(session: NonNullable<typeof state.agentSession>): number {
  const planned = session.plan?.steps.length;
  if (planned && planned > 0) {
    return planned + (session.plan?.needsClarification ? 1 : 0);
  }
  if (session.assistMode === "quick") return agentOfferSlotsStep(session) ? 2 : 1;
  return agentOfferSlotsStep(session) ? 5 : 4;
}

function agentStepProgressLabel(session: NonNullable<typeof state.agentSession>): string {
  const n = agentPrepareReplyStepCount(session);
  const order = ["analyzeIntent", "extractFacts", "clarification", "draftReply", "suggestSlots"];
  const idx = Math.max(0, order.indexOf(session.step));
  return `${idx + 1}/${n} · ${assistStepLabel(session.step)}`;
}

function agentAssistBasePayload(): ReturnType<typeof buildAssistPayload> | null {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!tid || !accountId) return null;
  const mode = s?.assistMode ?? "deep";
  const skills = s?.enabledSkills?.length ? s.enabledSkills : defaultEnabledSkillIds(mode);
  return buildAssistPayload(tid, accountId, mode, skills);
}

function agentSkillEnabled(skill: AssistSkillId): boolean {
  const s = state.agentSession;
  if (!s) return false;
  const skills = s.enabledSkills.length ? s.enabledSkills : defaultEnabledSkillIds(s.assistMode);
  return skills.includes(skill);
}

function pushAgentTelemetry(step: AssistRunStep): void {
  const s = state.agentSession;
  if (!s) return;
  const idx = s.telemetry.findIndex((t) => t.skill === step.skill && t.status === "running");
  if (idx >= 0) s.telemetry[idx] = step;
  else s.telemetry.push(step);
}

async function stopAgentTelemetry(): Promise<void> {
  const s = state.agentSession;
  if (s?.unlistenTelemetry) {
    s.unlistenTelemetry();
    s.unlistenTelemetry = undefined;
  }
}

async function agentPrepareReplyStart(): Promise<void> {
  const tid = state.selectedThreadId?.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!tid) {
    toast(t("toast.openThreadForAgent"));
    return;
  }
  if (!accountId) {
    toast(t("toast.selectAccountForAgent"));
    return;
  }
  if (threadIsAutoMail(state.selectedThread, tid)) {
    toast(t("toast.agentAutoMail"));
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureAgentPrepareReplyEnabled")) {
    toast(t("toast.enableAgentInSettings"));
    return;
  }
  await stopAgentTelemetry();
  state.aiOpen = true;
  const assistMode: AssistMode = "deep";
  state.agentSession = {
    threadId: tid,
    accountId,
    assistMode,
    enabledSkills: defaultEnabledSkillIds(assistMode),
    step: "analyzeIntent",
    draft: "",
    slots: [],
    recommendations: [],
    busy: true,
    offerSlotsStep: false,
    clarificationQuestions: [],
    consistencyIssues: [],
    safetyFlags: [],
    forceDraft: false,
    telemetry: [],
  };
  const unlisten = await bindAssistTelemetry(tid, pushAgentTelemetry);
  if (state.agentSession) state.agentSession.unlistenTelemetry = unlisten;
  render();
  await withLlmQueue("Assistant réponse (1/3)", async (signal) => {
    try {
      const base = buildAssistPayload(tid, accountId, assistMode);
      const res = await invoke<AssistResult>("llm_assist_thread_phase", {
        payload: {
          ...base,
          phase: "analyzeIntent",
          priorIntent: null,
          draftSoFar: "",
        },
      });
      if (signal.aborted || !state.agentSession) return;
      state.agentSession = {
        ...state.agentSession,
        intent: res.intent,
        plan: res.plan,
        offerSlotsStep: res.plan?.offerSlotStep ?? res.intent?.needsScheduling ?? false,
        busy: false,
      };
    } catch (e) {
      toast(tauriErrorMessage(e));
      await stopAgentTelemetry();
      state.agentSession = null;
    }
    render();
  });
}

function agentAssistPhasePayload(
  s: NonNullable<typeof state.agentSession>,
  extra: Record<string, unknown>,
): { payload: Record<string, unknown> } {
  const base = agentAssistBasePayload() ?? buildAssistPayload(s.threadId, s.accountId, s.assistMode);
  return {
    payload: {
      ...base,
      priorFacts: s.facts ?? null,
      forceDraft: s.forceDraft,
      ...extra,
    },
  };
}

async function agentRunExtractFacts(signal: AbortSignal): Promise<boolean> {
  const s = state.agentSession;
  if (!s) return false;
  const res = await invoke<AssistResult>(
    "llm_assist_thread_phase",
    agentAssistPhasePayload(s, {
      phase: "extractFacts",
      priorIntent: s.intent ?? null,
      draftSoFar: "",
    }),
  );
  if (signal.aborted || !state.agentSession) return false;
  s.facts = res.facts;
  s.clarificationQuestions = res.clarificationQuestions ?? [];
  s.confidence = res.confidence;
  s.plan = res.plan ?? s.plan;
  s.offerSlotsStep = res.plan?.offerSlotStep ?? s.offerSlotsStep;
  if (res.needsClarification && !s.forceDraft) {
    s.step = "clarification";
    return false;
  }
  await agentRunPostExtractSkills(signal);
  return true;
}

function mergeAgentRecommendations(
  s: NonNullable<typeof state.agentSession>,
  res: AssistResult,
): void {
  const recs = res.recommendations ?? [];
  for (const r of recs) {
    if (s.recommendations.some((x) => x.kind === r.kind && x.label === r.label)) continue;
    s.recommendations.push(r);
  }
  if (res.slots?.length) {
    for (const sl of res.slots) {
      if (!s.recommendations.some((x) => x.kind === "slot" && x.label === sl)) {
        s.recommendations.push({ kind: "slot", label: sl });
      }
    }
  }
}

async function agentInvokeSkillPhase(
  skill: AssistSkillId,
  signal: AbortSignal,
  draftSoFar?: string,
): Promise<void> {
  if (!agentSkillEnabled(skill)) return;
  const s = state.agentSession;
  if (!s) return;
  const res = await invoke<AssistResult>(
    "llm_assist_thread_phase",
    agentAssistPhasePayload(s, {
      phase: assistPhaseForSkill(skill),
      priorIntent: s.intent ?? null,
      draftSoFar: draftSoFar ?? s.draft,
    }),
  );
  if (signal.aborted || !state.agentSession) return;
  mergeAgentRecommendations(s, res);
  if (res.safetyFlags?.length) {
    s.safetyFlags = [...new Set([...s.safetyFlags, ...res.safetyFlags])];
  }
  if (res.draftResponse?.trim()) s.draft = res.draftResponse.trim();
  s.plan = res.plan ?? s.plan;
}

async function agentRunPostExtractSkills(signal: AbortSignal): Promise<void> {
  await agentInvokeSkillPhase("actionItems", signal, "");
  await agentInvokeSkillPhase("riskFlagger", signal, "");
}

async function agentRunDraftStream(signal: AbortSignal): Promise<boolean> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid) return false;
  s.step = "draftReply";
  const done = await runLlmStreamJob({
    command: "llm_stream_agent_prepare_draft",
    args: {
      threadId: tid,
      accountId: s.accountId,
      assistMode: s.assistMode,
      priorIntent: s.intent ?? null,
      priorFacts: s.facts ?? null,
      forceDraft: s.forceDraft,
    },
    signal,
    onChunk: (acc) => {
      if (signal.aborted || !state.agentSession) return;
      state.agentSession.draft = acc;
      paintAgentDraftDom(acc);
    },
  });
  if (signal.aborted || !state.agentSession) return false;
  if (done === "cancelled") {
    await stopAgentTelemetry();
    state.agentSession = null;
    toast("Assistant réponse annulé.");
    return false;
  }
  const draft =
    done.agentDraft?.draft?.trim() ?? done.displayText?.trim() ?? state.agentSession.draft.trim();
  state.agentSession.draft = draft;
  return true;
}

async function agentRunConsistency(signal: AbortSignal): Promise<void> {
  const s = state.agentSession;
  if (!s || !agentSkillEnabled("consistencyCheck") || !s.draft.trim()) return;
  const res = await invoke<AssistResult>(
    "llm_assist_thread_phase",
    agentAssistPhasePayload(s, {
      phase: "consistencyCheck",
      priorIntent: s.intent ?? null,
      draftSoFar: s.draft,
    }),
  );
  if (signal.aborted || !state.agentSession) return;
  s.consistencyIssues = res.consistencyIssues ?? [];
  if (res.safetyFlags?.length) {
    s.safetyFlags = [...new Set([...s.safetyFlags, ...res.safetyFlags])];
  }
  s.plan = res.plan ?? s.plan;
  await agentInvokeSkillPhase("toneAdapter", signal);
}

async function agentRefreshPlanFromDraft(): Promise<void> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid) return;
  try {
    const base = agentAssistBasePayload() ?? buildAssistPayload(tid, s.accountId, s.assistMode);
    const planRes = await invoke<AssistResult>("llm_assist_plan", {
      payload: {
        ...base,
        priorIntent: s.intent ?? null,
        priorFacts: s.facts ?? null,
        draft: s.draft,
      },
    });
    s.plan = planRes.plan;
    s.offerSlotsStep = planRes.plan?.offerSlotStep ?? false;
  } catch {
    /* garde le plan précédent */
  }
}

async function agentPrepareReplyContinue(): Promise<void> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid || s.busy || !threadIdsMatch(s.threadId, tid)) return;

  if (s.step === "clarification") {
    s.forceDraft = true;
    s.busy = true;
    render();
    await withLlmQueue("Assistant réponse · brouillon", async (signal) => {
      try {
        if (!(await agentRunDraftStream(signal))) return;
        await agentRunConsistency(signal);
        await agentRefreshPlanFromDraft();
      } catch (e) {
        if (!isLlmCancelledError(e)) toast(tauriErrorMessage(e));
      } finally {
        if (state.agentSession) state.agentSession.busy = false;
        render();
      }
    });
    return;
  }

  if (s.step === "analyzeIntent") {
    s.busy = true;
    render();
    await withLlmQueue("Assistant réponse · suite", async (signal) => {
      try {
        if (s.assistMode !== "quick") {
          const ok = await agentRunExtractFacts(signal);
          if (!ok) return;
        }
        if (!(await agentRunDraftStream(signal))) return;
        await agentRunConsistency(signal);
        await agentRefreshPlanFromDraft();
      } catch (e) {
        if (!isLlmCancelledError(e)) toast(tauriErrorMessage(e));
      } finally {
        if (state.agentSession) state.agentSession.busy = false;
        render();
      }
    });
    return;
  }

  if (s.step === "draftReply") {
    const draftTa = document.querySelector<HTMLTextAreaElement>("#agent-draft-text");
    if (draftTa) s.draft = draftTa.value;
    await agentRefreshPlanFromDraft();
    if (!agentOfferSlotsStep(s)) {
      render();
      return;
    }
    s.busy = true;
    s.step = "suggestSlots";
    render();
    await withLlmQueue("Assistant réponse · créneaux", async (signal) => {
      try {
        const res = await invoke<AssistResult>(
          "llm_assist_thread_phase",
          agentAssistPhasePayload(s, {
            phase: "suggestSlots",
            priorIntent: s.intent ?? null,
            draftSoFar: s.draft,
          }),
        );
        if (signal.aborted || !state.agentSession) return;
        state.agentSession.slots = res.slots ?? res.recommendations?.map((r) => r.label) ?? [];
        state.agentSession.plan = res.plan ?? state.agentSession.plan;
        state.agentSession.busy = false;
      } catch (e) {
        toast(tauriErrorMessage(e));
        if (state.agentSession) state.agentSession.busy = false;
      }
      render();
    });
  }
}

function formatAgentSlotsParagraph(slotsText: string): string {
  const lines = slotsText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  if (lines.length === 1) return `Je vous propose le créneau suivant : ${lines[0]}.`;
  return `Je vous propose les créneaux suivants :\n${lines.map((l) => `· ${l}`).join("\n")}`;
}

function appendSchedulingSlotsToDraft(draft: string, slotsText: string): string {
  const d = draft.trimEnd();
  const block = formatAgentSlotsParagraph(slotsText);
  if (!block) return d;

  const signOffRe =
    /\n(\s*(?:Bien\s+)?cordialement\s*,?|Bien\s+à\s+vous\s*,?|Salutations\s+(?:distinguées\s+)?,?|Cordialement\s*,?|Regards\s*,?|Cdlt\.?\s*,?|Merci(?:\s+par\s+avance)?\s*,?)\s*$/i;
  const m = d.match(signOffRe);
  if (m?.index !== undefined) {
    const before = d.slice(0, m.index).trimEnd();
    const after = d.slice(m.index + 1).trimStart();
    return `${before}\n\n${block}\n\n${after}`;
  }

  const paras = d.split(/\n\n+/);
  if (paras.length >= 2) {
    const last = paras[paras.length - 1]!.trim();
    if (
      /^(?:bien\s+)?cordialement\s*,?$/i.test(last) ||
      /^salutations/i.test(last) ||
      /^merci\s*$/i.test(last)
    ) {
      return `${paras.slice(0, -1).join("\n\n")}\n\n${block}\n\n${last}`;
    }
  }

  return `${d}\n\n${block}`;
}

async function agentInsertDraftIntoCompose(extra?: string): Promise<void> {
  const s = state.agentSession;
  if (!s?.draft.trim() && !extra?.trim()) return;
  let body = s?.draft?.trim() ?? "";
  if (extra?.trim()) body = appendSchedulingSlotsToDraft(body, extra.trim());

  const threadId = (s?.threadId ?? state.selectedThreadId ?? "").trim();
  if (!threadId) {
    toast("Ouvrez le fil auquel vous répondez, puis réessayez.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Réponse dans le fil : application desktop (Tauri) requise.");
    return;
  }
  if (threadIsAutoMail(state.selectedThread, threadId)) {
    toast("Réponse indisponible pour ce fil automatique / newsletter.");
    return;
  }

  try {
    const replyDraft = await withTimeout(
      invoke<Draft>("prepare_reply", { threadId, messageId: null }),
      MAIL_ACTION_TIMEOUT_MS
    );
    replyDraft.markdownBody = body;
    state.draft = replyDraft;
    enterComposeView();
    startNewDraftSession();
    loadComposeMarkdownIntoEditor(body);
    state.composeCcBccOpen = draftHasRecipientsExtra(state.draft);
    state.composeAdvancedOpen = false;
    state.composeLayout = "split";
    syncPreviewOpenFromComposeLayout();
    resetMarkdownEditorHistory();
    render();
    window.setTimeout(() => void computePreview(), 0);
    scheduleDraftRevisionSave(350);
  } catch (error) {
    console.error("agentInsertDraftIntoCompose prepare_reply", error);
    toast(`Impossible d’ouvrir la réponse dans le fil : ${tauriErrorMessage(error)}`);
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

async function persistAiPrefsFromDom(opts?: {
  silent?: boolean;
  skipRender?: boolean;
  /** N’enregistre que `state.appPrefs` (ex. après changement de mode PC/cloud/hybride). */
  skipDomCapture?: boolean;
}): Promise<void> {
  if (!isTauriRuntime()) {
    if (!opts?.silent) toast("Enregistrement : lancez l’app Tauri.");
    return;
  }
  if (!opts?.skipDomCapture) {
    captureAiPrefsFieldsFromDom(state.appPrefs);
  }
  if (state.view === "thread" && state.selectedThread) {
    state.aiOpen = true;
  }
  try {
    await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
    try {
      state.appPrefs = await withTimeout(invoke<AppPrefs>("get_app_prefs", {}), MAIL_ACTION_TIMEOUT_MS);
      state.appPrefs.ai = normalizeAiPrefsMerged({
        ...defaultAppPrefs().ai,
        ...state.appPrefs.ai,
      });
    } catch {
      /* ignore reload failures */
    }
    if (!opts?.silent) toast("Réglages IA enregistrés.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  if (!opts?.skipRender) render();
}

function schedulePersistAiPrefsFromDom(opts?: { skipDomCapture?: boolean }): void {
  if (persistAiPrefsDebounce) clearTimeout(persistAiPrefsDebounce);
  const skipDomCapture = Boolean(opts?.skipDomCapture);
  persistAiPrefsDebounce = window.setTimeout(() => {
    persistAiPrefsDebounce = undefined;
    void persistAiPrefsFromDom({ silent: true, skipDomCapture });
  }, 480);
}

function flushPendingAiPrefsPersist(): void {
  if (persistAiPrefsDebounce) {
    clearTimeout(persistAiPrefsDebounce);
    persistAiPrefsDebounce = undefined;
  }
}

function finalizeSettingsAiModalClose(): void {
  captureAiPrefsFieldsFromDom(state.appPrefs);
  flushPendingAiPrefsPersist();
  void persistAiPrefsFromDom({ silent: true, skipDomCapture: true, skipRender: true });
}


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

async function downloadAllAttachmentsForMessage(messageId: string) {
  if (!messageId.trim()) return;
  if (!isTauriRuntime()) {
    toast("Téléchargement : lancez l’application bureau Tauri.");
    return;
  }
  const msg = state.selectedThread?.messages.find((m) => m.messageId === messageId);
  const atts = msg?.attachments ?? [];
  if (atts.length < 2) {
    toast("Ce message n’a pas plusieurs pièces jointes à regrouper.");
    return;
  }
  let ok = 0;
  const errors: string[] = [];
  for (const att of atts) {
    try {
      await withTimeout(
        invoke<string>("download_attachment", {
          req: { messageId, attachmentId: att.id },
        }),
        MAIL_ACTION_TIMEOUT_MS
      );
      ok++;
    } catch (e) {
      errors.push(`${att.fileName}: ${tauriErrorMessage(e)}`);
    }
  }
  if (errors.length === 0) {
    toast(
      `${ok} pièce${ok > 1 ? "s" : ""} jointe${ok > 1 ? "s" : ""} enregistrée${ok > 1 ? "s" : ""} dans Téléchargements`
    );
  } else {
    const hint = errors.slice(0, 2).join(" · ");
    toast(`${ok}/${atts.length} téléchargée(s). ${hint}${errors.length > 2 ? "…" : ""}`);
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

function removeAttachment(path: string) {
  if (!state.draft) return;
  const p = path.trim();
  if (!p) return;
  state.draft.attachmentPaths = (state.draft.attachmentPaths ?? []).filter((x) => x !== p);
  const attachmentsField = document.querySelector<HTMLInputElement>("#compose-attachments");
  if (attachmentsField) attachmentsField.value = attachmentPathsJoinedForHiddenField(state.draft.attachmentPaths);
  render();
  scheduleDraftRevisionSave(250);
}

function fileBaseName(path: string) {
  const normalized = String(path).replace(/\\/g, "/");
  const last = normalized.split("/").pop() ?? normalized;
  return last || normalized;
}

async function pickAttachments() {
  if (!state.draft) return;
  if (!isTauriRuntime()) {
    toast("Ajouter des pièces jointes : disponible seulement dans l’app Tauri.");
    return;
  }
  try {
    const picked = await withTimeout(invoke<string[]>("pick_attachment_paths", {}), MAIL_ACTION_TIMEOUT_MS);
    if (!picked.length) return;
    const merged = Array.from(new Set([...(state.draft.attachmentPaths ?? []), ...picked]));
    state.draft.attachmentPaths = merged;
    toast(`${picked.length} pièce(s) jointe(s) ajoutée(s).`);
    render();
    scheduleDraftRevisionSave(250);
  } catch (error) {
    toast(`Picker PJ échoué: ${tauriErrorMessage(error)}`);
  }
}

function clearAttachments() {
  if (!state.draft) return;
  state.draft.attachmentPaths = [];
  toast("Pièces jointes supprimées.");
  render();
  scheduleDraftRevisionSave(250);
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

function notifyImapWatchFocusedMailbox(mailbox?: string): void {
  notifyImapWatchFocusedMailboxCore({
    isTauri: isTauriRuntime(),
    accountId: currentAccount()?.id,
    mailbox: mailbox ?? state.selectedMailbox ?? "",
  });
}

async function refreshUiAfterImapPush(mailboxHint?: string) {
  if (!isTauriRuntime()) return;
  const pushed = (mailboxHint || "").trim();
  const current = (state.selectedMailbox || "INBOX").trim();
  const sameFolder =
    !pushed ||
    pushed.localeCompare(current, undefined, { sensitivity: "accent" }) === 0;
  try {
    // Sync secondaire (Sent/Trash/…) : met à jour les badges sans changer le dossier ouvert.
    if (!sameFolder) {
      await loadMailboxUnread();
      render();
      return;
    }
    if (isSearchActive()) {
      await searchThreads();
    } else if (usesSearchContextLoader()) {
      await loadThreadsForSearchContext(false);
    } else {
      await loadMailView();
    }
    await loadMailboxUnread();
    const keepThreadId = state.view === "thread" ? state.selectedThreadId : undefined;
    if (keepThreadId && state.threads.some((t) => t.id === keepThreadId)) {
      state.selectedThreadId = keepThreadId;
      if (state.view === "thread") {
        try {
          state.selectedThread = await withTimeout(
            invoke<DiscussionThreadView>("open_thread", { threadId: keepThreadId }),
            BOOT_INVOKE_TIMEOUT_MS,
          );
        } catch {
          state.selectedThread = undefined;
        }
      }
    }
    state.syncMessage = "Boîte mise à jour";
    render();
    void refreshSavedSearches(true);
    void refreshSuggestedSavedViews();
    window.setTimeout(() => {
      if (!state.syncInProgress && state.syncMessage === "Boîte mise à jour") {
        state.syncMessage = "";
        render();
      }
    }, 1800);
  } catch (error) {
    console.warn("refreshUiAfterImapPush", error);
  }
}

async function syncInbox(options?: { background?: boolean; allMailboxes?: boolean }) {
  if (state.syncInProgress) return;
  if (!isTauriRuntime()) {
    state.syncMessage = "Sync IMAP: disponible seulement dans l’app Tauri.";
    render();
    toast(state.syncMessage);
    return;
  }

  const syncAllFolders = syncAllAccountMailboxesRequested(options);

  if (syncAllFolders && state.settingsSelectedAccountId === "new") {
    toast("Enregistrez d’abord le compte avant de synchroniser tous les dossiers.");
    return;
  }

  const account = accountForImapSync();
  if (!account) {
    state.accountMessage = syncAllFolders
      ? "Aucun compte sélectionné — enregistrez ou choisissez un compte dans la liste."
      : "Aucun compte — enregistrez d’abord un compte IMAP.";
    state.syncMessage = state.accountMessage;
    render();
    toast(state.syncMessage);
    return;
  }

  if (!syncAllFolders && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Pas de synchronisation IMAP pour les brouillons locaux.");
    return;
  }

  const mailbox =
    syncAllFolders && isSavedDraftsVirtualMailbox(state.selectedMailbox) ?
      "INBOX"
    : state.selectedMailbox || "INBOX";
  const keepThreadId = state.view === "thread" ? state.selectedThreadId : undefined;
  state.syncInProgress = true;
  state.syncProgressBatch = null;
  state.syncMessage =
    syncAllFolders ?
      `Sync… tous les dossiers · ${account.email}`
    : account.imap.allowInvalidTls ?
      `Sync… (TLS non vérifié) · ${mailbox}`
    : `Sync… · ${mailbox}`;
  render();

  try {
    let targets: string[];
    if (syncAllFolders) {
      const listed = await withTimeout(
        invoke<string[]>("list_imap_mailboxes", { accountId: account.id }),
        BOOT_INVOKE_TIMEOUT_MS,
      );
      targets = Array.from(new Set(listed.map((m) => m.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
      if (!targets.length) targets = ["INBOX"];
      if (account.id === state.selectedAccountId) {
        state.mailboxes = listed;
      }
    } else if (options?.background) {
      // Sync auto (IDLE) : un seul dossier pour limiter la charge réseau / SQLite.
      targets = [mailbox];
    } else {
      const all = state.mailboxes.length ? state.mailboxes : [mailbox];
      const primary = pickSystemMailboxes(all).map((x) => x.name);
      targets = Array.from(new Set([...primary, mailbox].filter(Boolean)));
    }

    const batches = chunkStringList(targets, SYNC_MAILBOXES_BATCH_SIZE);
    let outcome: SyncMailboxesOutcome = {
      results: [],
      skippedNotOnServer: [],
      syncedMailboxAliases: [],
      syncErrors: [],
    };
    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi]!;
      state.syncProgressBatch = { current: bi + 1, total: batches.length };
      const batchLabel =
        batches.length > 1 ?
          `Sync… ${bi + 1}/${batches.length} · ${batch.length} dossier${batch.length === 1 ? "" : "s"} (${targets.length} au total)`
        : syncAllFolders ?
          `Sync… ${targets.length} dossier${targets.length === 1 ? "" : "s"}`
        : `Sync… ${escapeHtml(batch.join(", "))}`;
      state.syncMessage = batchLabel;
      scheduleStatusBarProgressPaint();
      render();
      const focus =
        batch.includes(mailbox) ? mailbox
        : batch.includes("INBOX") ? "INBOX"
        : batch[0];
      const part = await withTimeout(
        invoke<SyncMailboxesOutcome>("sync_mailboxes", {
          accountId: account.id,
          mailboxes: batch,
          focusMailbox: focus,
          limitPerMailbox: 80,
        }),
        syncInvokeTimeoutMs(batch.length),
      );
      outcome = mergeSyncMailboxesOutcomes(outcome, part);
    }
    const results = outcome.results ?? [];
    const skippedOnServer = outcome.skippedNotOnServer ?? [];
    const syncErrors = outcome.syncErrors ?? [];
    const aliases = outcome.syncedMailboxAliases ?? [];
    let selectionChangedByAlias = false;
    for (const a of aliases) {
      if (state.selectedMailbox === a.requested) {
        state.selectedMailbox = a.syncedAs;
        selectionChangedByAlias = true;
      }
    }
    if (syncAllFolders || skippedOnServer.length || selectionChangedByAlias || syncErrors.length) {
      try {
        const listed = await withTimeout(
          invoke<string[]>("list_imap_mailboxes", { accountId: account.id }),
          BOOT_INVOKE_TIMEOUT_MS
        );
        if (account.id === state.selectedAccountId) {
          state.mailboxes = listed;
        }
      } catch (error) {
        console.error("list_imap_mailboxes after sync", error);
        toast(`Impossible de rafraîchir la liste des dossiers : ${tauriErrorMessage(error)}`);
      }
      ensureValidSelectedMailbox();
      render();
    }
    if (isSearchActive()) {
      await searchThreads();
    } else if (usesSearchContextLoader()) {
      await loadThreadsForSearchContext(false);
    } else {
      await loadMailView();
    }
    await loadMailboxUnread();
    if (keepThreadId && state.threads.some((t) => t.id === keepThreadId)) {
      state.selectedThreadId = keepThreadId;
    } else {
      state.selectedThreadId = state.threads[0]?.id;
    }
    if (state.view === "thread" && state.selectedThreadId) {
      try {
        state.selectedThread = await withTimeout(
          invoke<DiscussionThreadView>("open_thread", { threadId: state.selectedThreadId }),
          BOOT_INVOKE_TIMEOUT_MS
        );
      } catch (error) {
        console.error("open_thread after sync", error);
        toast(`Impossible d’ouvrir le fil : ${tauriErrorMessage(error)}`);
        state.selectedThread = undefined;
      }
    }
    const totalFetched = results.reduce((sum, r) => sum + (r.fetchedUids ?? 0), 0);
    const totalPruned = results.reduce((sum, r) => sum + (r.uidsPruned ?? 0), 0);
    const touched = results.map((r) => r.mailbox).filter(Boolean);
    let syncLine = `${totalFetched} importés · ${touched.length} dossier${touched.length === 1 ? "" : "s"}`;
    if (totalPruned > 0) {
      syncLine += ` · ${totalPruned} retiré${totalPruned === 1 ? "" : "s"} (absents serveur)`;
    }
    if (syncAllFolders) {
      syncLine = `Compte synchronisé · ${syncLine}`;
    }
    if (skippedOnServer.length) {
      syncLine += ` · Ignorés (absents sur le serveur) : ${skippedOnServer.join(", ")}`;
    }
    if (syncErrors.length) {
      const shorten = (s: string, n = 140) => (s.length <= n ? s : `${s.slice(0, n)}…`);
      const detail = syncErrors.map((e) => `${e.mailbox}: ${shorten(e.error)}`).join(" · ");
      syncLine += ` · Échec sync (${syncErrors.length}) : ${detail}`;
    }
    state.syncMessage = syncLine;
    if (!options?.background) {
      const partial = skippedOnServer.length > 0 || syncErrors.length > 0;
      toast(
        partial
          ? syncAllFolders
            ? "Synchronisation du compte terminée (partielle — certains dossiers ignorés ou en erreur)"
            : "Synchronisation IMAP terminée (partielle — dossiers ignorés ou en erreur)"
          : syncAllFolders
            ? `Synchronisation du compte terminée (${touched.length} dossier${touched.length === 1 ? "" : "s"})`
            : "Synchronisation IMAP terminée"
      );
    } else if (skippedOnServer.length > 0 || syncErrors.length > 0) {
      toast("Synchronisation partielle — voir la ligne d’état sous le titre du dossier.");
    }
    if (
      state.appPrefs.ai.aiBackgroundAutoSemanticIndex &&
      state.semanticModelAvailable &&
      totalFetched > 0
    ) {
      const uniqueTouched = Array.from(new Set(touched.map((m) => String(m).trim()).filter(Boolean)));
      void invoke("reindex_semantic_missing_cmd", {
        payload: { accountId: account.id },
      }).catch(() => {});
      if (uniqueTouched.length > 1 && !options?.background) {
        toast(t("toast.semanticIndexing"));
      }
    }
    render();
    void refreshSavedSearches(true);
    void refreshSuggestedSavedViews();
  } catch (error) {
    console.error("sync_inbox failed", error);
    const message = error instanceof Error ? error.message : String(error);
    state.syncMessage = `Sync échouée: ${message}`;
    toast(state.syncMessage);
    render();
  } finally {
    state.syncInProgress = false;
    state.syncProgressBatch = null;
    if (options?.background) {
      window.setTimeout(() => {
        if (!state.syncInProgress) {
          state.syncMessage = "";
          render();
        }
      }, 1800);
    }
    render();
  }
}

async function prepareReply() {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  try {
    state.draft = await withTimeout(invoke<Draft>("prepare_reply", { threadId, messageId: null }), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("Tauri command failed: prepare_reply", error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  loadComposeMarkdownIntoEditor(state.draft.markdownBody);
  enterComposeView();
  startNewDraftSession();
  state.composeCcBccOpen = draftHasRecipientsExtra(state.draft);
  state.composeLayout = "split";
  syncPreviewOpenFromComposeLayout();
  resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void computePreview(), 0);
  scheduleDraftRevisionSave(350);
}

async function prepareReplyToMessage(messageId: string) {
  const mid = messageId.trim();
  if (!mid) return;
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const thread = state.selectedThread;
  const msg = thread?.messages.find((m) => m.messageId === mid);
  if (!msg) {
    await prepareReply();
    return;
  }
  try {
    state.draft = await withTimeout(invoke<Draft>("prepare_reply", { threadId, messageId: mid }), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("Tauri command failed: prepare_reply (quote)", error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  const header = `${formatThreadReadingWhen(msg.receivedAt)} — ${msg.sender}`;
  const body = (msg.cleanedText || msg.sourceText || "").trim();
  const next = appendQuotedMessageToDraft(state.draft?.markdownBody ?? "", header, body);
  loadComposeMarkdownIntoEditor(next);
  enterComposeView();
  startNewDraftSession();
  state.composeCcBccOpen = draftHasRecipientsExtra(state.draft);
  state.composeLayout = "split";
  syncPreviewOpenFromComposeLayout();
  resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void computePreview(), 0);
  scheduleDraftRevisionSave(350);
}

async function sendQuickReply(kind: "reply" | "reply-all") {
  const quickInput = document.querySelector<HTMLInputElement>("[data-quick-reply]");
  const body = quickInput?.value.trim() ?? "";
  if (!body) {
    toast("Le quick reply est vide.");
    return;
  }
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const command = kind === "reply" ? "prepare_reply" : "prepare_reply_all";
  let draft: Draft;
  try {
    draft = await withTimeout(
      invoke<Draft>(command, kind === "reply" ? { threadId, messageId: null } : { threadId }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch (error) {
    console.error(`Tauri command failed: ${command}`, error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  draft.markdownBody = `${body}\n`;
  try {
    const sendOutcome = await withTimeout(
      invoke<SendDraftOutcome>("send_draft", {
        accountId: currentAccount()?.id ?? null,
        draft,
        sendAck: "send-draft",
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    toast(kind === "reply" ? "Réponse envoyée." : "Réponse à tous envoyée.");
    toastSendDraftImapNotice(sendOutcome);
    if (quickInput) quickInput.value = "";
    await loadMailView(false);
    await loadMailboxUnread();
    if (state.selectedThreadId) {
      const tid = state.selectedThreadId;
      const refreshed = await fetchOpenThreadOrNotify(tid);
      if (refreshed) state.selectedThread = refreshed;
    }
    render();
  } catch (error) {
    console.error("send_draft (quick reply)", error);
    toast(`Envoi échoué: ${tauriErrorMessage(error)}`);
  }
}

async function prepareReplyAll() {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  try {
    state.draft = await withTimeout(invoke<Draft>("prepare_reply_all", { threadId }), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("Tauri command failed: prepare_reply_all", error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  loadComposeMarkdownIntoEditor(state.draft.markdownBody);
  enterComposeView();
  startNewDraftSession();
  state.composeCcBccOpen = draftHasRecipientsExtra(state.draft);
  state.composeLayout = "split";
  syncPreviewOpenFromComposeLayout();
  resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void computePreview(), 0);
  scheduleDraftRevisionSave(350);
}

async function prepareForward() {
  await prepareForwardWithOptionalMessage(null);
}

async function prepareForwardToMessage(messageId: string) {
  const mid = messageId.trim();
  if (!mid) {
    await prepareForward();
    return;
  }
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const thread = state.selectedThread;
  const msg = thread?.messages.find((m) => m.messageId === mid);
  if (!msg) {
    await prepareForward();
    return;
  }
  await prepareForwardWithOptionalMessage(mid);
}

async function prepareForwardWithOptionalMessage(messageId: string | null) {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const mid = messageId?.trim() || null;
  try {
    state.draft = await withTimeout(
      invoke<Draft>("prepare_forward", { threadId, messageId: mid }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch (error) {
    console.error("Tauri command failed: prepare_forward", error);
    toast(`Impossible de préparer le transfert: ${tauriErrorMessage(error)}`);
    return;
  }
  loadComposeMarkdownIntoEditor(state.draft.markdownBody);
  enterComposeView();
  startNewDraftSession();
  state.composeCcBccOpen = false;
  state.composeLayout = "split";
  syncPreviewOpenFromComposeLayout();
  resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void computePreview(), 0);
  scheduleDraftRevisionSave(350);
}

async function cycleComposeLayout() {
  persistDraft();
  const order: ComposeLayout[] = ["split", "write", "preview"];
  const fullOrder: ComposeLayout[] =
    isTauriRuntime() ? [...order, "historique"] : order;
  const idx = Math.max(0, fullOrder.indexOf(state.composeLayout));
  state.composeLayout = fullOrder[(idx + 1) % fullOrder.length];
  syncPreviewOpenFromComposeLayout();
  render();
  if (state.composeLayout === "historique") void refreshDraftRevisions(60);
  else if (state.composeLayout !== "write") await computePreview();
}

function applyComposerPreviewDom(htmlRaw: string) {
  const node = document.querySelector<HTMLElement>(".composer-body .preview");
  if (!node) return false;
  node.innerHTML = sanitizeEmailHtml(htmlRaw, { relocateUnsubscribe: false }).html;
  return true;
}

async function computePreview() {
  persistDraft();
  const md = state.composeCanonicalBody || state.draft?.markdownBody || state.composeBody;
  state.preview = await safeInvoke<DraftPreview>("preview_draft", { markdownBody: md }, {
    textPlain: md,
    html: `<p>${escapeHtml(md).replace(/\n/g, "<br />")}</p>`
  });
  // Ne pas faire un render() global pendant la frappe : il détruirait #compose-body et saute le curseur.
  // On met uniquement à jour le panneau d’aperçu si le composer est déjà monté avec l’aperçu ouvert.
  if (state.view === "compose" && composePreviewPaneActive() && applyComposerPreviewDom(state.preview?.html ?? "")) {
    return;
  }
  render();
}

function schedulePreviewUpdate(delayMs: number = 250) {
  if (!composePreviewPaneActive()) return;
  if (previewTimer) window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => void computePreview(), delayMs);
}

function toastSendDraftImapNotice(outcome: SendDraftOutcome | undefined) {
  const note = outcome?.imapNotice?.trim();
  if (!note) return;
  const shorten = (s: string, n = 220) => (s.length <= n ? s : `${s.slice(0, n)}…`);
  toast(`Information : ${shorten(note)}`);
}

function toastSplitImapNotices(notes: Array<string | null | undefined> | undefined) {
  if (!notes?.length) return;
  const shorten = (s: string, n = 220) => (s.length <= n ? s : `${s.slice(0, n)}…`);
  for (const note of notes) {
    const t = note?.trim();
    if (t) toast(`Information : ${shorten(t)}`);
  }
}

async function confirmAndExecuteSplitSend() {
  if (!state.draft) {
    state.splitSendConfirm = null;
    render();
    return;
  }
  persistDraft();
  const draftOutbound = draftPayloadForRust(state.draft);
  const n = state.splitSendConfirm?.chunks.length ?? 0;
  state.splitSendConfirm = null;
  const accountId = currentAccount()?.id ?? null;
  const splitTimeout = MAIL_ACTION_TIMEOUT_MS * Math.max(1, Math.min(n || 1, 12));
  try {
    state.composeMessage = n > 1 ? `Envoi en cours (${n} parties)…` : "Envoi en cours…";
    render();
    const keepThreadId = state.selectedThreadId;
    const result = await withTimeout(
      invoke<SplitSendResult>("execute_split_send_cmd", {
        accountId,
        draft: draftOutbound,
        sendAck: "send-draft",
      }),
      splitTimeout
    );
    if (result.failedChunkIndex != null) {
      const done = result.messageIds?.length ?? 0;
      const err = (result.errorMessage ?? "").trim();
      toast(
        `Envoi interrompu à la partie ${result.failedChunkIndex}/${n} (${done} partie(s) déjà envoyée(s)).${err ? ` ${err}` : ""}`
      );
      state.composeMessage = `Échec partie ${result.failedChunkIndex}/${n}`;
      toastSplitImapNotices(result.imapNotices);
      render();
      return;
    }
    state.composeMessage = n > 1 ? `Email envoyé en ${n} parties` : "Email envoyé";
    toast(state.composeMessage);
    toastSplitImapNotices(result.imapNotices);
    await loadMailView(false);
    await loadMailboxUnread();
    if (keepThreadId) {
      const refreshed = await fetchOpenThreadOrNotify(keepThreadId);
      if (refreshed) state.selectedThread = refreshed;
    }
    state.view = state.selectedThread ? "thread" : "list";
    state.draft = undefined;
    state.composeBody = "";
    state.composeCanonicalBody = "";
    state.composeLayout = "split";
    syncPreviewOpenFromComposeLayout();
    state.preview = undefined;
    window.setTimeout(() => {
      state.composeMessage = "";
      render();
    }, 2500);
    render();
  } catch (error) {
    console.error("execute_split_send_cmd", error);
    state.composeMessage = `Envoi échoué: ${tauriErrorMessage(error)}`;
    toast(state.composeMessage);
    render();
  }
}

async function sendDraft() {
  persistDraft();
  if (!state.draft) {
    toast("Aucun brouillon à envoyer.");
    console.warn("sendDraft: state.draft is undefined");
    return;
  }
  const toEmails = state.draft.to.map((x) => x.email?.trim()).filter(Boolean);
  if (toEmails.length === 0) {
    toast("Ajoutez au moins une adresse dans le champ À.");
    return;
  }
  if (!state.draft.subject?.trim()) {
    toast("Renseignez l’objet du message.");
    return;
  }
  const account = currentAccount();
  const accountId = account?.id ?? null;
  const draftOutbound = draftPayloadForRust(state.draft);
  const attachPaths = draftOutbound.attachmentPaths ?? [];

  if (isTauriRuntime() && attachPaths.length > 0) {
    try {
      state.composeMessage = "Analyse des pièces jointes…";
      render();
      const plan = await withTimeout(invoke<SplitPlan>("plan_split_send", { draft: draftOutbound }), MAIL_ACTION_TIMEOUT_MS);
      if (plan.chunks.length > 1) {
        state.splitSendConfirm = plan;
        state.composeMessage = "";
        render();
        return;
      }
    } catch (error) {
      console.error("plan_split_send", error);
      state.composeMessage = "";
      toast(tauriErrorMessage(error));
      render();
      return;
    }
  }

  try {
    state.composeMessage = "Envoi en cours…";
    render();
    const keepThreadId = state.selectedThreadId;
    const sendOutcome = await withTimeout(
      invoke<SendDraftOutcome>("send_draft", {
        accountId,
        draft: draftOutbound,
        sendAck: "send-draft",
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    state.composeMessage = "Email envoyé";
    toast(state.composeMessage);
    toastSendDraftImapNotice(sendOutcome);
    if (keepThreadId) {
      recordActivity({
        eventType: "message_sent",
        threadId: String(keepThreadId),
        senderEmail: toEmails[0] ?? null,
      });
    }
    await loadMailView(false);
    await loadMailboxUnread();
    if (keepThreadId) {
      const refreshed = await fetchOpenThreadOrNotify(keepThreadId);
      if (refreshed) state.selectedThread = refreshed;
    }
    state.view = state.selectedThread ? "thread" : "list";
    state.draft = undefined;
    state.composeBody = "";
    state.composeCanonicalBody = "";
    state.composeLayout = "split";
    syncPreviewOpenFromComposeLayout();
    state.preview = undefined;
    clearDraftSession();
    // Keep message visible a bit in case toast is blocked.
    window.setTimeout(() => {
      state.composeMessage = "";
      render();
    }, 2500);
    render();
  } catch (error) {
    console.error("send_draft", error);
    state.composeMessage = `Envoi échoué: ${tauriErrorMessage(error)}`;
    toast(state.composeMessage);
    render();
  }
}

async function summarizeThreadCore(
  threadId: string,
  signal: AbortSignal,
  opts?: { toastOnDone?: boolean; toastOnCache?: boolean; prefetchOnly?: boolean }
): Promise<{ status: "done" | "cancelled" | "error"; errorMessage?: string }> {
  const prefetchOnly = opts?.prefetchOnly === true;
  const toastOnDone = !prefetchOnly && opts?.toastOnDone !== false;
  const toastOnCache = !prefetchOnly && opts?.toastOnCache !== false;
  const fail = (message: string) => ({ status: "error" as const, errorMessage: message });
  if (!prefetchOnly) {
    state.aiOpen = true;
    state.quickReplySuggestions = [];
    state.aiOutput = "Aperçu synthétique du fil…";
    state.aiThreadScope = String(threadId);
    render();
  }
  const seg = await aiCacheKeySegment();
  const cacheKey = `summary:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:${threadId}`;
  const cached = await invokeAiCacheGet(cacheKey, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  if (cached && !signal.aborted) {
    try {
      const o = repairSummaryResultStrings(JSON.parse(cached) as SummaryResult);
      if (applyThreadAiOutputIfLive(threadId, summaryResultToZenText(o))) {
        if (toastOnCache) toast("Synthèse (cache locale).");
        if (!prefetchOnly) render();
        return { status: "done" };
      }
      return { status: "done" };
    } catch {
      /* invalide : recalcul */
    }
  }
  let done: Awaited<ReturnType<typeof runLlmStreamJob>>;
  try {
    done = await withTimeout(
      runLlmStreamJob({
        command: "llm_stream_summarize_thread",
        args: { threadId },
        signal,
        onChunk: (acc) => {
          if (applyThreadAiOutputIfLive(threadId, acc)) paintThreadAiSummaryDom(acc);
        },
      }),
      LLM_INVOKE_TIMEOUT_MS
    );
  } catch (error) {
    if (signal.aborted || isLlmCancelledError(error)) {
      if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
      if (toastOnDone) toast("Synthèse annulée.");
      if (!prefetchOnly) render();
      return { status: "cancelled" };
    }
    const msg = tauriErrorMessage(error);
    console.error("summarizeThreadCore", error);
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast(`Synthèse échouée : ${msg}`);
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (done === "cancelled") {
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast("Synthèse annulée.");
    if (!prefetchOnly) render();
    return { status: "cancelled" };
  }
  if (done.summary) {
    const summary = repairSummaryResultStrings(done.summary as SummaryResult);
    applyThreadAiOutputIfLive(
      threadId,
      done.displayText?.trim() || summaryResultToZenText(summary)
    );
  } else if (done.displayText?.trim()) {
    applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(done.displayText));
  } else {
    const msg = "réponse vide du modèle";
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast("Synthèse terminée sans contenu exploitable.");
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (toastOnDone) toast("Synthèse terminée.");
  if (!prefetchOnly) render();
  return { status: "done" };
}

async function translateThreadCore(
  threadId: string,
  signal: AbortSignal,
  opts?: { prefetchOnly?: boolean }
): Promise<{ status: "done" | "cancelled" | "error"; errorMessage?: string }> {
  const prefetchOnly = opts?.prefetchOnly === true;
  const fail = (message: string) => ({ status: "error" as const, errorMessage: message });
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  if (!prefetchOnly) {
    state.aiOpen = true;
    state.quickReplySuggestions = [];
    state.aiOutput = `Traduction → ${targetLang}…`;
    state.aiThreadScope = String(threadId);
    render();
  }
  const seg = await aiCacheKeySegment();
  const cacheKey = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:thread:${threadId}:${targetLang}`;
  const cached = await invokeAiCacheGet(cacheKey, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  if (cached && !signal.aborted) {
    try {
      const o = JSON.parse(cached) as LlmTranslationResult;
      if (o.translatedText) {
        if (applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(o.translatedText))) {
          if (!prefetchOnly) {
            toast("Traduction (cache locale).");
            render();
          }
        }
        return { status: "done" };
      }
    } catch {
      /* recalcul */
    }
  }
  let done: Awaited<ReturnType<typeof runLlmStreamJob>>;
  try {
    done = await withTimeout(
      runLlmStreamJob({
        command: "llm_stream_translate_thread",
        args: { threadId, targetLang },
        signal,
        onChunk: (acc) => {
          const preview = extractPartialJsonStringField(acc, "translatedText");
          if (!preview) return;
          if (applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(preview))) {
            paintThreadAiSummaryDom(repairUtf8Mojibake(preview));
          }
        },
      }),
      LLM_INVOKE_TIMEOUT_MS
    );
  } catch (error) {
    if (signal.aborted || isLlmCancelledError(error)) {
      if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
      if (!prefetchOnly) toast("Traduction annulée.");
      if (!prefetchOnly) render();
      return { status: "cancelled" };
    }
    const msg = tauriErrorMessage(error);
    if (!prefetchOnly) toast(`Traduction échouée : ${msg}`);
    console.warn("translateThreadCore", error);
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (done === "cancelled") {
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (!prefetchOnly) toast("Traduction annulée.");
    if (!prefetchOnly) render();
    return { status: "cancelled" };
  }
  const tx =
    done.translation?.translatedText?.trim() ||
    done.displayText?.trim() ||
    "";
  if (tx) applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(tx));
  if (!prefetchOnly) toast("Traduction terminée.");
  if (!prefetchOnly) render();
  return { status: "done" };
}

async function summarizeThread() {
  const threadId =
    state.view === "thread" && state.selectedThreadId?.trim() ?
      state.selectedThreadId.trim()
    : currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) {
    toast("Synthèse de fil désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Résumé du fil : lancez l’application RustyMail (Tauri), pas le navigateur seul.");
    state.aiOpen = true;
    state.aiOutput =
      "La synthèse utilise la base locale et les commandes Tauri ; elle n’est pas disponible en prévisualisation web seule.";
    render();
    return;
  }
  const ran = await withLlmQueue("Synthèse fil", (signal) => summarizeThreadCore(threadId, signal));
  if (ran === null) return;
}

async function summarizeSenderThreadsLight() {
  if (state.searchSenders.length === 0) {
    toast("Filtrez d’abord par expéditeur (@ ou recherche NL).");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) {
    toast("Synthèse de fil désactivée dans les préférences IA.");
    return;
  }
  if (!state.threads.length) {
    toast("Aucun fil dans la liste filtrée — lancez une recherche.");
    return;
  }
  const topK = state.threads.slice(0, 5);
  const priorView = state.view;
  const priorThreadId = state.selectedThreadId;
  const priorThread = state.selectedThread;
  senderBatchSummarizeAbort?.abort();
  senderBatchSummarizeAbort = new AbortController();
  const signal = senderBatchSummarizeAbort.signal;
  senderBatchSummarizeActive = true;
  state.aiOpen = true;
  let okCount = 0;
  try {
    const ran = await withLlmQueue(`Synthèse fils (${topK.length})`, async (queueSignal) => {
      for (let i = 0; i < topK.length; i++) {
        if (signal.aborted || queueSignal.aborted) return "cancelled" as const;
        const item = topK[i];
        const tid = String(item?.id ?? "");
        if (!tid) continue;
        const label = (item?.subject ?? "").trim() || `Fil ${i + 1}`;
        state.aiOutput = `Synthèse ${i + 1}/${topK.length} — ${label}…`;
        render();
        const exists = await fetchOpenThreadOrNotify(tid, { quiet: true });
        if (!exists) {
          toast(`Fil ignoré (non disponible en local) : ${label}`);
          continue;
        }
        if (signal.aborted || queueSignal.aborted) return "cancelled" as const;
        const outcome = await summarizeThreadCore(tid, queueSignal, {
          toastOnDone: false,
          toastOnCache: false,
        });
        if (outcome.status === "cancelled") return "cancelled" as const;
        if (outcome.status === "error") {
          const detail = outcome.errorMessage?.trim();
          toast(
            detail
              ? `Synthèse échouée : ${label} — ${detail}`
              : `Synthèse échouée : ${label}`
          );
          continue;
        }
        okCount += 1;
      }
      return "done" as const;
    });
    if (ran === "cancelled") toast("Synthèse batch annulée.");
    else if (ran) {
      if (okCount === 0) toast("Aucune synthèse n’a abouti — vérifiez le moteur IA et la sync des fils.");
      else
        toast(
          `${okCount}/${topK.length} synthèse${okCount === 1 ? "" : "s"} — résultat du dernier fil dans le panneau IA (liste inchangée).`
        );
    }
  } finally {
    senderBatchSummarizeAbort = null;
    senderBatchSummarizeActive = false;
    state.view = priorView;
    state.selectedThreadId = priorThreadId;
    state.selectedThread = priorThread;
    if (okCount > 0 && threadAiSummaryScoped()) {
      state.aiOpen = true;
    }
    render();
  }
}

async function llmTranslateThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast("Ouvre un fil à traduire.");
    return;
  }
  const thread = state.selectedThread;
  const mother = state.appPrefs.general.motherLanguage?.trim() || "fr";
  if (thread && !shouldOfferThreadTranslate(thread, mother)) {
    toast("Fil déjà dans la langue mère — traduction inutile.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadTranslateEnabled")) {
    toast("Traduction de fil désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Traduire LLM : lancez Tauri.");
    return;
  }
  const ran = await withLlmQueue("Traduction fil", async (signal) => {
    await translateThreadCore(threadId, signal, { prefetchOnly: false });
  });
  if (ran === null) return;
}

async function hydrateMessageTranslationsFromCacheForThread(messages: CleanedMessageView[]): Promise<void> {
  if (!isTauriRuntime()) return;
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const seg = await aiCacheKeySegment();
  const batchSize = 12;
  for (let i = 0; i < messages.length; i += batchSize) {
    const slice = messages.slice(i, i + batchSize);
    await Promise.all(
      slice.map(async (m) => {
        const mother = state.appPrefs.general.motherLanguage?.trim() || "fr";
        if (!shouldOfferPerMessageTranslate(m, mother)) return;
        const ck = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:msg:${m.messageId}:${targetLang}`;
        try {
          const raw = await invokeAiCacheGet(ck, {
            timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
            withTimeout,
          });
          if (!raw?.trim()) return;
          const o = JSON.parse(raw) as LlmTranslationResult;
          const tx = o.translatedText?.trim();
          if (!tx) return;
          state.messageTranslations[`${m.messageId}|${targetLang}`] = repairUtf8Mojibake(tx);
        } catch {
          /* cache absent ou JSON invalide */
        }
      })
    );
  }
  render();
}

async function llmTranslateMessageUi(messageId: string, forceRefresh = false) {
  const threadId = state.selectedThreadId?.trim();
  const mid = messageId.trim();
  if (!threadId || !mid) {
    toast("Ouvre un message dans un fil.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureMessageTranslateEnabled")) {
    toast("Traduction par message désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Traduire un message : lancez Tauri.");
    return;
  }
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const msg = state.selectedThread?.messages.find((m) => m.messageId === mid);
  if (!forceRefresh && msg && !shouldOfferPerMessageTranslate(msg, targetLang)) {
    toast("Message déjà dans la langue mère — traduction inutile.");
    return;
  }
  const seg = await aiCacheKeySegment();
  const ck = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:msg:${mid}:${targetLang}`;
  const mapKey = `${mid}|${targetLang}`;
  state.messageTranslationBusy[mid] = true;
  render();
  try {
    let cached: string | null = null;
    if (!forceRefresh) {
      cached = await invokeAiCacheGet(ck, {
        timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
        withTimeout,
      });
    }
    if (cached?.trim()) {
      try {
        const o = JSON.parse(cached) as LlmTranslationResult;
        const tx = o.translatedText?.trim();
        if (tx) {
          state.messageTranslations[mapKey] = repairUtf8Mojibake(tx);
          toast("Traduction du message (cache locale).");
          return;
        }
      } catch {
        /* requête LLM */
      }
    }
    const res = await withTimeout(
      invoke<LlmTranslationResult>("llm_translate_message", { threadId, messageId: mid, targetLang }),
      LLM_INVOKE_TIMEOUT_MS
    );
    const tx = res.translatedText?.trim();
    if (tx) state.messageTranslations[mapKey] = repairUtf8Mojibake(tx);
    toast("Message traduit.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    delete state.messageTranslationBusy[mid];
    render();
  }
}

async function llmQuickRepliesThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast("Ouvre un fil.");
    return;
  }
  if (threadIsAutoMail(state.selectedThread, threadId)) {
    toast("Réponses rapides désactivées pour les messages automatiques / newsletters.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyThreadEnabled")) {
    toast("Réponses rapides (fil) désactivées — activez-les dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) return void toast("Réponses rapides : Tauri requis.");
  const ran = await withLlmQueue("Réponses rapides", async (signal) => {
    if (signal.aborted) return;
    state.aiOpen = true;
    state.aiOutput = "";
    state.quickReplySuggestions = [];
    render();
    const res = await withTimeout(
      invoke<{ suggestions: Array<{ text: string; tone: string; rationale?: string }> }>("llm_quick_reply_thread", { threadId }),
      LLM_INVOKE_TIMEOUT_MS
    );
    if (signal.aborted) return;
    state.quickReplySuggestions = res.suggestions ?? [];
    state.aiThreadScope = String(threadId);
    toast("Réponses rapides prêtes.");
    render();
  });
  if (ran === null) return;
}

async function llmQuickRepliesComposeUi() {
  if (state.view !== "compose") {
    toast("Ouvre le compositeur pour les réponses rapides.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyComposeEnabled")) {
    toast("Réponses rapides (compositeur) désactivées — activez-les dans Paramètres IA.");
    return;
  }
  if (!isTauriRuntime()) return void toast("Réponses rapides : Tauri requis.");
  const ran = await withLlmQueue("Réponses rapides", async (signal) => {
    if (signal.aborted) return;
    toast("Génération des suggestions…");
    const res = await withTimeout(
      invoke<{ suggestions: Array<{ text: string; tone: string; rationale?: string }> }>("llm_quick_reply_compose", {}),
      LLM_INVOKE_TIMEOUT_MS
    );
    if (signal.aborted) return;
    const first = res.suggestions?.[0]?.text?.trim();
    if (!first) {
      toast("Aucune suggestion.");
      return;
    }
    const add = `${first}\n\n`;
    state.composeBody = `${add}${state.composeBody}`;
    state.composeCanonicalBody = state.composeBody;
    const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
    if (ta) ta.value = state.composeBody;
    void computePreview();
    toast("Suggestion insérée — modifiez avant envoi.");
    render();
  });
  if (ran === null) return;
}

async function llmQaThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast("Ouvre un fil.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadQaEnabled")) {
    toast("Q&A fil désactivé — activez-le dans Paramètres IA.");
    return;
  }
  if (!isTauriRuntime()) return void toast("Q&A fil : Tauri requis.");
  const qaInput = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
  const question = (qaInput?.value ?? state.threadQaDraft).trim();
  if (!question) {
    toast("Saisissez une question.");
    return;
  }
  state.threadQaDraft = question;
  const ran = await withLlmQueue("Q&A fil", async (signal) => {
    state.aiOpen = true;
    state.threadQaAnswer = null;
    state.threadQaStreamText = "Réponse en cours…";
    render();
    const done = await runLlmStreamJob({
      command: "llm_stream_qa_thread",
      args: { threadId, question },
      signal,
      onChunk: (acc) => {
        const preview = extractPartialJsonStringField(acc, "answer");
        state.threadQaStreamText = preview || "Réponse en cours…";
        if (preview) paintThreadQaStreamDom(preview);
      },
    });
    state.threadQaStreamText = "";
    if (done === "cancelled") {
      toast("Question annulée.");
      render();
      return;
    }
    if (done.qa?.answer?.trim()) {
      state.threadQaAnswer = {
        answer: repairUtf8Mojibake(done.qa.answer),
        evidenceMessageIds: done.qa.evidenceMessageIds ?? [],
      };
      state.aiThreadScope = String(threadId);
      toast("Réponse prête.");
    } else {
      toast("Réponse IA illisible — réessayez.");
    }
    render();
  });
  if (ran === null) return;
}

async function llmInboxDigestUi() {
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!isTauriRuntime()) return void toast("Brief d’action : Tauri requis.");
  if (!currentAccount()?.id?.trim()) return void toast("Sélectionne un compte.");
  if (!mailboxDigestPanelEligible()) {
    toast("Ouvre la liste d’un dossier IMAP pour le brief d’action.");
    return;
  }
  openMailboxDigestPanel(true);
}

async function composeAiRewrite(styleRaw: string) {
  if (state.view !== "compose") {
    toast("Ouvre le compositeur pour réécrire.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled")) {
    toast("Réécriture IA désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
  const src = ta?.value ?? state.composeBody;
  const style = styleRaw.trim() || "Neutral";
  if (!isTauriRuntime()) return void toast("Réécriture IA : Tauri requis.");
  const ran = await withLlmQueue(`Réécriture ${style}`, async (signal) => {
    if (signal.aborted) return;
    toast(`Réécriture « ${style} »…`);
    const res = await withTimeout(invoke<{ text: string }>("llm_rewrite_compose", { text: src, style }), LLM_INVOKE_TIMEOUT_MS);
    if (signal.aborted) return;
    state.composeCanonicalBody = res.text ?? src;
    state.composeBody = res.text ?? src;
    if (ta) ta.value = res.text ?? src;
    toast("Texte réécrit.");
    render();
    void computePreview();
  });
  if (ran === null) return;
}

async function composeAiGrammar() {
  if (state.view !== "compose") {
    toast("Ouvre le compositeur.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeGrammarEnabled")) {
    toast("Correction grammaticale désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
  const src = ta?.value ?? state.composeBody;
  if (!isTauriRuntime()) return void toast("Correction (LLM) : Tauri requis.");
  const ran = await withLlmQueue("Orthographe", async (signal) => {
    if (signal.aborted) return;
    try {
      const res = await withTimeout(
        invoke<{ suggestions: Array<{ reason: string; replacement: string; original: string }> }>("llm_grammar_compose", { text: src }),
        LLM_INVOKE_TIMEOUT_MS
      );
      if (signal.aborted) return;
      const n = res.suggestions?.length ?? 0;
      state.composeGrammarSuggestions = res.suggestions ?? [];
      toast(n ? `${n} suggestion(s) — voir le panneau Correction entre la barre d’outils et le texte.` : "Aucune suggestion.");
    } catch (e) {
      state.composeGrammarSuggestions = null;
      toast(tauriErrorMessage(e));
    }
    render();
  });
  if (ran === null) return;
}

async function searchNlAssist() {
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureSearchNlEnabled")) {
    toast("Recherche en langage naturel désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) return void toast("Recherche NL : Tauri requis.");
  const phrase =
    (
      await openTextPromptModal({
        title: "Recherche en langage naturel",
        body: "Décrivez ce que vous cherchez ; la requête sera traduite puis appliquée à la barre de recherche.",
        label: "Description",
        defaultValue: "",
      })
    )?.trim() ?? "";
  if (!phrase) return;
  const accountId = state.selectedAccountId?.trim();
  if (!accountId) {
    toast("Sélectionnez un compte avant la recherche en langage naturel.");
    return;
  }
  const ran = await withLlmQueue("Recherche NL", async (signal) => {
    if (signal.aborted) return;
    const sq = await withTimeout(
      invoke<{
        text?: string | null;
        sender?: string | null;
        senders?: string[];
        tags?: Tag[];
        mode?: string | null;
        accountId?: string | null;
        mailbox?: string | null;
        language?: string | null;
      }>("llm_search_nl", { accountId, phrase }),
      LLM_INVOKE_TIMEOUT_MS
    );
    if (signal.aborted) return;
    applySearchQueryFromNl(sq);
    if (!state.search.trim() && !state.searchSenders.length && !state.searchTags.length && phrase) {
      const fb = extractNlSearchFallbackText(phrase);
      if (fb) {
        state.search = fb;
        state.searchDraft = fb;
        state.searchNlMode = "lexical";
      }
    }
    if (
      !state.search.trim() &&
      !state.searchSenders.length &&
      !state.searchTags.length &&
      !state.searchLanguageFilter?.trim()
    ) {
      toast(
        "Recherche NL : aucun critère exploitable. Reformulez avec des mots-clés (ex. facture, Amazon) ou un expéditeur."
      );
      return;
    }
    await searchThreads();
    const n = threadsVisibleInList().length;
    const bits = [
      state.search ? `texte: ${state.search}` : "",
      state.searchSenders.length ? `de: ${state.searchSenders.join(", ")}` : "",
      state.searchTags.length ? `${state.searchTags.length} tag(s)` : "",
      state.searchNlMode ? `mode: ${state.searchNlMode}` : "",
      state.searchLanguageFilter ? `langue: ${state.searchLanguageFilter}` : "",
    ].filter(Boolean);
    if (n === 0) {
      toast(
        bits.length
          ? `Aucun résultat — ${bits.join(" · ")}. Essayez un mot plus court (ex. facture) ou #compte.`
          : "Aucun résultat pour cette recherche NL."
      );
    } else {
      toast(bits.length ? `Recherche appliquée — ${bits.join(" · ")}` : "Recherche appliquée.");
    }
  });
  if (ran === null) return;
}

async function micAction(opts?: MicActionOpts) {
  if (state.micState === "idle") {
    micDictationTarget = micTargetFromView(opts?.target);
    if (!isTauriRuntime()) {
      toast("Dictée : l’app bureau Tauri est requise.");
      return;
    }
    if (!state.appPrefs.ai.dictationEnabled) {
      toast("Activez la dictée dans Paramètres → IA & dictée.");
      return;
    }
    const backend = state.appPrefs.ai.dictationBackend;
    if (backend === "cloud" && !state.dictationApiKeySet) {
      toast("Clé API absente : Paramètres → IA & dictée.");
      return;
    }
    if (
      backend === "whisper_cpp" &&
      state.appPrefs.ai.whisperCloudFallback &&
      !state.dictationApiKeySet
    ) {
      toast("Repli cloud activé : enregistrez une clé API, ou désactivez le repli.");
      return;
    }
    if (backend === "local_http" && !state.appPrefs.ai.localCompanionBaseUrl.trim()) {
      toast("Indiquez l’URL du compagnon local (Paramètres → IA & dictée).");
      return;
    }
    try {
      micStream = await requestMicStream();
      if (opts?.fromPushToTalk && !micPttKeyHeld) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
        render();
        return;
      }
      micChunks = [];
      const mimeOpt =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      micMediaRecorder = new MediaRecorder(micStream, { mimeType: mimeOpt });
      micMediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) micChunks.push(ev.data);
      };
      if (opts?.fromPushToTalk && !micPttKeyHeld) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
        micMediaRecorder = null;
        render();
        return;
      }
      micMediaRecorder.start(250);
      state.micState = "recording";
      state.micSeconds = 0;
      const maxRec = state.appPrefs.ai.whisperMaxRecordSeconds;
      micTimer = window.setInterval(() => {
        state.micSeconds += 1;
        if (maxRec > 0 && state.micSeconds >= maxRec) {
          void micAction();
          return;
        }
        render();
      }, 1000);
      render();
    } catch (e) {
      toast(micPermissionErrorMessage(e));
      micStream?.getTracks().forEach((t) => t.stop());
      micStream = null;
      micMediaRecorder = null;
    }
    return;
  }
  if (state.micState === "recording") {
    if (micTimer) {
      window.clearInterval(micTimer);
      micTimer = undefined;
    }
    const backend = state.appPrefs.ai.dictationBackend;
    if (!micMediaRecorder) {
      state.micState = "idle";
      state.micSeconds = 0;
      render();
      return;
    }
    state.micState = "processing";
    if (backend === "whisper_cpp" && micDictationTarget === "compose") {
      state.composeMessage =
        "Whisper : téléchargement du modèle HF au premier usage si besoin — patientez.";
    }
    render();
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        const rec = micMediaRecorder!;
        rec.onerror = () => reject(new Error("Enregistrement interrompu"));
        rec.onstop = () => {
          micStream?.getTracks().forEach((t) => t.stop());
          micStream = null;
          resolve(new Blob(micChunks, { type: rec.mimeType || "audio/webm" }));
        };
        rec.stop();
      });
      micMediaRecorder = null;
      micChunks = [];
      const buf = new Uint8Array(await blob.arrayBuffer());
      const b64 = bytesToBase64(buf);
      const ext = blob.type.includes("wav") ? "wav" : "webm";
      let audioWavBase64: string | undefined;
      if (backend === "whisper_cpp") {
        const wavBytes = await mediaBlobToWav16kMonoPcm16(blob);
        audioWavBase64 = bytesToBase64(wavBytes);
        if (micDictationTarget === "compose") {
          state.composeMessage = "Transcription Whisper en cours…";
          render();
        }
      }
      let text = await withTimeout(
        invoke<string>("transcribe_dictation", {
          args: {
            audioBase64: b64,
            ...(audioWavBase64 ? { audioWavBase64 } : {}),
            fileName: `dictation.${ext}`,
            mimeType: blob.type || "audio/webm",
          },
        }),
        120_000
      );
      if (
        micDictationTarget === "compose" &&
        state.appPrefs.ai.dictationRewriteWithStyle &&
        text.trim()
      ) {
        state.composeMessage = "Réécriture du texte dicté…";
        render();
        text = await rewriteDictatedSegmentWithTone(text);
      }
      applyDictationToTarget(text, micDictationTarget);
      state.composeMessage = "";
    } catch (e) {
      console.error("transcribe_dictation", e);
      const errMsg = tauriErrorMessage(e);
      if (micDictationTarget === "compose") state.composeMessage = errMsg;
      toast(errMsg);
    }
    state.micState = "idle";
    state.micSeconds = 0;
    render();
  }
}

function persistDraft() {
  if (!state.draft) return;
  const shell = document.querySelector(".composer-mail-shell");
  const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (ta) setComposeFromTextareaValue(ta.value);
  state.draft.markdownBody = state.composeCanonicalBody;
  state.draft.subject =
    shell?.querySelector<HTMLInputElement>("#compose-subject")?.value ??
    document.querySelector<HTMLInputElement>("#compose-subject")?.value ??
    state.draft.subject;
  const sendHtmlEl =
    shell?.querySelector<HTMLInputElement>("#compose-send-html") ??
    document.querySelector<HTMLInputElement>("#compose-send-html");
  if (sendHtmlEl) state.draft.sendHtml = sendHtmlEl.checked;
  const toEl = shell?.querySelector<HTMLInputElement>("#compose-to") ?? document.querySelector<HTMLInputElement>("#compose-to");
  const ccEl = shell?.querySelector<HTMLInputElement>("#compose-cc") ?? document.querySelector<HTMLInputElement>("#compose-cc");
  const bccEl = shell?.querySelector<HTMLInputElement>("#compose-bcc") ?? document.querySelector<HTMLInputElement>("#compose-bcc");
  if (composeChipsTo) state.draft.to = composeChipsTo.getRecipients();
  else if (toEl) state.draft.to = parseEmailList(toEl.value);
  if (composeChipsCc) state.draft.cc = composeChipsCc.getRecipients();
  else if (ccEl) state.draft.cc = parseEmailList(ccEl.value);
  if (composeChipsBcc) state.draft.bcc = composeChipsBcc.getRecipients();
  else if (bccEl) state.draft.bcc = parseEmailList(bccEl.value);
  // Pièces jointes : pilots uniquement par state.draft (+ pick natif / glisser). Ne pas splitter par virgule
  // depuis le champ caché (les virgules sont valides dans les noms fichiers sous Windows → chemins coupés avant envoi).
}

function bindComposerDropzone() {
  composerDropAbort?.abort();
  composerDropAbort = undefined;
  composeDragDepth = 0;
  if (state.view !== "compose") return;
  // Bureau Tauri (surtout Windows) : le drop HTML5 ne reçoit pas les chemins disque ;
  // c’est `getCurrentWebview().onDragDropEvent` qui les fournit (`bindTauriFileDrop`).
  if (isTauriRuntime()) return;
  const shell = document.querySelector<HTMLElement>(".composer-mail-shell");
  const composeBody = document.querySelector<HTMLElement>(".composer-mail-shell .composer-body");
  if (!shell || !composeBody) return;

  composerDropAbort = new AbortController();
  const { signal } = composerDropAbort;

  const clearOverlay = () => {
    composeDragDepth = 0;
    shell.classList.remove("composer-mail-shell--drag-over");
    composeBody.classList.remove("drag-over");
  };

  const bumpOverlay = () => {
    shell.classList.add("composer-mail-shell--drag-over");
    composeBody.classList.add("drag-over");
  };

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    composeDragDepth += 1;
    bumpOverlay();
  };

  const onDragLeave = () => {
    composeDragDepth = Math.max(0, composeDragDepth - 1);
    if (composeDragDepth <= 0) clearOverlay();
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    const dt = event.dataTransfer;
    if (dt && Array.from(dt.types).includes("Files")) dt.dropEffect = "copy";
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    clearOverlay();
    if (!state.draft) return;
    const dropped = extractDroppedPaths(event.dataTransfer);
    if (!dropped.length) {
      toast(
        "Aucun chemin de fichier local lu. Glissez depuis l’explorateur ou le bureau (mode Tauri ou Electron), pas depuis une page web."
      );
      return;
    }
    const merged = Array.from(new Set([...(state.draft.attachmentPaths ?? []), ...dropped]));
    state.draft.attachmentPaths = merged;
    const attachmentsField = document.querySelector<HTMLInputElement>("#compose-attachments");
    if (attachmentsField) attachmentsField.value = attachmentPathsJoinedForHiddenField(merged);
    toast(`${dropped.length} pièce(s) jointe(s) ajoutée(s).`);
    render();
  };

  shell.addEventListener("dragenter", onDragEnter, { signal });
  shell.addEventListener("dragleave", onDragLeave, { signal });
  // Capture : certains enfants (aperçu, zone fichier) peuvent faire échouer le drop sinon.
  shell.addEventListener("dragover", onDragOver, { signal, capture: true });
  shell.addEventListener("drop", onDrop, { signal, capture: true });
}

function extractDroppedPaths(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) return [];
  const files = Array.from(dataTransfer.files ?? []);
  return files
    .map((file) => {
      const localPath = (file as File & { path?: string }).path;
      if (typeof localPath === "string" && localPath.trim()) return localPath.trim();
      return "";
    })
    .filter(Boolean);
}

async function applyMarkdownAction(action: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (!textarea) return;

  if (action === "undo") {
    applyMarkdownUndoRedo("undo");
    return;
  }
  if (action === "redo") {
    applyMarkdownUndoRedo("redo");
    return;
  }

  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = textarea.value.slice(start, end);

  if (action === "link") {
    markdownPushToolbarUndoSnapshot(textarea.value);
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = textarea.value.slice(start, end);
    void (async () => {
      const url = await openTextPromptModal({
        title: "Insérer un lien",
        label: "URL",
        defaultValue: "https://",
      });
      if (url == null) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const trimmed = url.trim();
      if (!trimmed) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
      if (!ta) return;
      const label = selected || "lien";
      const replacement = `[${label}](${trimmed})`;
      ta.setRangeText(replacement, start, end, "end");
      if (!selected) {
        const labelStart = start + 1;
        const labelEnd = labelStart + label.length;
        ta.setSelectionRange(labelStart, labelEnd);
      }
      ta.focus();
      finalizeMarkdownToolbarEdit(ta);
    })();
    return;
  }

  if (action === "image") {
    markdownPushToolbarUndoSnapshot(textarea.value);
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = textarea.value.slice(start, end);
    void (async () => {
      const url = await openTextPromptModal({
        title: "Insérer une image",
        label: "URL de l’image",
        defaultValue: "https://",
      });
      if (url == null) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const trimmed = url.trim();
      if (!trimmed) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
      if (!ta) return;
      const alt = selected || "image";
      const replacement = `![${alt}](${trimmed})`;
      ta.setRangeText(replacement, start, end, "end");
      if (!selected) {
        const altStart = start + 2;
        const altEnd = altStart + alt.length;
        ta.setSelectionRange(altStart, altEnd);
      }
      ta.focus();
      finalizeMarkdownToolbarEdit(ta);
    })();
    return;
  }

  if (action === "table") {
    markdownPushToolbarUndoSnapshot(textarea.value);
    const hdr = "| En-tête 1 ";
    const stub = `\n\n${hdr}| En-tête 2 |\n| --- | --- |\n|  |  |\n\n`;
    textarea.setRangeText(stub, start, end, "end");
    const sliceFrom = Math.min(start, textarea.value.length);
    const hdrPos = textarea.value.indexOf(hdr, sliceFrom);
    if (hdrPos >= 0) {
      const innerStart = hdrPos + 2;
      textarea.setSelectionRange(innerStart, innerStart + "En-tête 1".length);
    }
    textarea.focus();
    finalizeMarkdownToolbarEdit(textarea);
    return;
  }

  markdownPushToolbarUndoSnapshot(textarea.value);

  if (action === "bold") {
    wrapSelection(textarea, start, end, "**", "**", selected || "texte", { selectInnerWhenEmpty: true });
  } else if (action === "italic") {
    wrapSelection(textarea, start, end, "*", "*", selected || "texte", { selectInnerWhenEmpty: true });
  } else if (action === "underline") {
    wrapSelection(textarea, start, end, "<u>", "</u>", selected || "texte", { selectInnerWhenEmpty: true });
  } else if (action === "h1") {
    markdownToggleHeadingLines(textarea, 1);
  } else if (action === "h2") {
    markdownToggleHeadingLines(textarea, 2);
  } else if (action === "h3") {
    markdownToggleHeadingLines(textarea, 3);
  } else if (action === "ul") {
    markdownToggleBulletLines(textarea, "- ");
  } else if (action === "ol") {
    markdownToggleNumberedLines(textarea);
  } else if (action === "quote") {
    markdownToggleBlockquoteLines(textarea);
  } else if (action === "code") {
    markdownInsertCodeOrFence(textarea, start, end, selected);
  } else {
    markdownPopPendingToolbarSnapshot();
    return;
  }

  finalizeMarkdownToolbarEdit(textarea);
}

function wrapSelection(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  fallbackText: string,
  options?: { selectInnerWhenEmpty?: boolean }
) {
  const selected = textarea.value.slice(start, end);
  const inner = selected || fallbackText;
  const replacement = `${prefix}${inner}${suffix}`;
  textarea.setRangeText(replacement, start, end, "end");
  if (!selected && options?.selectInnerWhenEmpty) {
    const innerStart = start + prefix.length;
    const innerEnd = innerStart + inner.length;
    textarea.setSelectionRange(innerStart, innerEnd);
  }
  textarea.focus();
}

function parseEmailList(value: string): Array<{ email: string; name?: string | null }> {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?)\s*<([^>]+)>$/);
      if (m) {
        const email = m[2].trim();
        const name = m[1].trim().replace(/^["']|["']$/g, "");
        return { email, name: name || null };
      }
      return { email: part };
    });
}

function wireComposeRecipientChips(): void {
  if (composeChipsTo) composeRecipientPendingInput.to = composeChipsTo.getPendingInput();
  if (composeChipsCc) composeRecipientPendingInput.cc = composeChipsCc.getPendingInput();
  if (composeChipsBcc) composeRecipientPendingInput.bcc = composeChipsBcc.getPendingInput();
  composeChipsTo?.detach();
  composeChipsCc?.detach();
  composeChipsBcc?.detach();
  composeChipsTo = composeChipsCc = composeChipsBcc = null;
  if (state.view !== "compose" || !state.draft) {
    delete composeRecipientPendingInput.to;
    delete composeRecipientPendingInput.cc;
    delete composeRecipientPendingInput.bcc;
    return;
  }

  const mountField = (
    hostSel: string,
    field: ComposeRecipientField
  ): ComposeRecipientChipsHandle | null => {
    const host = document.querySelector<HTMLElement>(hostSel);
    if (!host) return null;
    const initial: RecipientChip[] = state.draft![field] ?? [];
    const pendingInput = composeRecipientPendingInput[field];
    return mountComposeRecipientChips({
      container: host,
      field,
      initial,
      pendingInput,
      isTauri: isTauriRuntime(),
      onChange: (recipients) => {
        if (!state.draft) return;
        state.draft[field] = recipients;
        scheduleDraftRevisionSave();
      },
      onPendingInputChange: (raw) => {
        if (raw.trim()) composeRecipientPendingInput[field] = raw;
        else delete composeRecipientPendingInput[field];
      },
    });
  };

  composeChipsTo = mountField("#compose-to-host", "to");
  composeChipsCc = mountField("#compose-cc-host", "cc");
  composeChipsBcc = mountField("#compose-bcc-host", "bcc");
}

function wireAtAutocompleteFields(): void {
  atAutocompleteDetach?.();
  hashAutocompleteDetach?.();
  atAutocompleteDetach = null;
  hashAutocompleteDetach = null;
  if (!isTauriRuntime()) return;
  const accountId = currentAccount()?.id;
  const addressAutocompleteOn = () =>
    isAiFeatureEnabled(state.appPrefs.ai, "featureAddressAutocompleteEnabled");
  const detachers: Array<() => void> = [];
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((searchIn) => {
    detachers.push(
      attachAtAutocomplete({
        input: searchIn,
        accountId,
        mode: "search",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        onSearchPick: () => {
          state.searchDraft = searchIn.value;
          syncSearchBarChrome();
        },
      })
    );
    detachers.push(
      attachHashAutocomplete({
        input: searchIn,
        getNewsletterRules: () => state.newsletterRules,
        getMailboxes: () => state.mailboxes,
        getAccounts: () =>
          state.accounts.map((a) => ({
            id: a.id,
            email: a.email,
            displayName: a.displayName,
          })),
        getTags: () =>
          state.searchTagCatalog.map((t) => ({
            family: String(t.family).toLowerCase(),
            value: t.value,
          })),
        onPrefetchTags: () => refreshSearchTagCatalog(),
        onApplyHit: (hit) => {
          applyHashAutocompleteHitToState(hit);
          syncSearchBarChrome();
        },
      })
    );
  });
  if (document.querySelector("#search-input, #search-modal-input")) {
    void refreshSearchTagCatalog();
  }
  const chipSpecs: Array<{
    host: string;
    chips: () => ComposeRecipientChipsHandle | null;
    field: "to" | "cc" | "bcc";
  }> = [
    { host: "#compose-to-host", chips: () => composeChipsTo, field: "to" },
    { host: "#compose-cc-host", chips: () => composeChipsCc, field: "cc" },
    { host: "#compose-bcc-host", chips: () => composeChipsBcc, field: "bcc" },
  ];
  for (const spec of chipSpecs) {
    const el = document
      .querySelector<HTMLElement>(spec.host)
      ?.querySelector<HTMLInputElement>(".compose-recipients-input");
    if (!el) continue;
    detachers.push(
      attachAtAutocomplete({
        input: el,
        accountId,
        mode: "compose",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        composeChipMode: true,
        onComposePick: (email, displayName) => {
          const handle = spec.chips();
          handle?.addRecipient(email, displayName);
          if (state.draft) state.draft[spec.field] = handle?.getRecipients() ?? state.draft[spec.field];
          scheduleDraftRevisionSave();
        },
      })
    );
  }
  const composeBody = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (composeBody) {
    detachers.push(
      attachAtAutocomplete({
        input: composeBody,
        accountId,
        mode: "mention",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        onMentionPick: () => {
          scheduleDraftRevisionSave();
        },
      })
    );
  }
  if (detachers.length) {
    atAutocompleteDetach = () => {
      for (const d of detachers) d();
    };
  }
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

function normalizeServerSettings(raw: unknown): Account["imap"] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sec = String(r.security ?? r.Security ?? "Tls");
  const security: SecurityMode = sec === "StartTls" ? "StartTls" : "Tls";
  return {
    host: String(r.host ?? "").trim(),
    port: Math.max(1, Math.floor(Number(r.port)) || 993),
    security,
    allowInvalidTls: Boolean(r.allowInvalidTls ?? r.allow_invalid_tls)
  };
}

function normalizeAuthKind(raw: unknown): MailAuthKind | undefined {
  const s = String(raw ?? "").trim();
  if (s === "oauthGoogle" || s === "oauth_google") return "oauthGoogle";
  if (s === "oauthMicrosoft" || s === "oauth_microsoft") return "oauthMicrosoft";
  if (s === "password") return "password";
  return undefined;
}

function normalizeAccountRow(raw: unknown): Account | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  const email = String(r.email ?? "").trim();
  if (!id && !email) return null;
  const displayName = String(r.displayName ?? r.display_name ?? email).trim();
  return {
    id: id || email.toLowerCase(),
    displayName: displayName || email,
    email: email || id,
    imap: normalizeServerSettings(r.imap),
    smtp: normalizeServerSettings(r.smtp),
    authKind: normalizeAuthKind(r.authKind ?? r.auth_kind)
  };
}

function composeMicButtonTitle(): string {
  if (state.micState === "recording") {
    const ptt = composePushToTalkTargetCode();
    return ptt
      ? "Enregistrement — relâcher la touche ou cliquer pour transcrire."
      : "Enregistrement — cliquer pour arrêter et transcrire.";
  }
  return composeMicFooterHint();
}

function threadQaMicButtonTitle(): string {
  if (state.micState === "recording") {
    const ptt = composePushToTalkTargetCode();
    return ptt
      ? "Enregistrement — relâcher la touche ou cliquer pour dicter la question."
      : "Enregistrement — cliquer pour arrêter et transcrire la question.";
  }
  return threadQaMicFooterHint();
}

function threadQaMicFooterHint(): string {
  if (state.micState === "processing") {
    const bb = state.appPrefs.ai.dictationBackend;
    if (bb === "whisper_cpp") return "Transcription Whisper de votre question…";
    return "Insertion de la question dictée…";
  }
  if (!isTauriRuntime()) return "Dictée : l’app bureau Tauri est requise.";
  if (!state.appPrefs.ai.dictationEnabled) return "Dictée désactivée — Paramètres → IA & dictée.";
  const b = state.appPrefs.ai.dictationBackend;
  const ptt = composePushToTalkTargetCode();
  const pttFrag = ptt ? ` ou maintenir ${composePushToTalkShortcutLabel()}` : "";
  if (b === "whisper_cpp")
    return ptt
      ? `Whisper : clic micro${pttFrag}, relâcher pour dicter la question.`
      : "Whisper : clic sur le micro pour dicter la question.";
  if (b === "cloud")
    return ptt
      ? `Cloud : clic micro${pttFrag} — relâcher pour dicter la question.`
      : "Cloud : clic sur le micro pour dicter la question.";
  if (b === "local_http")
    return ptt ? `Compagnon : clic micro${pttFrag} — relâcher pour dicter.` : "Compagnon : clic sur le micro.";
  return "Dictée de question";
}

function composeMicFooterHint(): string {
  if (state.composeMessage) return state.composeMessage;
  if (state.micState === "processing") {
    const bb = state.appPrefs.ai.dictationBackend;
    if (bb === "whisper_cpp") return "Dictée Whisper en cours…";
    return "Dictée en cours d’insertion…";
  }
  if (!isTauriRuntime()) return "Dictée : l’app bureau Tauri est requise.";
  if (!state.appPrefs.ai.dictationEnabled) return "Dictée désactivée — Paramètres → IA & dictée.";
  const b = state.appPrefs.ai.dictationBackend;
  const ptt = composePushToTalkTargetCode();
  const pttFrag = ptt ? ` ou maintenir ${composePushToTalkShortcutLabel()}` : "";
  if (b === "whisper_cpp")
    return ptt
      ? `Whisper : clic micro${pttFrag}, relâcher pour transcrire (HF auto).`
      : "Whisper : clic sur le micro pour transcrire (HF auto).";
  if (b === "cloud")
    return ptt
      ? `Cloud : clic micro${pttFrag} (clé API requise) — relâcher pour envoyer.`
      : "Cloud : clic sur le micro (clé API requise).";
  if (b === "local_http")
    return ptt ? `Compagnon : clic micro${pttFrag} — relâcher, audio HTTP.` : "Compagnon : clic sur le micro — audio HTTP.";
  return "Dictée";
}

function micAriaLabel(target: MicDictationTarget = "compose") {
  const ptt = composePushToTalkTargetCode();
  const lbl = composePushToTalkShortcutLabel();
  const qa = target === "thread-qa";
  if (state.micState === "recording") {
    return ptt
      ? `Enregistrement en cours — relâcher ${lbl} ou cliquer pour arrêter`
      : "Enregistrement en cours — cliquer pour arrêter";
  }
  if (state.micState === "processing") return qa ? "Transcription de la question en cours" : "Transcription en cours";
  return ptt
    ? `${qa ? "Dicter la question" : "Dictée"} — clic ou maintenir ${lbl}`
    : qa
      ? "Dicter la question — clic sur le micro"
      : "Dictée — clic sur le micro";
}

function render() {
  syncMailboxDigestPanelWithFeaturePref();
  accountsFormIdentityScratch = undefined;
  if (state.view === "settings" && state.settingsTab === "accounts") {
    const mailInput = document.querySelector<HTMLInputElement>("#account-email");
    if (mailInput && !skipAccountIdentityCaptureOnce) {
      accountsFormIdentityScratch = {
        email: mailInput.value ?? "",
        displayName: document.querySelector<HTMLInputElement>("#account-display-name")?.value ?? "",
      };
    }
    if (skipAccountIdentityCaptureOnce) {
      skipAccountIdentityCaptureOnce = false;
    }
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

registerWireEventsBridge({
  groupCollapsedQuotesByAttribution,
  syncPreviewOpenFromComposeLayout,
  downloadAllAttachmentsForMessage,
  writeSidebarCollapsedPreference,
  refreshSettingsPathsFromBackend,
  computeDraftDiffAgainstRevision,
  finishOAuthNewAccountAfterLogin,
  refreshSavedDraftsMailboxCount,
  refreshSemanticEmbeddingCounts,
  resolveSrcForMailImageLightbox,
  loadComposeMarkdownIntoEditor,
  schedulePersistAiPrefsFromDom,
  bulkMarkReadSearchViewThreads,
  finalizeSettingsAiModalClose,
  finalizeCloseComposeFromUser,
  bulkArchiveSearchViewThreads,
  runFluxAffinerFromSearchView,
  setComposeFromTextareaValue,
  paintLlmPrefetchProgressDom,
  loadThreadsForSearchContext,
  autoDetectLlamaServerBinary,
  persistEngineCheckboxToggle,
  loadAddressBookSidebarCount,
  agentInsertDraftIntoCompose,
  summarizeSenderThreadsLight,
  syncActivityRecordingPrefs,
  resetMarkdownEditorHistory,
  warnOAuthEphemeralRedirect,
  defaultListFilterFromPrefs,
  ensureValidSelectedMailbox,
  normalizeNlRuleInvokeInput,
  resetManualSearchNlFilters,
  refreshSuggestedSavedViews,
  discardCurrentDraftSession,
  leaveComposeViewAfterClose,
  mediaBlobToWav16kMonoPcm16,
  openEnginesAiSettingsModal,
  confirmAndExecuteSplitSend,
  scheduleDraftRevisionSave,
  micPermissionErrorMessage,
  paintStatusBarProgressDom,
  clearThreadAiSummaryState,
  wireComposeRecipientChips,
  dismissSuggestedSavedView,
  dismissOrphanDraftSession,
  navigateToBreadcrumbIndex,
  refreshOrganizationReport,
  markActiveSavedSearchSeen,
  clearSearchAndReloadInbox,
  agentRefreshPlanFromDraft,
  agentPrepareReplyContinue,
  discoverMailServersAction,
  normalizeMailHrefForOpen,
  wireAtAutocompleteFields,
  acceptSuggestedSavedView,
  resumeOrphanDraftSession,
  onOrgV2UnignoreMailboxUi,
  confirmThenRunOrgV2Apply,
  refreshFolderManagerTree,
  openExternalFromMailHref,
  llmQuickRepliesComposeUi,
  pickImapMailboxFallback,
  applyContextSliderIndex,
  launchContactMailSearch,
  usesSearchContextLoader,
  decodeHtmlEntitiesLoose,
  draftHasRecipientsExtra,
  saveDraftToSavedListNow,
  persistDefaultAccountId,
  loadAccountsFromBackend,
  refreshSearchTagCatalog,
  refreshLlmRuntimeStatus,
  bulkTrashVisibleThreads,
  fmConfirmArchiveMailbox,
  openOrganizationMailbox,
  prepareForwardToMessage,
  llmQuickRepliesThreadUi,
  confirmThenRunOrgApply,
  onOrgV2IgnoreMailboxUi,
  openOrganizationV2View,
  fmConfirmDeleteMailbox,
  launchDomainMailSearch,
  refreshAddressBookList,
  agentPrepareReplyStart,
  pickImgSrcForLightbox,
  scrollToThreadMessage,
  schedulePreviewUpdate,
  refreshDraftRevisions,
  openFolderManagerView,
  openContactDetailView,
  saveCurrentSearchView,
  deleteSavedSearchView,
  onOrgDeleteMailboxOne,
  persistAiPrefsFromDom,
  deleteSettingsAccount,
  prepareReplyToMessage,
  llmTranslateMessageUi,
  startNewDraftSession,
  bindComposerDropzone,
  onThreadToggleFollow,
  openOrganizationView,
  orgV2DismissProposal,
  applySavedSearchView,
  llmTranslateThreadUi,
  syncSearchBarChrome,
  launchTagMailSearch,
  switchActiveAccount,
  loadNewsletterRules,
  onEmptyTrashMailbox,
  mailboxManageAction,
  orgV2SnoozeProposal,
  applyMarkdownAction,
  tagFamilyForInvoke,
  stopAgentTelemetry,
  onAttachmentAction,
  cycleComposeLayout,
  clearDraftSession,
  cancelLlmQueueJob,
  commitSearchQuery,
  confirmMoveDialog,
  enterComposeView,
  readNlButtonRule,
  closeSearchModal,
  hydrateEmailHtml,
  threadIsAutoMail,
  openSettingsView,
  removeAttachment,
  clearAttachments,
  requestMicStream,
  openContactsView,
  onOrgSyncMailbox,
  llmInboxDigestUi,
  composeAiRewrite,
  composeAiGrammar,
  navigateToInbox,
  openSearchModal,
  fmSelectMailbox,
  fmCreateMailbox,
  pickAttachments,
  prepareReplyAll,
  summarizeThread,
  openMoveDialog,
  isSearchActive,
  onThreadMoveTo,
  sendQuickReply,
  prepareForward,
  computePreview,
  searchNlAssist,
  bytesToBase64,
  switchMailbox,
  runOrgV2Apply,
  fmSyncMailbox,
  llmQaThreadUi,
  onThreadMove,
  onThreadSeen,
  prepareReply,
  runOrgApply,
  saveAccount,
  syncInbox,
  sendDraft,
  micAction,
  render,
  goBack,
  addressBookRowsCache: () => addressBookRowsCache,
  skipAccountIdentityCaptureOnceRef,
  addressBookEditEmailRef,
  AI_PREFS_IMMEDIATE_CHECKBOX_IDS,
  composeInteractionsAbortRef,
});

registerRender(render);

registerRenderDeps({
  navCurrentBreadcrumbSegment,
  shouldShowDefaultAccountPrompt,
  defaultAccountIdFromPrefs,
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
  gatherStatusBarProgressJobs,
  currentAccount,
  activeMessageTranslationJobCount,
  activeSecurityLlmAugmentCount,
  activityTrackingEnabled,
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
  searchViewBatchJobStatusText,
  folderManagerPanelMailbox,
  cleanThreadListPreview,
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
  newsletterEmailListed,
  threadSuppressAutoEnvelopeMeta,
  messageHtmlForDisplay,
  extractUnsubscribeLinksFromHtml,
  threadMessageAnchorId,
  normalizedMailSecurity,
  mailSecurityTierClass,
  mailSecurityFindingsForDisplay,
  zenSummaryHtmlFragments,
  canonicalEmailForNlMatch,
  firstMatchingNewsletterRule,
  parseMaybeDate,
  dayKey,
  unsubscribeHrefScore,
  isSecurityLlmAugmentPending,
  draftHasRecipientsExtra,
  attachmentPathsJoinedForHiddenField,
  composeKindTitle,
  composeMicButtonTitle,
  micAriaLabel,
  formatDraftRevisionStamp,
  sanitizeEmailHtml,
  defaultListFilterFromPrefs,
  settingsDraftProfile,
  mergedProfileForAccountsForm,
  buildSettingsAiPanelDeps,
  addressBookRowsCache: () => addressBookRowsCache,
  addressBookEditEmail: () => addressBookEditEmail,
  addressBookListQuery: () => addressBookListQuery,
  accountsFormIdentityScratch: () => accountsFormIdentityScratch,
  threadQaMicButtonTitle,
  threadAiSummaryForCurrentThread,
  threadIdsMatch,
  agentStepProgressLabel,
  agentSkillEnabled,
  agentOfferSlotsStep,
  shouldOfferThreadTranslate,
  sortUnsubscribeLinks,
});

registerMailListDeps({
  isSearchActive,
  searchQueryUsesThreadsApi,
  usesSearchContextLoader,
  searchThreads,
  loadThreadsForSearchContext,
});

registerSearchQueryContext({ effectiveSearchMailboxPath });
registerSearchThreadsRunDeps({ committedSearchCriteriaSnapshot });

registerOpenThreadDeps({
  openSavedDraftById,
  beginNavigation,
  navPop,
  threadAiSummaryScoped,
  clearThreadAiSummaryState,
  threadIsAutoMail,
  stopAgentTelemetry,
  loadNewsletterRules,
  startThreadActivityOpen,
  hydrateMessageTranslationsFromCacheForThread,
  scheduleSecurityLlmAugment,
  summarizeThread,
  sourceMailboxForThread,
  isSenderBatchSummarizeActive: () => senderBatchSummarizeActive,
  getAutoThreadSummaryDoneFor: () => autoThreadSummaryDoneFor,
  setAutoThreadSummaryDoneFor: (threadId) => {
    autoThreadSummaryDoneFor = threadId;
  },
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
