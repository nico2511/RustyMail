import { invoke } from "@tauri-apps/api/core";
import type { Account } from "../../accountSetup";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { accountFieldTouched } from "../../accountSetup";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { clearDiscoveredServerSnap } from "../account/discoveredServerSnap";
import { loadAccountsFromBackend } from "./accountsLoadAction";
import { loadMailView, loadMailboxUnread } from "./mailListView";
import { refreshMailboxes } from "./refreshMailboxesRun";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { refreshAddressBookList } from "./addressBookWireActions";
import { syncAiEngineSettingsTabFromPrefs } from "./settingsLlmRuntime";
import { refreshDigestBenchStatus } from "./digestBenchActions";
import { captureDigestBenchDom } from "./digestBenchState";
import { captureDigestCutDom } from "./digestCutState";
import { beginNavigation } from "./appNavigationStack";
import {
  ensureValidSelectedMailbox,
  openSettingsView,
  refreshSemanticEmbeddingCounts,
  refreshSettingsPathsFromBackend,
} from "./settingsWireActions";

export async function tryHandleSettingsNavWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "settings":
    case "account":
      openSettingsView();
      return true;
    case "retry-mailbox-list": {
      await refreshMailboxes(currentAccount()?.id ?? null);
      ensureValidSelectedMailbox();
      render();
      return true;
    }
    case "reload-accounts": {
      const ok = await loadAccountsFromBackend({ silent: false });
      if (ok) {
        await refreshMailboxes(currentAccount()?.id ?? null);
        ensureValidSelectedMailbox();
        await loadMailView(false);
        await loadMailboxUnread();
        toast.info(`Compte chargé : ${currentAccount()?.email ?? ""}`);
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
        tab === "developer" ||
        tab === "digestBench" ||
        tab === "digestCut"
      ) {
        if (state.view !== "settings") {
          beginNavigation("settings");
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
        if (state.settingsTab === "digestBench" && tab !== "digestBench") {
          captureDigestBenchDom();
        }
        if (state.settingsTab === "digestCut" && tab !== "digestCut") {
          captureDigestCutDom();
        }
        state.settingsTab = tab;
        if (tab === "ai") syncAiEngineSettingsTabFromPrefs();
        render();
        if (tab === "autoSenders") void loadNewsletterRules().then(() => render());
        if (tab === "ai") void refreshSemanticEmbeddingCounts();
        if (tab === "addressBook") void refreshAddressBookList().then(() => render());
        if (tab === "storage") void refreshSettingsPathsFromBackend();
        if (tab === "digestBench") void refreshDigestBenchStatus().then(() => render());
      }
      return true;
    }
    case "settings-reload-paths":
      void refreshSettingsPathsFromBackend();
      return true;
    case "open-settings-default-account":
      openSettingsView({ settingsTab: "general" });
      return true;
    case "open-app-log-dir": {
      if (!isTauriRuntime()) {
        toast.info("Les journaux sont disponibles dans l’application bureau.");
        return true;
      }
      try {
        await invoke("open_app_log_dir");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(message || "Impossible d’ouvrir le dossier des journaux.");
      }
      return true;
    }
    default:
      return false;
  }
}
