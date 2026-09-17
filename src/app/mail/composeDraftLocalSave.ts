import { invoke } from "@tauri-apps/api/core";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import type { OrphanDraftSessionItem } from "../types";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS, MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { draftPayloadForRust } from "./composeDraftPayload";
import { composeDraftHasMeaningfulContent } from "./composeDraftSession";
import { persistDraft } from "./composePersistDraft";
import { refreshDraftRevisions } from "./composeDraftRevisions";

export type ComposeDraftLocalSaveDeps = {
  refreshSavedDraftsMailboxCount: () => void | Promise<void>;
  loadMailView: (append: boolean) => Promise<void>;
};

let localSaveDeps: ComposeDraftLocalSaveDeps | null = null;

export function registerComposeDraftLocalSaveDeps(deps: ComposeDraftLocalSaveDeps): void {
  localSaveDeps = deps;
}

function deps(): ComposeDraftLocalSaveDeps {
  if (!localSaveDeps) throw new Error("registerComposeDraftLocalSaveDeps not called");
  return localSaveDeps;
}

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
    void deps().refreshSavedDraftsMailboxCount();
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

export async function saveDraftToSavedListNow(opts?: { silentToast?: boolean }): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !state.draftSessionId?.trim() || !state.draft) {
    toast("Impossible d’enregistrer : session ou compte indisponible.");
    return false;
  }
  persistDraft();
  await saveDraftRevisionNow();
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
      toast("Enregistré dans « Sauvés ».");
    }
    await deps().refreshSavedDraftsMailboxCount();
    if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
      await deps().loadMailView(false);
    }
    render();
    return true;
  } catch (e) {
    toast(tauriErrorMessage(e));
    return false;
  }
}

export async function checkOrphanDraftSessionsOnBoot(): Promise<void> {
  if (!isTauriRuntime()) return;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  try {
    const sessions = await withTimeout(
      invoke<OrphanDraftSessionItem[]>("draft_orphan_sessions_list", { accountId, limit: 10 }),
      BOOT_INVOKE_TIMEOUT_MS,
    );
    if (sessions?.length) {
      state.resumeDraftModal = { sessions };
      render();
    }
  } catch (e) {
    console.error("draft_orphan_sessions_list", e);
  }
}
