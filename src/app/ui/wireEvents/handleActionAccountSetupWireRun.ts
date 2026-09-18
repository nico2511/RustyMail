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

export async function tryHandleAccountSetupWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "settings-select-account": {
      const id = element?.dataset.accountId?.trim();
      if (!id) return true;
      setSkipAccountIdentityCaptureOnce(true);
      clearDiscoveredServerSnap();
      state.settingsSelectedAccountId = id;
      accountFieldTouched.serverFields = false;
      state.accountServersPanelOpen = true;
      state.oauthLockedEmail = null;
      state.accountFormOAuthPrefill = null;
      resetNewAccountSetupState();
      render();
      return true;
    }
    case "settings-new-account":
      setSkipAccountIdentityCaptureOnce(true);
      clearDiscoveredServerSnap();
      state.settingsSelectedAccountId = "new";
      accountFieldTouched.serverFields = false;
      resetNewAccountSetupState();
      render();
      return true;
    case "discover-mail-servers":
      void discoverMailServersAction();
      return true;
    case "account-toggle-servers":
      state.accountServersPanelOpen = !state.accountServersPanelOpen;
      render();
      return true;
    case "oauth-google-connect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("OAuth2 : lancez l’application bureau Tauri.");
          return;
        }
        try {
          const o = await withTimeout(
            invoke<OAuthDesktopLoginOutcome>("oauth_google_desktop_login_cmd", {}),
            OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
          );
          warnOAuthEphemeralRedirect(o);
          const email = (o.email ?? "").trim();
          if (!email.includes("@")) {
            toast("OAuth Google : adresse e-mail absente ou invalide.");
            return;
          }
          setSkipAccountIdentityCaptureOnce(true);
          await finishOAuthNewAccountAfterLogin("oauthGoogle", email, (o.displayName ?? "").trim());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "oauth-microsoft-connect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("OAuth2 : lancez l’application bureau Tauri.");
          return;
        }
        try {
          const o = await withTimeout(
            invoke<OAuthDesktopLoginOutcome>("oauth_microsoft_desktop_login_cmd", {}),
            OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
          );
          warnOAuthEphemeralRedirect(o);
          const email = (o.email ?? "").trim();
          if (!email.includes("@")) {
            toast("OAuth Microsoft : adresse e-mail absente ou invalide.");
            return;
          }
          setSkipAccountIdentityCaptureOnce(true);
          await finishOAuthNewAccountAfterLogin("oauthMicrosoft", email, (o.displayName ?? "").trim());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "account-auth-password-mode":
      clearAccountOAuthWizard();
      state.accountPasswordSetupExpanded = true;
      state.accountFormAuthKind = "password";
      state.oauthLockedEmail = null;
      state.accountFormOAuthPrefill = null;
      state.accountServersPanelOpen = false;
      render();
      return true;
    case "oauth-wizard-retry": {
      const retry = state.accountOAuthWizardRetry;
      if (!retry || (retry.authKind !== "oauthGoogle" && retry.authKind !== "oauthMicrosoft")) return true;
      clearAccountOAuthWizard();
      void finishOAuthNewAccountAfterLogin(retry.authKind, retry.email, retry.displayName);
      return true;
    }
    case "delete-settings-account":
      void deleteSettingsAccount();
      return true;
    default:
      return false;
  }
}
