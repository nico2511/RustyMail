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
          invoke<string>("thread_mark_read", { accountId, mailbox, threadId: tid }),
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
  return { done, errors };
}
