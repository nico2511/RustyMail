import { safeInvoke } from "../lib/tauriCommand";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { state } from "../state";
import {
  cancelMailboxDigestLiveDebounce,
  enqueueMailboxDigestRefreshWhenIdle,
  mailboxDigestSlotInList,
  resetMailboxDigestForNavigation,
} from "./mailboxDigest";
import { syncActivityRecordingPrefs } from "./threadActivityTracking";
import { defaultListFilterFromPrefs, ensureValidSelectedMailbox } from "./accountDefaultPrefs";

export type SwitchActiveAccountDeps = {
  loadMailView: (append?: boolean) => Promise<void>;
  loadMailboxUnread: () => Promise<void>;
  refreshSavedDraftsMailboxCount: () => Promise<void>;
  loadAddressBookSidebarCount: () => Promise<void>;
  refreshSavedSearches: (force?: boolean) => Promise<void>;
  refreshSuggestedSavedViews: () => Promise<void>;
};

let switchActiveAccountDeps: SwitchActiveAccountDeps | null = null;

export function registerSwitchActiveAccountDeps(deps: SwitchActiveAccountDeps): void {
  switchActiveAccountDeps = deps;
}

function switchDeps(): SwitchActiveAccountDeps {
  if (!switchActiveAccountDeps) throw new Error("registerSwitchActiveAccountDeps not called");
  return switchActiveAccountDeps;
}

export async function switchActiveAccount(accountId: string): Promise<void> {
  const id = accountId.trim();
  if (!id || !state.accounts.some((a) => a.id === id)) return;
  const d = switchDeps();
  state.selectedAccountId = id;
  state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: id }, [], BOOT_INVOKE_TIMEOUT_MS);
  ensureValidSelectedMailbox();
  state.search = "";
  state.searchDraft = "";
  state.searchNewsletterRule = null;
  state.searchModifiersTouched = false;
  state.activeSavedSearchId = null;
  resetMailboxDigestForNavigation();
  state.listFilter = defaultListFilterFromPrefs();
  await d.loadMailView(false);
  cancelMailboxDigestLiveDebounce();
  if (mailboxDigestSlotInList()) {
    void enqueueMailboxDigestRefreshWhenIdle(false);
  }
  await d.loadMailboxUnread();
  await d.refreshSavedDraftsMailboxCount();
  await d.loadAddressBookSidebarCount();
  await d.refreshSavedSearches(true);
  syncActivityRecordingPrefs();
  await d.refreshSuggestedSavedViews();
  state.selectedThreadId = state.threads[0]?.id;
  state.selectedThread = undefined;
}
