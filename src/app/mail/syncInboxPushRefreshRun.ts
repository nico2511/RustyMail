import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { state } from "../state";
import { loadMailboxUnread } from "./mailListView";
import { refreshSavedSearches, refreshSuggestedSavedViews } from "./savedSearchViews";
import {
  reloadMailListAfterImapChange,
  restoreThreadSelectionAfterReload,
} from "./syncInboxListReloadRun";

export async function refreshUiAfterImapPush(mailboxHint?: string): Promise<void> {
  if (!isTauriRuntime()) return;
  const pushed = (mailboxHint || "").trim();
  const current = (state.selectedMailbox || "INBOX").trim();
  const sameFolder =
    !pushed ||
    pushed.localeCompare(current, undefined, { sensitivity: "accent" }) === 0;
  try {
    if (!sameFolder) {
      await loadMailboxUnread();
      render();
      return;
    }
    await reloadMailListAfterImapChange();
    const keepThreadId = state.view === "thread" ? state.selectedThreadId : undefined;
    await restoreThreadSelectionAfterReload({ keepThreadId, mode: "push" });
    state.syncMessage = "Boîte mise à jour";
    render();
    void refreshSavedSearches(true);
    void refreshSuggestedSavedViews();
    window.setTimeout(() => {
      if (!state.syncInProgress && state.syncMessage === "Boîte mise à jour") {
        state.syncMessage = "";
        render();
      }
    }, 1800);
  } catch (error) {
    console.warn("refreshUiAfterImapPush", error);
  }
}
