export type SyncInboxOptions = {
  background?: boolean;
  allMailboxes?: boolean;
};

export type SyncInboxActionDeps = {
  syncInbox: (options?: SyncInboxOptions) => Promise<void>;
};

let syncInboxActionDeps: SyncInboxActionDeps | null = null;

export function registerSyncInboxActionDeps(deps: SyncInboxActionDeps): void {
  syncInboxActionDeps = deps;
}

function syncDeps(): SyncInboxActionDeps {
  if (!syncInboxActionDeps) throw new Error("registerSyncInboxActionDeps not called");
  return syncInboxActionDeps;
}

export function syncInbox(options?: SyncInboxOptions): Promise<void> {
  return syncDeps().syncInbox(options);
}
