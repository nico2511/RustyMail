import { invoke } from "@tauri-apps/api/core";

import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { SavedDraftOpenPayload } from "../types";
import { draftHasRecipientsExtra } from "./composeDraftRecipients";
import {
  computePreview,
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  scheduleDraftRevisionSave,
} from "./composeComposerBridge";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import { startNewDraftSession } from "./composeDraftSession";
import { syncPreviewOpenFromComposeLayout } from "./composeLayoutState";
import { enterComposeView } from "./composeViewWireActions";

export async function openSavedDraftById(savedDraftId: string): Promise<void> {
  const sdid = savedDraftId.trim();
  if (!sdid) return;
  if (!isTauriRuntime()) {
    toast("Ouvrir un brouillon enregistré : lancez l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte.");
    return;
  }
  try {
    const res = await withTimeout(
      invoke<SavedDraftOpenPayload>("saved_draft_open", { accountId: account.id, savedDraftId: sdid }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    enterComposeView();
    startNewDraftSession();
    state.draftSessionId = res.sessionId;
    state.savedDraftRecordId = res.savedDraftId;
    state.draft = res.draft;
    state.composeCcBccOpen = draftHasRecipientsExtra(res.draft);
    state.composeAdvancedOpen = false;
    state.composeLayout = "historique";
    syncPreviewOpenFromComposeLayout();
    resetMarkdownEditorHistory();
    loadComposeMarkdownIntoEditor(state.draft.markdownBody ?? "");
    state.preview = undefined;
    state.composeMessage = "";
    render();
    window.setTimeout(() => void computePreview(), 0);
    void refreshDraftRevisions(60);
    scheduleDraftRevisionSave(350);
  } catch (error) {
    console.error("saved_draft_open", error);
    toast(tauriErrorMessage(error));
    render();
  }
}
