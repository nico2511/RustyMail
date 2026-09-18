import { invoke } from "@tauri-apps/api/core";
import type { ThreadListItem } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { openConfirmModal } from "../modals/promptConfirm";
import { loadMailView } from "./mailListView";
import { mailboxManageAction } from "./mailboxManageAction";
import {
  confirmMoveDialog,
  onThreadMove,
  onThreadSeen,
  onThreadToggleFollow,
  openMoveDialog,
} from "./threadListActions";
import { openThread } from "./openThreadView";
import { refreshSavedDraftsMailboxCount, saveDraftToSavedListNow } from "./accountWireActions";

export async function tryHandleListThreadWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "quick-reply-copy": {
      const idx = Number(element?.dataset.qrIndex ?? "");
      const s = state.quickReplySuggestions[idx];
      const t = s?.text?.trim();
      if (!t) return true;
      void navigator.clipboard.writeText(t).then(
        () => toast("Copié dans le presse-papiers."),
        () => toast("Copie impossible (permission navigateur).")
      );
      return true;
    }
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
    case "open-mailbox-manage":
      state.mailboxManageOpen = true;
      render();
      return true;
    case "close-mailbox-manage":
      state.mailboxManageOpen = false;
      render();
      return true;
    case "mb-create":
      await mailboxManageAction("create");
      return true;
    case "mb-rename":
      await mailboxManageAction("rename");
      return true;
    case "mb-delete":
      await mailboxManageAction("delete");
      return true;
    case "mb-subscribe":
      await mailboxManageAction("subscribe");
      return true;
    case "save-saved-draft": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrer dans la liste : lancez l’app Tauri.");
          return;
        }
        if (!state.draft) {
          toast("Aucun contenu à enregistrer.");
          return;
        }
        await saveDraftToSavedListNow();
      })();
      return true;
    }
    case "delete-saved-draft": {
      const sid = element?.dataset.savedDraftId?.trim() ?? "";
      if (!sid) return true;
      void (async () => {
        if (!isTauriRuntime()) return;
        const ok = await openConfirmModal({
          title: "Retirer ce brouillon ?",
          body: "Retirer ce brouillon de la liste enregistrée ? L’historique local des versions pour ce brouillon sera supprimé. Aucun mail IMAP n’est affecté.",
          danger: true,
          confirmLabel: "Retirer",
        });
        if (!ok) return;
        const accountId = currentAccount()?.id?.trim();
        if (!accountId) {
          toast("Aucun compte actif.");
          return;
        }
        try {
          await withTimeout(invoke("saved_draft_delete", { accountId, savedDraftId: sid }), MAIL_ACTION_TIMEOUT_MS);
          toast("Brouillon retiré de la liste.");
          await loadMailView(false);
          await refreshSavedDraftsMailboxCount();
          state.selectedThreadId = state.threads[0]?.id;
          state.selectedThread = undefined;
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
          render();
        }
      })();
      return true;
    }
    default:
      return false;
  }
}
