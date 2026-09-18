import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import type { Account } from "../../accountSetup";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  accountForImapSync,
  syncAllAccountMailboxesRequested,
} from "./syncImapAccountContext";
import type { SyncInboxOptions } from "./syncInboxBatchRun";

export type SyncInboxPrepared = {
  account: Account;
  mailbox: string;
  syncAllFolders: boolean;
  keepThreadId: string | undefined;
  options: SyncInboxOptions | undefined;
};

export function prepareSyncInboxOrNotify(options?: SyncInboxOptions): SyncInboxPrepared | null {
  if (state.syncInProgress) return null;
  if (!isTauriRuntime()) {
    state.syncMessage = "Sync IMAP: disponible seulement dans l’app Tauri.";
    render();
    toast(state.syncMessage);
    return null;
  }

  const syncAllFolders = syncAllAccountMailboxesRequested(options);

  if (syncAllFolders && state.settingsSelectedAccountId === "new") {
    toast("Enregistrez d’abord le compte avant de synchroniser tous les dossiers.");
    return null;
  }

  const account = accountForImapSync();
  if (!account) {
    state.accountMessage = syncAllFolders
      ? "Aucun compte sélectionné — enregistrez ou choisissez un compte dans la liste."
      : "Aucun compte — enregistrez d’abord un compte IMAP.";
    state.syncMessage = state.accountMessage;
    render();
    toast(state.syncMessage);
    return null;
  }

  if (!syncAllFolders && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Pas de synchronisation IMAP pour les brouillons locaux.");
    return null;
  }

  const mailbox =
    syncAllFolders && isSavedDraftsVirtualMailbox(state.selectedMailbox) ?
      "INBOX"
    : state.selectedMailbox || "INBOX";
  const keepThreadId = state.view === "thread" ? state.selectedThreadId : undefined;
  return { account, mailbox, syncAllFolders, keepThreadId, options };
}

export function beginSyncInboxProgress(
  account: Account,
  mailbox: string,
  syncAllFolders: boolean,
): void {
  state.syncInProgress = true;
  state.syncProgressBatch = null;
  state.syncMessage =
    syncAllFolders ?
      `Sync… tous les dossiers · ${account.email}`
    : account.imap.allowInvalidTls ?
      `Sync… (TLS non vérifié) · ${mailbox}`
    : `Sync… · ${mailbox}`;
  render();
}

export function finishSyncInboxProgress(options?: SyncInboxOptions): void {
  state.syncInProgress = false;
  state.syncProgressBatch = null;
  if (options?.background) {
    window.setTimeout(() => {
      if (!state.syncInProgress) {
        state.syncMessage = "";
        render();
      }
    }, 1800);
  }
  render();
}
