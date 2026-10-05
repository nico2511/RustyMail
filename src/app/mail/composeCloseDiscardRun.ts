import { invoke } from "@tauri-apps/api/core";
import { composeSendAccount } from "../core/composeSendAccount";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { clearDraftSession } from "./composeCloseDraftClearRun";
import { requireComposeCloseFlowDeps } from "./composeCloseFlowContext";
import { forgetSavedDraftLocally } from "./savedDraftListLocalForget";

export async function discardCurrentDraftSession(): Promise<void> {
  if (!isTauriRuntime()) {
    clearDraftSession();
    return;
  }
  const accountId = composeSendAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  const savedId = state.savedDraftRecordId?.trim() ?? "";
  requireComposeCloseFlowDeps().clearDraftRevisionDebounce();
  try {
    if (accountId && savedId) {
      await withTimeout(
        invoke("saved_draft_delete", { accountId, savedDraftId: savedId }),
        MAIL_ACTION_TIMEOUT_MS,
      );
      forgetSavedDraftLocally(savedId);
    } else if (accountId && sessionId) {
      await withTimeout(
        invoke("draft_revision_purge_session", { accountId, sessionId }),
        MAIL_ACTION_TIMEOUT_MS,
      );
    }
  } catch (e) {
    console.error("discardCurrentDraftSession", e);
    toast.error(`Impossible de supprimer le brouillon local : ${tauriErrorMessage(e)}`);
  }
  clearDraftSession();
  await requireComposeCloseFlowDeps().refreshSavedDraftsMailboxCount();
}
