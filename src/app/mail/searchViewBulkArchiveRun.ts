import { invoke } from "@tauri-apps/api/core";
import { recordActivity } from "../../activity";
import {
  clearThreadsRecentlyRemoved,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import { SAVED_VIEW_BATCH_MAX } from "../lib/savedViewBatch";
import { isSearchActive } from "./searchQueryContext";
import { searchThreads } from "./searchThreadsRun";
import { clearStatusBarJob, upsertStatusBarJob } from "./statusBarProgressJobs";
import { requireSearchViewBatchDeps, searchViewBatchThreads } from "./searchViewBatchContext";

export async function bulkArchiveSearchViewThreads(): Promise<void> {
  const d = requireSearchViewBatchDeps();
  if (!isTauriRuntime()) {
    toast("Archivage : IMAP requiert l’app Tauri.");
    return;
  }
  if (!isSearchActive() && !state.activeSavedSearchId) {
    toast("Actions lot : ouvrez une recherche ou une vue enregistrée.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Archivage : actions IMAP uniquement.");
    return;
  }
  const visible = searchViewBatchThreads();
  if (!visible.length) {
    toast("Aucune conversation dans cette vue.");
    return;
  }
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
  let moved = 0;
  const errors: string[] = [];
  const idList = [...ids];
  const total = idList.length;
  upsertStatusBarJob({ id: "bulk-archive", label: "Archivage (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < idList.length; i++) {
      const tid = idList[i]!;
      try {
        const mailbox = d.sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("move_thread_archive", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        moved++;
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
      upsertStatusBarJob({ id: "bulk-archive", label: "Archivage (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-archive");
  }
  if (errors.length) {
    clearThreadsRecentlyRemoved(ids);
    state.threads = prevThreads;
    toast(`Archivage partiel : ${errors[0]}`);
    render();
    return;
  }
  toast(`${moved} conversation(s) archivée(s).`);
  await searchThreads();
}
