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

export async function tryHandleSettingsApiKeysWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "save-cloud-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-cloud-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé API avant d’enregistrer.");
          return;
        }
        try {
          await withTimeout(invoke("set_openrouter_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          await withTimeout(invoke("set_dictation_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = true;
          state.dictationApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé cloud enregistrée (OpenRouter + dictée).");
          void refreshLlmRuntimeStatus(false).then(() => {
            if (state.settingsAiModal === "engines") render();
          });
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "clear-cloud-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_openrouter_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          await withTimeout(invoke("clear_dictation_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = false;
          state.dictationApiKeySet = false;
          toast("Clé cloud supprimée.");
          void refreshLlmRuntimeStatus(false).then(() => {
            if (state.settingsAiModal === "engines") render();
          });
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "save-dictation-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-dictation-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé API avant d’enregistrer.");
          return;
        }
        try {
          await withTimeout(invoke("set_dictation_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.dictationApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé API enregistrée dans le trousseau.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    }
    case "clear-dictation-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_dictation_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.dictationApiKeySet = false;
          toast("Clé API supprimée du trousseau.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    }
    case "save-openrouter-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-openrouter-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé OpenRouter avant d’enregistrer.");
          return;
        }
        try {
          await withTimeout(invoke("set_openrouter_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé OpenRouter enregistrée dans le trousseau.");
          void refreshLlmRuntimeStatus(false).then(() => render());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    }
    case "clear-openrouter-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_openrouter_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = false;
          toast("Clé OpenRouter supprimée du trousseau.");
          void refreshLlmRuntimeStatus(false).then(() => render());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    }
    case "save-llama-server-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-llama-server-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé Bearer avant d’enregistrer (ou laissez vide et utilisez « Supprimer »).");
          return;
        }
        try {
          await withTimeout(invoke("set_llama_server_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.llamaServerApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé llama-server enregistrée dans le trousseau.");
          void refreshLlmRuntimeStatus(false).then(() => render());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    }
    case "clear-llama-server-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_llama_server_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.llamaServerApiKeySet = false;
          toast("Clé llama-server supprimée du trousseau.");
          void refreshLlmRuntimeStatus(false).then(() => render());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    }
    default:
      return false;
  }
}
