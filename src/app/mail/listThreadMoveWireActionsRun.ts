import { invoke } from "@tauri-apps/api/core";
import type { ThreadListItem } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import {
  confirmMoveDialog,
  onThreadMove,
  onThreadSeen,
  onThreadToggleFollow,
  openMoveDialog,
} from "./threadListActions";
import { openThread } from "./openThreadView";

export async function tryHandleListThreadMoveWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "thread-trash-cur":
      if (state.selectedThreadId) void onThreadMove("trash", state.selectedThreadId);
      return true;
    case "thread-archive-cur":
      if (state.selectedThreadId) void onThreadMove("archive", state.selectedThreadId);
      return true;
    case "thread-unarchive-cur": {
      const tid = state.selectedThreadId?.trim();
      const acc = currentAccount();
      if (!tid || !acc?.id) return true;
      if (!isTauriRuntime()) {
        toast("Désarchivage : disponible dans l’app Tauri.");
        return true;
      }
      void (async () => {
        try {
          const { moveThreadUnarchive } = await import("../../organizationView");
          const out = (await withTimeout(moveThreadUnarchive(acc.id, tid), MAIL_ACTION_TIMEOUT_MS)) as {
            message?: string;
          };
          toast(out.message || "Désarchivé vers Inbox.");
          await openThread(tid, { skipHistory: true, preserveAi: true });
          render();
        } catch (err) {
          toast(tauriErrorMessage(err));
        }
      })();
      return true;
    }
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
            MAIL_ACTION_TIMEOUT_MS
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
    case "thread-move-cur":
      if (state.selectedThreadId) openMoveDialog(state.selectedThreadId);
      return true;
    case "close-move":
      state.moveOpen = false;
      state.moveThreadId = undefined;
      render();
      return true;
    case "confirm-move":
      await confirmMoveDialog();
      return true;
    default:
      return false;
  }
}
