import { render } from "../dispatch";
import { state } from "../state";
import { goBack, navigateToInbox, navigateToBreadcrumbIndex } from "./appNavActions";
import { writeSidebarCollapsedPreference } from "../lib/sidebarUiPref";
import { scheduleSecurityLlmAugment } from "./mailSecurityDisplay";
import { messageAccordionOpen, nextAccordionAfterToggle } from "./threadAccordion";
import { sortMessagesByReceivedDescending } from "./threadMessageSort";
import { pickImapMailboxFallback } from "./mailboxImapFallback";
import { switchMailbox } from "./switchMailboxAction";

function scheduleSecurityForOpenMessages(): void {
  const msgs = sortMessagesByReceivedDescending(state.selectedThread?.messages ?? []);
  const ids = msgs.map((m) => m.messageId);
  for (const m of msgs) {
    if (messageAccordionOpen(state.threadAccordion, m.messageId, ids)) {
      scheduleSecurityLlmAugment(m);
    }
  }
}

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
    case "thread-accordion-toggle": {
      const id = element?.dataset.msgId?.trim() ?? "";
      const ids = sortMessagesByReceivedDescending(state.selectedThread?.messages ?? []).map((m) => m.messageId);
      state.threadAccordion = nextAccordionAfterToggle(state.threadAccordion, id, ids);
      scheduleSecurityForOpenMessages();
      render();
      return true;
    }
    case "thread-accordion-expand-all":
      state.threadAccordion = "all";
      scheduleSecurityForOpenMessages();
      render();
      return true;
    case "thread-accordion-collapse-all":
      state.threadAccordion = "none";
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
