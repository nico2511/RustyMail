export type { SyncInboxOptions } from "./syncInboxTargetsRun";
export { resolveImapSyncTargets } from "./syncInboxTargetsRun";
export { runBatchedImapSync } from "./syncInboxBatchInvokeRun";
export {
  refreshMailboxListAfterSyncIfNeeded,
  applySyncedMailboxAliases,
} from "./syncInboxPostSyncRun";
