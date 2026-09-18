import { invoke } from "@tauri-apps/api/core";
import { recordActivity } from "../../activity";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { SAVED_VIEW_BATCH_MAX } from "../lib/savedViewBatch";
import { isSearchActive } from "./searchQueryContext";
import { clearStatusBarJob, upsertStatusBarJob } from "./statusBarProgressJobs";
import { requireSearchViewBatchDeps, searchViewBatchThreads } from "./searchViewBatchContext";
import { state } from "../state";

export async function bulkMarkReadSearchViewThreads(): Promise<void> {
  const d = requireSearchViewBatchDeps();
  if (!isTauriRuntime()) {
    toast("Marquer lus : IMAP requiert l’app Tauri.");
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
  const visible = searchViewBatchThreads();
  if (!visible.length) {
    toast("Aucune conversation dans cette vue.");
    return;
  }
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
  let done = 0;
  const errors: string[] = [];
  const total = unreadTargets.length;
  if (total > 0) upsertStatusBarJob({ id: "bulk-mark-read", label: "Marquage lu (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < unreadTargets.length; i++) {
      const t = unreadTargets[i]!;
      const tid = String(t.id);
      try {
        const mailbox = d.sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("thread_mark_read", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        t.unread = false;
        done++;
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
      upsertStatusBarJob({ id: "bulk-mark-read", label: "Marquage lu (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-mark-read");
  }
  if (errors.length) toast(`Marquage partiel : ${errors[0]}`);
  else toast(done ? `${done} conversation(s) marquée(s) lue(s).` : "Aucun fil non lu dans la sélection.");
  render();
}
