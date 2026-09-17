import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS, MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { navCanGoBack } from "../../navigation";
import { render } from "../dispatch";
import { state } from "../state";
import { goBack } from "./appNavActions";

export type ComposeCloseFlowDeps = {
  persistDraft: () => void;
  flushDraftRevisionPending: () => Promise<void>;
  composeDraftHasMeaningfulContent: () => boolean;
  clearDraftRevisionDebounce: () => void;
  refreshSavedDraftsMailboxCount: () => void | Promise<void>;
  threadReadingIsSimpleLayout: () => boolean;
};

let composeCloseFlowDeps: ComposeCloseFlowDeps | null = null;

export function registerComposeCloseFlowDeps(deps: ComposeCloseFlowDeps): void {
  composeCloseFlowDeps = deps;
}

function closeDeps(): ComposeCloseFlowDeps {
  if (!composeCloseFlowDeps) throw new Error("registerComposeCloseFlowDeps not called");
  return composeCloseFlowDeps;
}

export function clearDraftSession(): void {
  const d = closeDeps();
  state.draftSessionId = null;
  state.savedDraftRecordId = null;
  state.draftRevisionsLoading = false;
  state.draftRevisions = [];
  state.draftDiffRevisionId = null;
  state.draftDiffLoading = false;
  state.draftDiffLines = [];
  state.draftDiffView = "preview";
  state.draftDiffOtherBody = "";
  state.draftRevisionPreview = null;
  state.draftVersionsListExpanded = false;
  d.clearDraftRevisionDebounce();
}

export async function leaveComposeViewAfterClose(): Promise<void> {
  const d = closeDeps();
  if (navCanGoBack()) {
    await goBack();
    return;
  }
  state.view = state.selectedThread ? "thread" : "list";
  if (state.view === "thread" && state.selectedThread && d.threadReadingIsSimpleLayout()) {
    state.aiOpen = true;
  }
  render();
}

export async function discardCurrentDraftSession(): Promise<void> {
  if (!isTauriRuntime()) {
    clearDraftSession();
    return;
  }
  const accountId = currentAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  const savedId = state.savedDraftRecordId?.trim() ?? "";
  closeDeps().clearDraftRevisionDebounce();
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
  void closeDeps().refreshSavedDraftsMailboxCount();
}

export async function finalizeCloseComposeFromUser(): Promise<void> {
  const d = closeDeps();
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
