import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { requireBulkTrashListDeps } from "./bulkTrashListDepsRun";
import { invokeBulkTrashThreadIds } from "./bulkTrashListInvokeRun";
import { confirmBulkTrashVisibleThreadIds } from "./bulkTrashListPreflightRun";
import { applyBulkTrashOptimistic, rollbackBulkTrashOptimistic } from "./bulkTrashListOptimisticRun";
import { currentAccount } from "../core/accountContext";
import { removeThreadFromFolderListCache } from "./mailListFolderCache";
import { invalidateFolderListCacheAfterTrashArchive } from "./mailListFolderCacheBridge";

export async function bulkTrashVisibleThreads(): Promise<void> {
  const ids = await confirmBulkTrashVisibleThreadIds();
  if (!ids?.length) return;

  const snap = applyBulkTrashOptimistic(ids);
  const { moved, errors } = await invokeBulkTrashThreadIds(ids);

  if (errors.length) {
    rollbackBulkTrashOptimistic(snap, ids);
    toast.error(`Échec corbeille (lot) : ${errors[0]}${errors.length > 1 ? "…" : ""}`);
    return;
  }

  toast.success(`${moved} conversation${moved === 1 ? "" : "s"} déplacée${moved === 1 ? "" : "s"} dans la corbeille.`);
  const account = currentAccount();
  if (account?.id) {
    for (const tid of ids) {
      const mailbox = requireBulkTrashListDeps().sourceMailboxForThread(tid);
      removeThreadFromFolderListCache(account.id, tid);
      invalidateFolderListCacheAfterTrashArchive({
        accountId: account.id,
        sourceMailbox: mailbox,
        threadId: tid,
        kind: "trash",
      });
    }
  }
  const d = requireBulkTrashListDeps();
  void d.loadMailboxUnread();
  await d.loadMailView(false);
  render();
}
