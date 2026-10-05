import { invoke } from "@tauri-apps/api/core";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { composeSendAccount } from "../core/composeSendAccount";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { persistDraft } from "./composePersistDraft";
import { requireComposeDraftLocalSaveDeps } from "./composeDraftLocalSaveContext";
import { saveDraftRevisionNow } from "./composeDraftRevisionSaveRun";

export async function saveDraftToSavedListNow(opts?: { silentToast?: boolean }): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const accountId = composeSendAccount()?.id?.trim();
  if (!accountId || !state.draftSessionId?.trim() || !state.draft) {
    toast.error("Impossible d’enregistrer : session ou compte indisponible.");
    return false;
  }
  persistDraft();
  await saveDraftRevisionNow({ force: true });
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
    if (!opts?.silentToast) {
      toast.success("Enregistré dans « Sauvés ».");
    }
    await requireComposeDraftLocalSaveDeps().refreshSavedDraftsMailboxCount();
    if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
      await requireComposeDraftLocalSaveDeps().loadMailView(false);
    }
    render();
    return true;
  } catch (e) {
    toast.error(tauriErrorMessage(e));
    return false;
  }
}
