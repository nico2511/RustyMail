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

export async function tryHandleSettingsShellWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "settings":
    case "account":
      openSettingsView();
      return true;
    case "reload-accounts": {
      const ok = await loadAccountsFromBackend({ silent: false });
      if (ok) {
        state.mailboxes = await safeInvoke<string[]>(
          "list_imap_mailboxes",
          { accountId: currentAccount()?.id ?? null },
          [],
          BOOT_INVOKE_TIMEOUT_MS
        );
        ensureValidSelectedMailbox();
        await loadMailView(false);
        await loadMailboxUnread();
        toast(`Compte chargé : ${currentAccount()?.email ?? ""}`);
      }
      render();
      return true;
    }
    case "settings-tab": {
      const tab = element?.dataset.settingsTab;
      if (
        tab === "accounts" ||
        tab === "general" ||
        tab === "appearance" ||
        tab === "autoSenders" ||
        tab === "ai" ||
        tab === "addressBook" ||
        tab === "storage" ||
        tab === "shortcuts" ||
        tab === "developer"
      ) {
        if (state.view !== "settings") {
          state.view = "settings";
          state.aiOpen = false;
          clearDiscoveredServerSnap();
          state.settingsSelectedAccountId =
            state.selectedAccountId && state.accounts.some((a: Account) => a.id === state.selectedAccountId)
              ? state.selectedAccountId
              : (state.accounts[0]?.id ?? "new");
          accountFieldTouched.serverFields = false;
          state.accountServersPanelOpen = state.settingsSelectedAccountId !== "new";
        }
        state.settingsTab = tab;
        render();
        if (tab === "autoSenders") void loadNewsletterRules().then(() => render());
        if (tab === "ai") void refreshSemanticEmbeddingCounts();
        if (tab === "addressBook") void refreshAddressBookList().then(() => render());
        if (tab === "storage") void refreshSettingsPathsFromBackend();
      }
      return true;
    }
    case "settings-reload-paths":
      void refreshSettingsPathsFromBackend();
      return true;
    case "settings-ia-tab": {
      const tab = element?.dataset.iaTab;
      if (tab === "semantic") {
        state.settingsAiModal = "semantic";
        void refreshSemanticEmbeddingCounts().then(() => render());
      } else if (tab === "llm") {
        void openEnginesAiSettingsModal();
      } else if (tab === "dictation") {
        state.settingsAiModal = "dictation";
        render();
      } else if (tab === "background") {
        state.settingsAiModal = "background";
        render();
      } else if (tab === "features") {
        state.settingsAiModal = "features-0";
        render();
      }
      return true;
    }
    case "open-settings-ai-modal": {
      const modal = normalizeSettingsAiModalId(element?.dataset.aiModal);
      if (!modal) return true;
      state.settingsAiModal = modal;
      if (modal === "prompts") {
        void (async () => {
          if (!isTauriRuntime()) {
            state.promptCatalog = null;
            state.promptCatalogLoadError = t("settings.ai.promptsNoCatalog");
            render();
            return;
          }
          try {
            state.promptCatalog = await invoke<PromptCatalogItem[]>("list_ai_prompt_catalog", {});
            state.promptCatalogLoadError = "";
          } catch (e) {
            state.promptCatalog = null;
            state.promptCatalogLoadError = tauriErrorMessage(e);
          }
          render();
        })();
      } else if (modal === "semantic") void refreshSemanticEmbeddingCounts().then(() => render());
      else if (modal === "engines") void openEnginesAiSettingsModal();
      else render();
      return true;
    }
    case "close-settings-ai-modal":
      finalizeSettingsAiModalClose();
      state.settingsAiModal = null;
      render();
      return true;
    case "save-default-account-prompt": {
      void (async () => {
        const sel = document.querySelector<HTMLSelectElement>("#default-account-prompt-select");
        const id = (sel?.value ?? "").trim();
        if (!id) {
          toast("Choisissez un compte.");
          return;
        }
        try {
          await persistDefaultAccountId(id);
          await switchActiveAccount(id);
          toast("Compte par défaut enregistré.");
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "dismiss-default-account-prompt": {
      try {
        window.localStorage.setItem(DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      render();
      return true;
    }
    case "open-settings-default-account":
      state.view = "settings";
      state.settingsTab = "general";
      render();
      return true;
    case "save-general-prefs": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const sel = document.querySelector<HTMLSelectElement>("#prefs-mother-language");
        if (sel) {
          state.appPrefs.general.motherLanguage = sel.value.trim() || "fr";
          state.appPrefs.ai.draftLanguage = state.appPrefs.general.motherLanguage;
          setLocale(state.appPrefs.general.motherLanguage);
        }
        const globalCb = document.querySelector<HTMLInputElement>("#prefs-address-book-global");
        state.appPrefs.general.addressBookGlobalScope = Boolean(globalCb?.checked);
        const activityCb = document.querySelector<HTMLInputElement>("#prefs-activity-suggestions");
        state.appPrefs.general.activitySuggestionsEnabled = activityCb?.checked !== false;
        syncActivityRecordingPrefs();
        if (!state.appPrefs.general.activitySuggestionsEnabled) {
          state.suggestedSavedViews = [];
          clearSuggestionShownKeys();
        } else {
          void refreshSuggestedSavedViews().then(() => render());
        }
        const lfSel = document.querySelector<HTMLSelectElement>("#prefs-default-list-filter");
        const lfRaw = lfSel?.value?.trim() ?? "all";
        state.appPrefs.general.defaultListFilter = LIST_FILTER_VALUES.includes(lfRaw as State["listFilter"])
          ? (lfRaw as State["listFilter"])
          : "all";
        const archLayout = document.querySelector<HTMLSelectElement>("#prefs-archive-layout");
        state.appPrefs.general.archiveLayout = archLayout?.value?.trim() || "hierarchical";
        const archRoot = document.querySelector<HTMLInputElement>("#prefs-archive-root");
        state.appPrefs.general.archiveRoot = (archRoot?.value ?? "Archive").trim() || "Archive";
        const staleDays = document.querySelector<HTMLInputElement>("#prefs-stale-inbox-days");
        const staleN = Number(staleDays?.value ?? 90);
        state.appPrefs.general.staleInboxDays = Number.isFinite(staleN) ? Math.max(1, Math.floor(staleN)) : 90;
        const hybridW = document.querySelector<HTMLInputElement>("#prefs-hybrid-weight");
        const hw = Number(hybridW?.value ?? 0.55);
        state.appPrefs.general.hybridLexicalWeight = Number.isFinite(hw)
          ? Math.min(1, Math.max(0, hw))
          : 0.55;
        state.appPrefs.general.autoArchiveEnabled = Boolean(
          document.querySelector<HTMLInputElement>("#prefs-auto-archive-enabled")?.checked,
        );
        const accSel = document.querySelector<HTMLSelectElement>("#prefs-default-account");
        const accVal = (accSel?.value ?? "").trim();
        if (accVal) state.appPrefs.general.defaultAccountId = accVal;
        else delete state.appPrefs.general.defaultAccountId;
        try {
          await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          toast(t("toast.prefsSaved"));
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        if (accVal && state.view === "list") {
          await switchActiveAccount(accVal);
          render();
        } else if (
          state.view === "list" &&
          !isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "") &&
          !isSearchActive() &&
          state.listFilter !== defaultListFilterFromPrefs()
        ) {
          await applyListFilter(defaultListFilterFromPrefs());
        } else {
          render();
        }
      })();
      return true;
    }
    default:
      return false;
  }
}
