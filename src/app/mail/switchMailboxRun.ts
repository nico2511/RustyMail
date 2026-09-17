import { notifyImapWatchFocusedMailbox } from "../../imapWatchFocus";
import { navReset } from "../../navigation";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import { defaultListFilterFromPrefs } from "./accountDefaultPrefs";
import {
  cancelMailboxDigestLiveDebounce,
  enqueueMailboxDigestRefreshWhenIdle,
  mailboxDigestSlotInList,
  resetMailboxDigestForNavigation,
} from "./mailboxDigest";
import { invalidateIdleAiCachePrefetch } from "./idleAiCachePrefetch";
import { exitSearchModeForMailboxBrowse } from "./searchMailboxBrowseExit";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";

export type SwitchMailboxRunDeps = {
  loadMailView: (append?: boolean) => Promise<void>;
};

let switchMailboxRunDeps: SwitchMailboxRunDeps | null = null;

export function registerSwitchMailboxRunDeps(deps: SwitchMailboxRunDeps): void {
  switchMailboxRunDeps = deps;
}

function switchDeps(): SwitchMailboxRunDeps {
  if (!switchMailboxRunDeps) throw new Error("registerSwitchMailboxRunDeps not called");
  return switchMailboxRunDeps;
}

export async function switchMailbox(nextMailbox: string): Promise<void> {
  if (state.view === "folderManager") return;
  if (
    state.view === "thread" ||
    state.view === "contacts" ||
    state.view === "contact" ||
    state.view === "settings" ||
    state.view === "organization" ||
    state.view === "organizationV2" ||
    state.view === "compose"
  ) {
    navReset();
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
    state.selectedContactEmail = undefined;
    state.aiOpen = false;
    clearThreadAiSummaryState();
  }
  state.selectedMailbox = nextMailbox || "INBOX";
  notifyImapWatchFocusedMailbox({
    isTauri: isTauriRuntime(),
    accountId: currentAccount()?.id,
    mailbox: state.selectedMailbox,
  });
  exitSearchModeForMailboxBrowse();
  state.searchScope = "mailbox";
  state.listFilter = defaultListFilterFromPrefs();
  resetMailboxDigestForNavigation();
  invalidateIdleAiCachePrefetch();
  await switchDeps().loadMailView(false);
  cancelMailboxDigestLiveDebounce();
  if (mailboxDigestSlotInList()) {
    void enqueueMailboxDigestRefreshWhenIdle(false);
  }
  await refreshSavedDraftsMailboxCount();
  if (!state.threads.some((t) => t.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
  }
  render();
}
