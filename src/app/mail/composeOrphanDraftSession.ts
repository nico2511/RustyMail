import { invoke } from "@tauri-apps/api/core";
import type { Draft } from "../types";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { draftHasRecipientsExtra } from "./composeDraftRecipients";
import {
  computePreview,
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  scheduleDraftRevisionSave,
} from "./composeComposerBridge";
import { upsertSavedDraftSilent } from "./composeDraftLocalSave";
import { startNewDraftSession } from "./composeDraftSession";
import { syncPreviewOpenFromComposeLayout } from "./composeLayoutState";
import { enterComposeView } from "./composeViewWireActions";

export async function resumeOrphanDraftSession(sessionId: string): Promise<void> {
  const sid = sessionId.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!sid || !accountId || !isTauriRuntime()) return;
  try {
    const draft = await withTimeout(
      invoke<Draft>("draft_orphan_session_open", { accountId, sessionId: sid }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    state.resumeDraftModal = null;
    startNewDraftSession();
    state.draftSessionId = sid;
    state.draft = draft;
    loadComposeMarkdownIntoEditor(draft.markdownBody ?? "");
    enterComposeView();
    state.composeCcBccOpen = draftHasRecipientsExtra(draft);
    state.composeLayout = "split";
    syncPreviewOpenFromComposeLayout();
    resetMarkdownEditorHistory();
    await upsertSavedDraftSilent();
    toast("Brouillon repris.");
    render();
    window.setTimeout(() => void computePreview(), 0);
    scheduleDraftRevisionSave(350);
  } catch (e) {
    console.error("draft_orphan_session_open", e);
    toast(`Reprise impossible : ${tauriErrorMessage(e)}`);
  }
}

export async function dismissOrphanDraftSession(sessionId: string): Promise<void> {
  const sid = sessionId.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!sid || !accountId || !isTauriRuntime()) return;
  try {
    await withTimeout(
      invoke("draft_revision_purge_session", { accountId, sessionId: sid }),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch (e) {
    console.error("purge orphan", e);
  }
  if (state.resumeDraftModal) {
    const next = state.resumeDraftModal.sessions.filter((s) => s.sessionId !== sid);
    state.resumeDraftModal = next.length ? { sessions: next } : null;
  }
  render();
}
