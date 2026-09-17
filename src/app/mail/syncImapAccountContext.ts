import type { Account } from "../../accountSetup";
import { syncInvokeTimeoutMs as syncInvokeTimeoutMsFor } from "../../imapSyncTypes";
import { SYNC_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { state } from "../state";

export function syncInvokeTimeoutMs(mailboxCount: number): number {
  return syncInvokeTimeoutMsFor(mailboxCount, SYNC_INVOKE_TIMEOUT_MS);
}

export function accountForImapSync(): Account | undefined {
  if (state.view === "settings" && state.settingsTab === "accounts" && state.settingsSelectedAccountId !== "new") {
    return state.accounts.find((a) => a.id === state.settingsSelectedAccountId);
  }
  return currentAccount();
}

export function syncAllAccountMailboxesRequested(options?: { allMailboxes?: boolean }): boolean {
  return (
    options?.allMailboxes === true ||
    (options?.allMailboxes !== false && state.view === "settings" && state.settingsTab === "accounts")
  );
}
