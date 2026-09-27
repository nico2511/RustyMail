import { render } from "../dispatch";
import { state } from "../state";
import { openSettingsView } from "./settingsOpenView";
import { applyInboxScopeAccount, applyInboxScopeAll, closeAccountChrome } from "./inboxAccountScope";

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
