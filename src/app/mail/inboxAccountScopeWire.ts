import { render } from "../dispatch";
import { state } from "../state";
import { openSettingsView } from "./settingsOpenView";
import {
  applyInboxScopeAccount,
  applyInboxScopeAll,
  closeAccountChrome,
  railAccountRowExpanded,
} from "./inboxAccountScope";

export async function tryHandleInboxAccountScopeWire(
  action: string,
  element?: HTMLElement,
): Promise<boolean> {
  switch (action) {
    case "toggle-inbox-account-menu":
      state.accountModalOpen = false;
      state.inboxAccountMenuOpen = !state.inboxAccountMenuOpen;
      render();
      return true;
    case "close-inbox-account-menu":
      state.inboxAccountMenuOpen = false;
      render();
      return true;
    case "toggle-account-modal":
      state.inboxAccountMenuOpen = false;
      state.accountModalOpen = !state.accountModalOpen;
      render();
      return true;
    case "close-account-modal":
      state.accountModalOpen = false;
      render();
      return true;
    case "inbox-scope-all":
      await applyInboxScopeAll();
      return true;
    case "inbox-scope-account": {
      const id = element?.dataset.accountId ?? "";
      await applyInboxScopeAccount(id);
      return true;
    }
    case "toggle-rail-account-section": {
      const id = element?.dataset.accountId?.trim() ?? "";
      if (!id || !state.accounts.some((a) => a.id === id)) return true;
      if (railAccountRowExpanded(id)) {
        state.railAccountSectionOpen = false;
        render();
        return true;
      }
      state.railAccountSectionOpen = true;
      if (state.selectedAccountId !== id) {
        await applyInboxScopeAccount(id);
        return true;
      }
      render();
      return true;
    }
    case "open-add-account":
      closeAccountChrome();
      openSettingsView();
      state.settingsSelectedAccountId = "new";
      state.accountPasswordSetupExpanded = false;
      state.accountServersPanelOpen = false;
      render();
      return true;
    default:
      return false;
  }
}
