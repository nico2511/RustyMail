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

export async function tryHandleNewsletterRulesWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "newsletter-domain-add": {
      void (async () => {
        const raw = document.querySelector<HTMLInputElement>("#newsletter-domain-input")?.value?.trim() ?? "";
        if (!raw) {
          toast("Indiquez une règle (domaine, *.domaine ou local@domaine).");
          return;
        }
        if (!isTauriRuntime()) {
          toast("Ajout de règles : exécutez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: raw }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          const inp = document.querySelector<HTMLInputElement>("#newsletter-domain-input");
          if (inp) inp.value = "";
          toast("Règle enregistrée.");
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    case "newsletter-domain-remove": {
      const dom = readNlButtonRule(element);
      if (!dom) {
        toast("Règle invalide ou manquante.");
        return true;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Suppression des règles : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          toast("Règle supprimée.");
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    case "newsletter-msg-add-rule": {
      const raw = readNlButtonRule(element);
      const rule = normalizeNlRuleInvokeInput(raw);
      if (!rule) {
        toast("Impossible de lire l’adresse (data-rule vide). Réouvrez le fil ou utilisez les paramètres.");
        return true;
      }
      if (!rule.includes("@")) {
        toast("Pour ajouter depuis un message, l’expéditeur doit être une adresse e-mail (avec @).");
        return true;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Ajout depuis un message : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: rule }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          if (state.selectedThreadId) {
            const tid = state.selectedThreadId;
            const refreshed = await fetchOpenThreadOrNotify(tid);
            if (refreshed) state.selectedThread = refreshed;
          }
          toast(`Règle ajoutée : ${rule}`);
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    case "newsletter-msg-remove-rule": {
      const dom = readNlButtonRule(element);
      if (!dom) {
        toast("Règle invalide ou manquante.");
        return true;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Retrait de règle : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          if (state.selectedThreadId) {
            const tid = state.selectedThreadId;
            const refreshed = await fetchOpenThreadOrNotify(tid);
            if (refreshed) state.selectedThread = refreshed;
          }
          toast(`Règle retirée : ${dom}`);
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    default:
      return false;
  }
}
