import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { state } from "../state";
import { clearDraftSession } from "./composeCloseDraftClearRun";
import { leaveComposeViewAfterClose } from "./composeCloseNavigateRun";
import { requireComposeCloseFlowDeps } from "./composeCloseFlowContext";

export async function finalizeCloseComposeFromUser(): Promise<void> {
  const d = requireComposeCloseFlowDeps();
  d.persistDraft();
  await d.flushDraftRevisionPending();
  if (
    isTauriRuntime() &&
    currentAccount()?.id?.trim() &&
    state.draftSessionId &&
    state.draft &&
    d.composeDraftHasMeaningfulContent()
  ) {
    state.closeComposeModal = {
      subject: state.draft.subject ?? "",
      hasSavedRecord: Boolean(state.savedDraftRecordId),
    };
    render();
    return;
  }
  if (isTauriRuntime() && state.draftSessionId && !state.savedDraftRecordId) {
    const accountId = currentAccount()?.id?.trim() ?? "";
    const sessionId = state.draftSessionId.trim();
    if (accountId && sessionId) {
      void invoke("draft_revision_purge_session", { accountId, sessionId }).catch(() => {});
    }
  }
  state.closeComposeModal = null;
  clearDraftSession();
  await leaveComposeViewAfterClose();
}
