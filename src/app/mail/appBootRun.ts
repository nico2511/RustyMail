import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { setLocale, t } from "../../i18n";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { AppPathsView, AppStatus, LlmRuntimeStatus } from "../types";
import { applyDefaultAccountFromPrefs, ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { loadAccountsFromBackend } from "./accountsLoadFromBackend";
import { bindDraftPersistenceFlush, bindKeyboard, bindMouseNavigation } from "./appShellBindings";
import {
  fallbackCapabilities,
  fallbackStatus,
  normalizeCapabilities,
} from "./appRuntimeFallbacks";
import { bindMicPushToTalk } from "./composeMicDictation";
import { checkOrphanDraftSessionsOnBoot } from "./composeDraftLocalSave";
import { loadAddressBookSidebarCount } from "./loadAddressBookSidebarCount";
import { loadMailView, loadMailboxUnread } from "./mailListView";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { bindTauriNativeFileDropAsync } from "./composeTauriNativeFileDrop";
import { loadBootDeferredPrefs } from "./loadBootDeferredPrefs";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { refreshSavedSearches, refreshSuggestedSavedViews } from "./savedSearchViews";
import { syncActivityRecordingPrefs } from "./settingsWireActions";
import {
  notifyImapWatchFocusedMailbox,
  refreshUiAfterImapPush,
  syncInbox,
} from "./syncInboxRun";

let llmIdlePrefetchAfterBootScheduled = false;

export async function boot(): Promise<void> {
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

