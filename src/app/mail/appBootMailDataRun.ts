import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { state } from "../state";
import { applyDefaultAccountFromPrefs, ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { checkOrphanDraftSessionsOnBoot } from "./composeDraftLocalSave";
import { loadAddressBookSidebarCount } from "./loadAddressBookSidebarCount";
import { loadBootDeferredPrefs } from "./loadBootDeferredPrefs";
import { loadMailView, loadMailboxUnread } from "./mailListView";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { refreshMailboxes } from "./refreshMailboxesRun";
import { refreshSavedSearches, refreshSuggestedSavedViews } from "./savedSearchViews";
import { syncActivityRecordingPrefs } from "./settingsWireActions";
import { notifyImapWatchFocusedMailbox, syncInbox } from "./syncInboxRun";

/** LIST IMAP + sync : après le cache local, pour ne pas bloquer l’inbox. */
async function bootRefreshMailboxesThenSync(): Promise<void> {
  const accountId = currentAccount()?.id ?? null;
  await refreshMailboxes(accountId);
  ensureValidSelectedMailbox();
  notifyImapWatchFocusedMailbox(state.selectedMailbox);
  render();
  if (isTauriRuntime() && accountId?.trim()) {
    void syncInbox({ background: true });
  }
}

export async function bootLoadInitialMailData(): Promise<void> {
  await loadBootDeferredPrefs();
  applyDefaultAccountFromPrefs();
  // Cache SQLite d’abord — pas d’attente LIST/sync IMAP (sinon timeout + UI figée).
  ensureValidSelectedMailbox();
  await loadMailView();
  state.selectedThreadId = state.threads[0]?.id;
  render();

  void bootRefreshMailboxesThenSync();

  await loadMailboxUnread();
  await refreshSavedDraftsMailboxCount();
  await checkOrphanDraftSessionsOnBoot();
  await loadAddressBookSidebarCount();
  await refreshSavedSearches(true);
  syncActivityRecordingPrefs();
  await refreshSuggestedSavedViews();
  await loadNewsletterRules();
  if (!state.selectedThreadId) {
    state.selectedThreadId = state.threads[0]?.id;
  }
  render();
}
