import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { clearDraftSession } from "./composeCloseDraftClearRun";
import { requireComposeCloseFlowDeps } from "./composeCloseFlowContext";

export async function discardCurrentDraftSession(): Promise<void> {
  if (!isTauriRuntime()) {
    clearDraftSession();
    return;
  }
  const accountId = currentAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  const savedId = state.savedDraftRecordId?.trim() ?? "";
  requireComposeCloseFlowDeps().clearDraftRevisionDebounce();
  try {
    if (accountId && savedId) {
      await withTimeout(
        invoke("saved_draft_delete", { accountId, savedDraftId: savedId }),
        MAIL_ACTION_TIMEOUT_MS,
      );
    } else if (accountId && sessionId) {
      await withTimeout(
        invoke("draft_revision_purge_session", { accountId, sessionId }),
        MAIL_ACTION_TIMEOUT_MS,
      );
    }
  } catch (e) {
    console.error("discardCurrentDraftSession", e);
    toast(`Impossible de supprimer le brouillon local : ${tauriErrorMessage(e)}`);
  }
  clearDraftSession();
  void requireComposeCloseFlowDeps().refreshSavedDraftsMailboxCount();
}
