import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshSavedSearches, refreshSuggestedSavedViews } from "./savedSearchViews";
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
  beginSyncInboxProgress,
  finishSyncInboxProgress,
  prepareSyncInboxOrNotify,
} from "./syncInboxPrepareRun";
import {
  buildSyncStatusMessage,
  maybeTriggerSemanticReindex,
  notifySyncCompletionToasts,
} from "./syncInboxStatusRun";

export type { SyncInboxOptions } from "./syncInboxBatchRun";

export async function syncInbox(options?: SyncInboxOptions): Promise<void> {
  const prepared = prepareSyncInboxOrNotify(options);
  if (!prepared) return;
  const { account, mailbox, syncAllFolders, keepThreadId } = prepared;
  beginSyncInboxProgress(account, mailbox, syncAllFolders);

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
    finishSyncInboxProgress(options);
  }
}

export { notifyImapWatchFocusedMailbox } from "./syncInboxImapWatch";
export { refreshUiAfterImapPush } from "./syncInboxPushRefreshRun";
