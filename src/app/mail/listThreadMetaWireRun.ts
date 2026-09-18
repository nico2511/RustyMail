import { invoke } from "@tauri-apps/api/core";
import type { ThreadListItem } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { state } from "../state";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { onThreadSeen, onThreadToggleFollow } from "./threadListActions";
import { openThread } from "./openThreadView";

export async function tryHandleListThreadMetaWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "retag-thread": {
      const tid = element?.dataset.threadId?.trim() || state.selectedThreadId?.trim() || "";
      const accountId = state.selectedAccountId?.trim() || "";
      if (!tid || !accountId) return true;
      if (!isTauriRuntime()) {
        toast("Recalcul des tags : disponible dans l’app Tauri.");
        return true;
      }
      void (async () => {
        try {
          const n = await withTimeout(
            invoke<number>("org_retag_threads_cmd", {
              payload: { accountId, threadIds: [tid] },
            }),
            MAIL_ACTION_TIMEOUT_MS,
          );
          toast(n > 0 ? "Tags mis à jour." : "Tags déjà à jour.");
          await openThread(tid, { skipHistory: true, preserveAi: true });
        } catch (err) {
          console.error("org_retag_threads_cmd", err);
          toast(tauriErrorMessage(err));
        }
      })();
      return true;
    }
    case "toggle-thread-seen": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      if (!tid) return true;
      const row = state.threads.find((t: ThreadListItem) => String(t.id) === tid);
      void onThreadSeen(row?.unread ? "read" : "unread", tid);
      return true;
    }
    case "toggle-thread-follow": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      if (!tid) return true;
      void onThreadToggleFollow(tid);
      return true;
    }
    case "toggle-thread-seen-cur": {
      const tid = state.selectedThreadId;
      if (!tid) return true;
      const row = state.threads.find((t: ThreadListItem) => String(t.id) === tid);
      const unreadNow = Boolean(row?.unread ?? state.selectedThread?.unread);
      void onThreadSeen(unreadNow ? "read" : "unread", tid);
      return true;
    }
    default:
      return false;
  }
}
