import { recordActivity } from "../../activity";
import {
  clearThreadsRecentlyRemoved,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import { SAVED_VIEW_BATCH_MAX } from "../lib/savedViewBatch";
import { searchThreads } from "./searchThreadsRun";
import { requireSearchViewBulkPreflight } from "./searchViewBulkPreflightRun";
import { invokeBulkArchiveThreadIds } from "./searchViewBulkArchiveInvokeRun";

export async function bulkArchiveSearchViewThreads(): Promise<void> {
  const pre = requireSearchViewBulkPreflight({
    blockSavedDraftsMailbox: true,
    tauriRequiredLabel: "Archivage",
    imapOnlyLabel: "Archivage",
  });
  if (!pre) return;
  const { visible } = pre;
  const ok = await openConfirmModal({
    title: "Archiver le lot ?",
    body: `Archiver jusqu’à ${visible.length} conversation(s) (plafond ${SAVED_VIEW_BATCH_MAX}).`,
    confirmLabel: "Archiver",
  });
  if (!ok) return;
  recordActivity({
    eventType: "bulk_archive",
    metaJson: JSON.stringify({ count: visible.length }),
  });
  const prevThreads = state.threads;
  const ids = new Set(visible.map((t) => String(t.id)));
  markThreadsRecentlyRemoved(ids);
  state.threads = state.threads.filter((t) => !ids.has(String(t.id)));
  if (state.view === "thread" && state.selectedThreadId && ids.has(String(state.selectedThreadId))) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  render();
  const idList = [...ids];
  const { errors } = await invokeBulkArchiveThreadIds(idList);
  if (errors.length) {
    clearThreadsRecentlyRemoved(ids);
    state.threads = prevThreads;
    toast(`Archivage partiel : ${errors[0]}`);
    render();
    return;
  }
  toast(`${idList.length} conversation(s) archivée(s).`);
  await searchThreads();
}
