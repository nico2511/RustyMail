import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { requireBulkTrashListDeps } from "./bulkTrashListDepsRun";
import { invokeBulkTrashThreadIds } from "./bulkTrashListInvokeRun";
import { confirmBulkTrashVisibleThreadIds } from "./bulkTrashListPreflightRun";
import { applyBulkTrashOptimistic, rollbackBulkTrashOptimistic } from "./bulkTrashListOptimisticRun";

export async function bulkTrashVisibleThreads(): Promise<void> {
  const ids = await confirmBulkTrashVisibleThreadIds();
  if (!ids?.length) return;

  const snap = applyBulkTrashOptimistic(ids);
  const { moved, errors } = await invokeBulkTrashThreadIds(ids);

  if (errors.length) {
    rollbackBulkTrashOptimistic(snap, ids);
    toast(`Échec corbeille (lot) : ${errors[0]}${errors.length > 1 ? "…" : ""}`);
    return;
  }

  toast(`${moved} conversation${moved === 1 ? "" : "s"} déplacée${moved === 1 ? "" : "s"} dans la corbeille.`);
  const d = requireBulkTrashListDeps();
  void d.loadMailboxUnread();
  await d.loadMailView(false);
  render();
}
