import { invoke } from "@tauri-apps/api/core";

import {
  SYNC_MAILBOXES_BATCH_SIZE,
  chunkStringList,
  mergeSyncMailboxesOutcomes,
  type SyncMailboxesOutcome,
} from "../../imapSyncTypes";
import { isSavedDraftsVirtualMailbox, pickSystemMailboxes } from "../../mailboxKinds";
import { escapeHtml } from "../../ui/sanitize";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { Account } from "../../accountSetup";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { scheduleStatusBarProgressPaint } from "./statusBarProgressJobs";
import { syncInvokeTimeoutMs } from "./syncImapAccountContext";

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

export async function runBatchedImapSync(
  account: Account,
  targets: string[],
  mailbox: string,
  syncAllFolders: boolean,
): Promise<SyncMailboxesOutcome> {
  const batches = chunkStringList(targets, SYNC_MAILBOXES_BATCH_SIZE);
  let outcome: SyncMailboxesOutcome = {
    results: [],
    skippedNotOnServer: [],
    syncedMailboxAliases: [],
    syncErrors: [],
  };
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]!;
    state.syncProgressBatch = { current: bi + 1, total: batches.length };
    const batchLabel =
      batches.length > 1 ?
        `Sync… ${bi + 1}/${batches.length} · ${batch.length} dossier${batch.length === 1 ? "" : "s"} (${targets.length} au total)`
      : syncAllFolders ?
        `Sync… ${targets.length} dossier${targets.length === 1 ? "" : "s"}`
      : `Sync… ${escapeHtml(batch.join(", "))}`;
    state.syncMessage = batchLabel;
    scheduleStatusBarProgressPaint();
    render();
    const focus =
      batch.includes(mailbox) ? mailbox
      : batch.includes("INBOX") ? "INBOX"
      : batch[0];
    const part = await withTimeout(
      invoke<SyncMailboxesOutcome>("sync_mailboxes", {
        accountId: account.id,
        mailboxes: batch,
        focusMailbox: focus,
        limitPerMailbox: 80,
      }),
      syncInvokeTimeoutMs(batch.length),
    );
    outcome = mergeSyncMailboxesOutcomes(outcome, part);
  }
  return outcome;
}

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
