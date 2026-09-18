import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { openConfirmModal } from "../modals/promptConfirm";
import { loadMailView } from "./mailListView";
import { refreshSavedDraftsMailboxCount, saveDraftToSavedListNow } from "./accountWireActions";

export async function tryHandleListThreadSavedDraftWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
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
