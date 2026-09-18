import type { ThreadListItem } from "../types";

export type BulkTrashListDeps = {
  threadsVisibleInList: () => ThreadListItem[];
  sourceMailboxForThread: (threadId: string) => string;
  loadMailboxUnread: () => Promise<void>;
  loadMailView: (append?: boolean) => Promise<void>;
};

let bulkTrashListDeps: BulkTrashListDeps | null = null;

export function registerBulkTrashListDeps(deps: BulkTrashListDeps): void {
  bulkTrashListDeps = deps;
}

export function requireBulkTrashListDeps(): BulkTrashListDeps {
  if (!bulkTrashListDeps) throw new Error("registerBulkTrashListDeps not called");
  return bulkTrashListDeps;
}
