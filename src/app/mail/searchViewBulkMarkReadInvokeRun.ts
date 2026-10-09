import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import type { ThreadListItem } from "../types";
import { clearStatusBarJob, upsertStatusBarJob } from "./statusBarProgressJobs";
import { requireSearchViewBatchDeps } from "./searchViewBatchContext";

export async function invokeBulkMarkReadSearchViewThreads(
  accountId: string,
  unreadTargets: ThreadListItem[],
): Promise<{ done: number; errors: string[] }> {
  const d = requireSearchViewBatchDeps();
  if (unreadTargets.length > 0) {
    upsertStatusBarJob({ id: "bulk-mark-read", label: "Marquage lu (lot)", done: 0, total: 0 }, true);
  }
  try {
    const items = unreadTargets.map((thread) => ({
      mailbox: d.sourceMailboxForThread(String(thread.id)),
      threadId: String(thread.id),
    }));
    const outcome = await withTimeout(
      invoke<{ done: number; errors: string[] }>("threads_mark_read_bulk", {
        accountId,
        items,
        seen: true,
      }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    if (outcome.errors.length === 0) {
      for (const thread of unreadTargets) thread.unread = false;
    }
    return outcome;
  } catch (err) {
    return { done: 0, errors: [tauriErrorMessage(err)] };
  } finally {
    clearStatusBarJob("bulk-mark-read");
  }
}
