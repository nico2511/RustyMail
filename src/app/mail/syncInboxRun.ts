import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshSavedSearches, refreshSuggestedSavedViews } from "./savedSearchViews";
import {
  accountForImapSync,
  syncAllAccountMailboxesRequested,
} from "./syncImapAccountContext";
import {
  applySyncedMailboxAliases,
  refreshMailboxListAfterSyncIfNeeded,
  resolveImapSyncTargets,
  runBatchedImapSync,
  type SyncInboxOptions,
} from "./syncInboxBatchRun";
import {
  reloadMailListAfterImapChange,
  restoreThreadSelectionAfterReload,
} from "./syncInboxListReloadRun";
import {
  buildSyncStatusMessage,
  maybeTriggerSemanticReindex,
  notifySyncCompletionToasts,
} from "./syncInboxStatusRun";

export type { SyncInboxOptions } from "./syncInboxBatchRun";

export async function syncInbox(options?: SyncInboxOptions): Promise<void> {
  if (state.syncInProgress) return;
  if (!isTauriRuntime()) {
    state.syncMessage = "Sync IMAP: disponible seulement dans l’app Tauri.";
    render();
    toast(state.syncMessage);
    return;
  }

  const syncAllFolders = syncAllAccountMailboxesRequested(options);

  if (syncAllFolders && state.settingsSelectedAccountId === "new") {
    toast("Enregistrez d’abord le compte avant de synchroniser tous les dossiers.");
    return;
  }

  const account = accountForImapSync();
  if (!account) {
    state.accountMessage = syncAllFolders
      ? "Aucun compte sélectionné — enregistrez ou choisissez un compte dans la liste."
      : "Aucun compte — enregistrez d’abord un compte IMAP.";
    state.syncMessage = state.accountMessage;
    render();
    toast(state.syncMessage);
    return;
  }

  if (!syncAllFolders && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Pas de synchronisation IMAP pour les brouillons locaux.");
    return;
  }

  const mailbox =
    syncAllFolders && isSavedDraftsVirtualMailbox(state.selectedMailbox) ?
      "INBOX"
    : state.selectedMailbox || "INBOX";
  const keepThreadId = state.view === "thread" ? state.selectedThreadId : undefined;
  state.syncInProgress = true;
  state.syncProgressBatch = null;
  state.syncMessage =
    syncAllFolders ?
      `Sync… tous les dossiers · ${account.email}`
    : account.imap.allowInvalidTls ?
      `Sync… (TLS non vérifié) · ${mailbox}`
    : `Sync… · ${mailbox}`;
  render();

  try {
    const targets = await resolveImapSyncTargets(account, mailbox, syncAllFolders, options);
    const outcome = await runBatchedImapSync(account, targets, mailbox, syncAllFolders);
    const results = outcome.results ?? [];
    const skippedOnServer = outcome.skippedNotOnServer ?? [];
    const syncErrors = outcome.syncErrors ?? [];
    const aliases = outcome.syncedMailboxAliases ?? [];
    const selectionChangedByAlias = applySyncedMailboxAliases(aliases);
    await refreshMailboxListAfterSyncIfNeeded(
      account,
      syncAllFolders,
      skippedOnServer,
      selectionChangedByAlias,
      syncErrors,
    );
    await reloadMailListAfterImapChange();
    await restoreThreadSelectionAfterReload({ keepThreadId, mode: "sync" });
    state.syncMessage = buildSyncStatusMessage(results, skippedOnServer, syncErrors, syncAllFolders);
    notifySyncCompletionToasts(options, syncAllFolders, skippedOnServer, syncErrors, results);
    maybeTriggerSemanticReindex(account, results, options);
    render();
    void refreshSavedSearches(true);
    void refreshSuggestedSavedViews();
  } catch (error) {
    console.error("sync_inbox failed", error);
    const message = error instanceof Error ? error.message : String(error);
    state.syncMessage = `Sync échouée: ${message}`;
    toast(state.syncMessage);
    render();
  } finally {
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
}

export { notifyImapWatchFocusedMailbox } from "./syncInboxImapWatch";
export { refreshUiAfterImapPush } from "./syncInboxPushRefreshRun";
