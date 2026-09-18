import { invoke } from "@tauri-apps/api/core";

import {
  SYNC_MAILBOXES_BATCH_SIZE,
  chunkStringList,
  mergeSyncMailboxesOutcomes,
  type SyncMailboxesOutcome,
} from "../../imapSyncTypes";
import { escapeHtml } from "../../ui/sanitize";
import { withTimeout } from "../lib/tauriCommand";
import { render } from "../dispatch";
import { state } from "../state";
import type { Account } from "../../accountSetup";
import { scheduleStatusBarProgressPaint } from "./statusBarProgressJobs";
import { syncInvokeTimeoutMs } from "./syncImapAccountContext";

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
