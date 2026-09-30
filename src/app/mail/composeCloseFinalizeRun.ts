import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { state } from "../state";
import { draftCloseNeedsSavePrompt, draftSavedContentMatches } from "./composeDraftContentKey";
import { draftPayloadForRust } from "./composeDraftPayload";
import { clearDraftSession } from "./composeCloseDraftClearRun";
import { leaveComposeViewAfterClose } from "./composeCloseNavigateRun";
import { requireComposeCloseFlowDeps } from "./composeCloseFlowContext";

export async function finalizeCloseComposeFromUser(): Promise<void> {
  const d = requireComposeCloseFlowDeps();
  d.persistDraft();
  const sessionId = state.draftSessionId?.trim() ?? "";
  const draft = state.draft;
  const payload = draft ? draftPayloadForRust(draft) : null;
  const needsPrompt = Boolean(
    isTauriRuntime() &&
      currentAccount()?.id?.trim() &&
      sessionId &&
      payload &&
      draftCloseNeedsSavePrompt(payload, sessionId),
  );
  d.clearDraftRevisionDebounce();
  if (needsPrompt && state.draft) {
    state.closeComposeModal = {
      subject: state.draft.subject ?? "",
      hasSavedRecord: Boolean(state.savedDraftRecordId),
    };
    render();
    return;
  }
  const hasSnapshot = Boolean(payload && sessionId && draftSavedContentMatches(sessionId, payload));
  if (isTauriRuntime() && sessionId && !state.savedDraftRecordId && !hasSnapshot) {
    const accountId = currentAccount()?.id?.trim() ?? "";
    if (accountId && sessionId) {
      void invoke("draft_revision_purge_session", { accountId, sessionId }).catch(() => {});
    }
  }
  state.closeComposeModal = null;
  clearDraftSession();
  await leaveComposeViewAfterClose();
}
