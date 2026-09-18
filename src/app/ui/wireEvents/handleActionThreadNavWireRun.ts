import {
  render,
  goBack,
  navigateToInbox,
  navigateToBreadcrumbIndex,
  state,
} from "./depsCore";
import {
  writeSidebarCollapsedPreference,
  pickImapMailboxFallback,
  switchMailbox,
} from "./depsComposeThread";

export async function tryHandleThreadNavWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "back":
    case "nav-back":
      void goBack();
      return true;
    case "nav-crumb": {
      const raw = element?.dataset.navIndex ?? "";
      const idx = Number.parseInt(raw, 10);
      if (Number.isNaN(idx)) return true;
      void navigateToBreadcrumbIndex(idx);
      return true;
    }
    case "nav-inbox":
      navigateToInbox();
      return true;
    case "toggle-sidebar":
      if (state.view === "compose") return true;
      state.sidebarCollapsed = !state.sidebarCollapsed;
      writeSidebarCollapsedPreference(state.sidebarCollapsed);
      render();
      return true;
    case "leave-saved-drafts-mailbox":
      void (async () => {
        await switchMailbox(pickImapMailboxFallback());
      })();
      return true;
    default:
      return false;
  }
}
