import { invoke } from "@tauri-apps/api/core";

import { isSavedDraftsVirtualMailbox, pickSystemMailboxes } from "../../mailboxKinds";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { state } from "../state";
import type { Account } from "../../accountSetup";

export type SyncInboxOptions = {
  background?: boolean;
  allMailboxes?: boolean;
};

export async function resolveImapSyncTargets(
  account: Account,
  mailbox: string,
  syncAllFolders: boolean,
  options?: SyncInboxOptions,
): Promise<string[]> {
  if (syncAllFolders) {
    const listed = await withTimeout(
      invoke<string[]>("list_imap_mailboxes", { accountId: account.id }),
      BOOT_INVOKE_TIMEOUT_MS,
    );
    let targets = Array.from(new Set(listed.map((m) => m.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    if (!targets.length) targets = ["INBOX"];
    if (account.id === state.selectedAccountId) {
      state.mailboxes = listed;
    }
    return targets;
  }
  if (options?.background) {
    return [mailbox];
  }
  const all = state.mailboxes.length ? state.mailboxes : [mailbox];
  const primary = pickSystemMailboxes(all).map((x) => x.name);
  return Array.from(new Set([...primary, mailbox].filter(Boolean)));
}
