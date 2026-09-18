import {
  currentAccount,
  loadMailView,
  loadMailboxUnread,
  render,
  applyListFilter,
  state,
  toast,
  invoke,
  t,
  isTauriRuntime,
  MAIL_ACTION_TIMEOUT_MS,
  BOOT_INVOKE_TIMEOUT_MS,
  OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
  finishConfirmModal,
  finishTextPromptModal,
  setLocale,
  withTimeout,
  tauriErrorMessage,
  safeInvoke,
  setSkipAccountIdentityCaptureOnce,
  isSearchActive,
  type OAuthDesktopLoginOutcome,
} from "./depsCore";
import {
  searchThreads,
  refreshSuggestedSavedViews,
  fetchOpenThreadOrNotify,
  refreshAddressBookList,
  enterComposeView,
  startNewDraftSession,
  syncPreviewOpenFromComposeLayout,
} from "./depsSearchMail";
import {
  prepareReply,
  threadIsAutoMail,
  loadNewsletterRules,
  clearThreadAiSummaryState,
  computePreview,
  resetMarkdownEditorHistory,
  scheduleDraftRevisionSave,
  loadAccountsFromBackend,
} from "./depsComposeThread";
import {
  accountFieldTouched,
  ipcThrottleMs,
  clearSuggestionShownKeys,
  isSavedDraftsVirtualMailbox,
  syncLlmEnginePrefsToDom,
  applyEngineConnectionMode,
  normalizeSettingsAiModalId,
  clearDiscoveredServerSnap,
  resetNewAccountSetupState,
  clearAccountOAuthWizard,
  DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY,
  LIST_FILTER_VALUES,
  type PromptCatalogItem,
  readNlButtonRule,
  normalizeNlRuleInvokeInput,
  openSettingsView,
  ensureValidSelectedMailbox,
  refreshSemanticEmbeddingCounts,
  refreshSettingsPathsFromBackend,
  openEnginesAiSettingsModal,
  finalizeSettingsAiModalClose,
  persistDefaultAccountId,
  switchActiveAccount,
  syncActivityRecordingPrefs,
  defaultListFilterFromPrefs,
  persistAiPrefsFromDom,
  refreshLlmRuntimeStatus,
  autoDetectLlamaServerBinary,
  paintLlmPrefetchProgressDom,
  paintStatusBarProgressDom,
  requestMicStream,
  mediaBlobToWav16kMonoPcm16,
  bytesToBase64,
  micPermissionErrorMessage,
  discoverMailServersAction,
  warnOAuthEphemeralRedirect,
  finishOAuthNewAccountAfterLogin,
  deleteSettingsAccount,
} from "./depsSettingsAccount";
import type { State } from "../../types";
import type { Account } from "../../../accountSetup";

export async function tryHandleModalsWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "text-prompt-confirm": {
      const raw = document.querySelector<HTMLInputElement>("#text-prompt-input")?.value ?? "";
      finishTextPromptModal(raw);
      return true;
    }
    case "text-prompt-cancel":
      finishTextPromptModal(null);
      return true;
    case "confirm-modal-yes":
      finishConfirmModal(true);
      return true;
    case "confirm-modal-no":
      finishConfirmModal(false);
      return true;
    default:
      return false;
  }
}
