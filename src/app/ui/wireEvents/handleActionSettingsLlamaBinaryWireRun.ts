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

export async function tryHandleSettingsLlamaBinaryWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "llama-server-detect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Détection : lancez l’app Tauri.");
          return;
        }
        try {
          const det = await invoke<{
            onPath: boolean;
            wingetInstalled: boolean;
            resolvedPath?: string | null;
          }>("llama_server_detect", {
            binaryHint: state.appPrefs.ai.llamaServerBinaryPath || "llama-server",
          });
          if (det.onPath || det.wingetInstalled) {
            toast(`llama-server détecté${det.resolvedPath ? ` (${det.resolvedPath})` : ""}.`);
          } else {
            toast("llama-server introuvable (PATH et winget).");
          }
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "llama-server-winget-install": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("winget : lancez l’app Tauri sous Windows.");
          return;
        }
        toast("Installation winget… une fenêtre administrateur peut s’ouvrir.");
        try {
          const res = await invoke<{ success: boolean; message: string }>("llama_server_winget_install", {});
          toast(res.message);
          if (res.success) {
            state.appPrefs.ai.llamaServerEnabled = true;
            state.appPrefs.ai.llamaServerSpawnEnabled = true;
            state.appPrefs.ai.llamaServerBinaryPath = "llama-server";
            state.appPrefs.ai.localLlmEnabled = true;
            await invoke("set_app_prefs", { prefs: state.appPrefs });
            void refreshLlmRuntimeStatus(false).then(() => render());
          }
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    }
    case "pick-llama-server-binary-path": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Parcourir : lancez l’app Tauri.");
          return;
        }
        try {
          const picked = await withTimeout(
            invoke<string | null>("pick_llama_server_binary_path", {}),
            MAIL_ACTION_TIMEOUT_MS
          );
          if (!picked?.trim()) {
            toast("Aucun fichier sélectionné.");
            return;
          }
          state.appPrefs.ai.llamaServerBinaryPath = picked.trim();
          await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          toast("Chemin llama-server enregistré.");
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
