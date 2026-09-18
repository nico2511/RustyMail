import { invoke } from "@tauri-apps/api/core";

import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { Account } from "../../accountSetup";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";

export async function refreshMailboxListAfterSyncIfNeeded(
  account: Account,
  syncAllFolders: boolean,
  skippedOnServer: string[],
  selectionChangedByAlias: boolean,
  syncErrors: { mailbox: string; error: string }[],
): Promise<void> {
  if (syncAllFolders || skippedOnServer.length || selectionChangedByAlias || syncErrors.length) {
    try {
      const listed = await withTimeout(
        invoke<string[]>("list_imap_mailboxes", { accountId: account.id }),
        BOOT_INVOKE_TIMEOUT_MS,
      );
      if (account.id === state.selectedAccountId) {
        state.mailboxes = listed;
      }
    } catch (error) {
      console.error("list_imap_mailboxes after sync", error);
      toast(`Impossible de rafraîchir la liste des dossiers : ${tauriErrorMessage(error)}`);
    }
    ensureValidSelectedMailbox();
    render();
  }
}

export function applySyncedMailboxAliases(aliases: { requested: string; syncedAs: string }[]): boolean {
  let selectionChangedByAlias = false;
  for (const a of aliases) {
    if (state.selectedMailbox === a.requested) {
      state.selectedMailbox = a.syncedAs;
      selectionChangedByAlias = true;
    }
  }
  return selectionChangedByAlias;
}
