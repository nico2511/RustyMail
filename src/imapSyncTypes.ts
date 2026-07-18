/** Types et helpers purs pour sync IMAP multi-dossiers. */

export type ImapSyncResult = {
  mailbox: string;
  messageCount: number;
  threadCount: number;
  fetchedUids: number;
  /** Serveur a changé UIDVALIDITY : cache IMAP du dossier purgé et resync depuis le début. */
  uidValidityReset?: boolean;
  /** Messages locaux dont le flag \\Seen a été recalé sur la fenêtre récente. */
  flagsReconciled?: number;
  /** UIDs locaux absents du serveur (MOVE/delete) — retirés du cache SQLite. */
  uidsPruned?: number;
};

export type SyncMailboxAlias = {
  requested: string;
  syncedAs: string;
};

export type MailboxSyncError = {
  mailbox: string;
  error: string;
};

export type SyncMailboxesOutcome = {
  results: ImapSyncResult[];
  skippedNotOnServer?: string[];
  syncedMailboxAliases?: SyncMailboxAlias[];
  syncErrors?: MailboxSyncError[];
};

/** Aligné sur `ipc_guard::MAX_SYNC_MAILBOXES` (Tauri). */
export const SYNC_MAILBOXES_BATCH_SIZE = 64;

export function chunkStringList(items: string[], batchSize: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    out.push(items.slice(i, i + batchSize));
  }
  return out;
}

export function mergeSyncMailboxesOutcomes(
  a: SyncMailboxesOutcome,
  b: SyncMailboxesOutcome,
): SyncMailboxesOutcome {
  return {
    results: [...(a.results ?? []), ...(b.results ?? [])],
    skippedNotOnServer: Array.from(
      new Set([...(a.skippedNotOnServer ?? []), ...(b.skippedNotOnServer ?? [])]),
    ),
    syncedMailboxAliases: [...(a.syncedMailboxAliases ?? []), ...(b.syncedMailboxAliases ?? [])],
    syncErrors: [...(a.syncErrors ?? []), ...(b.syncErrors ?? [])],
  };
}

export function syncInvokeTimeoutMs(
  mailboxCount: number,
  baseTimeoutMs: number,
): number {
  return Math.min(600_000, Math.max(baseTimeoutMs, 45_000 + mailboxCount * 2_500));
}
