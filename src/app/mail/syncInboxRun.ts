import { invoke } from "@tauri-apps/api/core";

import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { t } from "../../i18n";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { Account } from "../../accountSetup";
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

function buildSyncStatusMessage(
  results: { mailbox?: string; fetchedUids?: number; uidsPruned?: number }[],
  skippedOnServer: string[],
  syncErrors: { mailbox: string; error: string }[],
  syncAllFolders: boolean,
): string {
  const totalFetched = results.reduce((sum, r) => sum + (r.fetchedUids ?? 0), 0);
  const totalPruned = results.reduce((sum, r) => sum + (r.uidsPruned ?? 0), 0);
  const touched = results.map((r) => r.mailbox).filter(Boolean);
  let syncLine = `${totalFetched} importés · ${touched.length} dossier${touched.length === 1 ? "" : "s"}`;
  if (totalPruned > 0) {
    syncLine += ` · ${totalPruned} retiré${totalPruned === 1 ? "" : "s"} (absents serveur)`;
  }
  if (syncAllFolders) {
    syncLine = `Compte synchronisé · ${syncLine}`;
  }
  if (skippedOnServer.length) {
    syncLine += ` · Ignorés (absents sur le serveur) : ${skippedOnServer.join(", ")}`;
  }
  if (syncErrors.length) {
    const shorten = (s: string, n = 140) => (s.length <= n ? s : `${s.slice(0, n)}…`);
    const detail = syncErrors.map((e) => `${e.mailbox}: ${shorten(e.error)}`).join(" · ");
    syncLine += ` · Échec sync (${syncErrors.length}) : ${detail}`;
  }
  return syncLine;
}

function notifySyncCompletionToasts(
  options: SyncInboxOptions | undefined,
  syncAllFolders: boolean,
  skippedOnServer: string[],
  syncErrors: { mailbox: string; error: string }[],
  results: { mailbox?: string }[],
): void {
  const touched = results.map((r) => r.mailbox).filter(Boolean);
  if (!options?.background) {
    const partial = skippedOnServer.length > 0 || syncErrors.length > 0;
    toast(
      partial
        ? syncAllFolders
          ? "Synchronisation du compte terminée (partielle — certains dossiers ignorés ou en erreur)"
          : "Synchronisation IMAP terminée (partielle — dossiers ignorés ou en erreur)"
        : syncAllFolders
          ? `Synchronisation du compte terminée (${touched.length} dossier${touched.length === 1 ? "" : "s"})`
          : "Synchronisation IMAP terminée",
    );
  } else if (skippedOnServer.length > 0 || syncErrors.length > 0) {
    toast("Synchronisation partielle — voir la ligne d’état sous le titre du dossier.");
  }
}

function maybeTriggerSemanticReindex(
  account: Account,
  results: { mailbox?: string; fetchedUids?: number }[],
  options: SyncInboxOptions | undefined,
): void {
  const totalFetched = results.reduce((sum, r) => sum + (r.fetchedUids ?? 0), 0);
  const touched = results.map((r) => r.mailbox).filter(Boolean);
  if (
    state.appPrefs.ai.aiBackgroundAutoSemanticIndex &&
    state.semanticModelAvailable &&
    totalFetched > 0
  ) {
    const uniqueTouched = Array.from(new Set(touched.map((m) => String(m).trim()).filter(Boolean)));
    void invoke("reindex_semantic_missing_cmd", {
      payload: { accountId: account.id },
    }).catch(() => {});
    if (uniqueTouched.length > 1 && !options?.background) {
      toast(t("toast.semanticIndexing"));
    }
  }
}

export { notifyImapWatchFocusedMailbox } from "./syncInboxImapWatch";
export { refreshUiAfterImapPush } from "./syncInboxPushRefreshRun";
