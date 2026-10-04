import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout, tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import type { DraftRevisionSaveResult } from "../types";
import { draftPayloadForRust } from "./composeDraftPayload";
import {
  draftHasMeaningfulContent,
  draftRevisionContentKey,
  draftSavedContentMatches,
  markComposeDraftEdited,
  rememberDraftContentSaved,
  shouldAutosaveDraftRevision,
} from "./composeDraftContentKey";
import { takePendingDraftRevisionEventKind } from "./composeDraftRevisionEventKind";
import { persistDraft } from "./composePersistDraft";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import { requireComposeDraftLocalSaveDeps } from "./composeDraftLocalSaveContext";
import { syncComposeAttachmentsHiddenField } from "./composeAttachmentPaths";

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

export async function saveDraftRevisionNow(opts?: { force?: boolean }): Promise<boolean> {
  const accountId = currentAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  if (!isTauriRuntime() || !accountId || !sessionId) return false;
  if (!state.draft) return false;
  persistDraft();
  const payload = draftPayloadForRust(state.draft);
  if (!draftHasMeaningfulContent(payload)) return false;
  if (draftSavedContentMatches(sessionId, payload)) {
    rememberDraftContentSaved(sessionId, payload);
    return false;
  }
  if (!opts?.force && !shouldAutosaveDraftRevision(payload, sessionId)) return false;
  const eventKind = takePendingDraftRevisionEventKind();
  try {
    const saved = await withTimeout(
      invoke<DraftRevisionSaveResult>("draft_revision_save", {
        accountId,
        sessionId,
        draft: payload,
        eventKind,
      }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    const staged = saved?.draft;
    if (staged && state.draft) {
      state.draft.attachmentPaths = [...(staged.attachmentPaths ?? [])];
      syncComposeAttachmentsHiddenField(state.draft.attachmentPaths);
    }
    const remembered = staged ? draftPayloadForRust(staged) : payload;
    rememberDraftContentSaved(sessionId, remembered);
    const latest = state.draft ? draftPayloadForRust(state.draft) : remembered;
    if (draftRevisionContentKey(latest) !== draftRevisionContentKey(remembered)) {
      markComposeDraftEdited();
    }
    if (state.composeLayout === "historique") {
      void refreshDraftRevisions(60);
    }
    await upsertSavedDraftSilent();
    return Boolean(saved?.revisionId);
  } catch (error) {
    console.error("draft_revision_save", error);
    toast.error(`Enregistrement local impossible : ${tauriErrorMessage(error)}`);
    return false;
  }
}
