import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { clearStatusBarJob, upsertStatusBarJob } from "./statusBarProgressJobs";
import { requireBulkTrashListDeps } from "./bulkTrashListDepsRun";

export async function invokeBulkTrashThreadIds(ids: string[]): Promise<{ moved: number; errors: string[] }> {
  const account = currentAccount();
  if (!account?.id) return { moved: 0, errors: ["no account"] };
  const d = requireBulkTrashListDeps();
  let moved = 0;
  const errors: string[] = [];
  const total = ids.length;
  upsertStatusBarJob({ id: "bulk-trash", label: "Corbeille (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < ids.length; i++) {
      const tid = ids[i]!;
      try {
        const mailbox = d.sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("move_thread_trash", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        moved++;
      } catch (err) {
        errors.push(`${tid}: ${tauriErrorMessage(err)}`);
      }
      upsertStatusBarJob({ id: "bulk-trash", label: "Corbeille (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-trash");
  }
  return { moved, errors };
}
