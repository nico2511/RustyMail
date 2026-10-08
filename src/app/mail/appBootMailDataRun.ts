import { currentAccount } from "../core/accountContext";
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
import { notifyImapWatchFocusedMailbox } from "./syncInboxRun";

export async function bootLoadInitialMailData(): Promise<void> {
  await loadBootDeferredPrefs();
  applyDefaultAccountFromPrefs();
  await refreshMailboxes(currentAccount()?.id ?? null);
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
}
