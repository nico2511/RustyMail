import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { clearStatusBarJob, upsertStatusBarJob } from "./statusBarProgressJobs";
import { requireSearchViewBatchDeps } from "./searchViewBatchContext";

export async function invokeBulkArchiveThreadIds(threadIds: string[]): Promise<{
  moved: number;
  errors: string[];
}> {
  const d = requireSearchViewBatchDeps();
  const account = currentAccount();
  if (!account) return { moved: 0, errors: ["Compte manquant."] };
  let moved = 0;
  const errors: string[] = [];
  const total = threadIds.length;
  upsertStatusBarJob({ id: "bulk-archive", label: "Archivage (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < threadIds.length; i++) {
      const tid = threadIds[i]!;
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
  return { moved, errors };
}
