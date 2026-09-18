import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { confirmMoveDialog, onThreadMove, openMoveDialog } from "./threadListActions";
import { openThread } from "./openThreadView";

export async function tryHandleListThreadMoveActionsWire(action: string): Promise<boolean> {
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
