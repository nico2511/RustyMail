import { recordActivity } from "../../activity";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { SAVED_VIEW_BATCH_MAX } from "../lib/savedViewBatch";
import { requireSearchViewBulkPreflight } from "./searchViewBulkPreflightRun";
import { invokeBulkMarkReadSearchViewThreads } from "./searchViewBulkMarkReadInvokeRun";

export async function bulkMarkReadSearchViewThreads(): Promise<void> {
  const pre = requireSearchViewBulkPreflight({ tauriRequiredLabel: "Marquer lus" });
  if (!pre) return;
  const { account, visible } = pre;
  const ok = await openConfirmModal({
    title: "Marquer comme lus ?",
    body: `Marquer comme lus jusqu’à ${visible.length} conversation(s) affichée(s) (plafond ${SAVED_VIEW_BATCH_MAX}).`,
    confirmLabel: "Marquer lus",
  });
  if (!ok) return;
  recordActivity({
    eventType: "bulk_mark_read",
    metaJson: JSON.stringify({ count: visible.length }),
  });
  const unreadTargets = visible.filter((t) => t.unread);
  const { done, errors } = await invokeBulkMarkReadSearchViewThreads(account.id, unreadTargets);
  if (errors.length) toast(`Marquage partiel : ${errors[0]}`);
  else toast(done ? `${done} conversation(s) marquée(s) lue(s).` : "Aucun fil non lu dans la sélection.");
  render();
}
