import { invoke } from "@tauri-apps/api/core";
import { recordActivity } from "../../activity";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { render } from "../dispatch";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { searchThreads } from "./searchThreadsRun";
import type { FluxAffinerApplyContext } from "./searchFluxAffinerSuggestRun";
import { requireSearchViewBatchDeps, setSearchViewBatchJob } from "./searchViewBatchContext";

export async function runFluxAffinerApplyImapMove(ctx: FluxAffinerApplyContext): Promise<void> {
  const d = requireSearchViewBatchDeps();
  const { accountId, visible, mailbox } = ctx;
  const total = visible.length;
  try {
    setSearchViewBatchJob({ phase: "create", done: 0, total: 1, target: mailbox });
    toast(`Création du dossier « ${mailbox} »…`, 4500);
    await withTimeout(
      invoke<string>("create_imap_mailbox", { accountId, mailbox }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    setSearchViewBatchJob({ phase: "move", done: 0, total, target: mailbox });
    toast(`Déplacement de ${total} fil(s) vers « ${mailbox} »…`, 5000);
    const ids = new Set(visible.map((t) => String(t.id)));
    let moved = 0;
    const errors: string[] = [];
    for (const t of visible) {
      const tid = String(t.id);
      const src = (t.mailbox?.trim() || d.sourceMailboxForThread(tid)).trim() || "INBOX";
      try {
        await withTimeout(
          invoke<string>("move_thread_mailbox", {
            accountId,
            mailbox: src,
            threadId: tid,
            destMailbox: mailbox,
          }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        moved++;
        setSearchViewBatchJob({ phase: "move", done: moved, total, target: mailbox });
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
    }
    setSearchViewBatchJob(null, false);
    if (moved > 0) {
      state.threads = state.threads.filter((row) => !ids.has(String(row.id)));
      if (state.view === "thread" && state.selectedThreadId && ids.has(String(state.selectedThreadId))) {
        state.view = "list";
        state.selectedThread = undefined;
        state.selectedThreadId = undefined;
      }
    }
    if (errors.length && moved === 0) {
      toast(`Déplacement échoué : ${errors[0]}`, 10_000);
    } else if (errors.length) {
      toast(`${moved}/${total} fil(s) déplacé(s) vers « ${mailbox} » · ${errors.length} échec(s).`, 10_000);
    } else {
      toast(`${moved} fil(s) déplacé(s) vers « ${mailbox} ».`, 10_000);
    }
    state.syncMessage = moved > 0 ? `${moved} déplacé(s) → ${mailbox}` : "";
    if (moved > 0) {
      recordActivity({
        eventType: "affiner_applied",
        metaJson: JSON.stringify({ mailbox, moved, total }),
      });
    }
    await d.refreshMailboxesAfterImapChange();
    if (moved > 0) await searchThreads();
    else render();
    if (state.syncMessage) {
      window.setTimeout(() => {
        if (state.syncMessage === `${moved} déplacé(s) → ${mailbox}`) {
          state.syncMessage = "";
          render();
        }
      }, 3500);
    }
  } catch (e) {
    setSearchViewBatchJob(null, false);
    toast(tauriErrorMessage(e), 10_000);
  }
}
