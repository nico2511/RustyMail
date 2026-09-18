import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout, tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { draftPayloadForRust } from "./composeDraftPayload";
import { composeDraftHasMeaningfulContent } from "./composeDraftSession";
import { persistDraft } from "./composePersistDraft";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import { requireComposeDraftLocalSaveDeps } from "./composeDraftLocalSaveContext";

export async function upsertSavedDraftSilent(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !state.draftSessionId?.trim() || !state.draft) return false;
  const titleRaw = state.draft.subject?.trim() ?? "";
  const title = titleRaw.length ? titleRaw : "Sans objet";
  try {
    const newId = await withTimeout(
      invoke<string>("saved_draft_upsert", {
        accountId,
        sessionId: state.draftSessionId.trim(),
        title,
      }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    const tid = newId.trim();
    if (tid.length) state.savedDraftRecordId = tid;
    void requireComposeDraftLocalSaveDeps().refreshSavedDraftsMailboxCount();
    return true;
  } catch (e) {
    console.error("saved_draft_upsert (silent)", e);
    return false;
  }
}

export async function saveDraftRevisionNow(): Promise<boolean> {
  const accountId = currentAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  if (!isTauriRuntime() || !accountId || !sessionId) return false;
  if (!state.draft) return false;
  persistDraft();
  try {
    await withTimeout(
      invoke("draft_revision_save", {
        accountId,
        sessionId,
        draft: draftPayloadForRust(state.draft),
      }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    if (state.composeLayout === "historique") {
      void refreshDraftRevisions(60);
    }
    if (composeDraftHasMeaningfulContent()) {
      await upsertSavedDraftSilent();
    }
    return true;
  } catch (error) {
    console.error("draft_revision_save", error);
    toast(`Enregistrement local impossible : ${tauriErrorMessage(error)}`);
    return false;
  }
}
