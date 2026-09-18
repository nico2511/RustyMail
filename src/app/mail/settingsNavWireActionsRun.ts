import type { Account } from "../../accountSetup";
import { accountFieldTouched } from "../../accountSetup";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { safeInvoke } from "../lib/tauriCommand";
import { clearDiscoveredServerSnap } from "../account/discoveredServerSnap";
import { loadAccountsFromBackend } from "./accountsLoadAction";
import { loadMailView, loadMailboxUnread } from "./mailListView";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { refreshAddressBookList } from "./addressBookWireActions";
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
    case "open-settings-default-account":
      state.view = "settings";
      state.settingsTab = "general";
      render();
      return true;
    default:
      return false;
  }
}
