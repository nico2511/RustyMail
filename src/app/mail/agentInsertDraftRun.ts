import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { Draft } from "../types";
import { appendSchedulingSlotsToDraft } from "./agentSchedulingDraftFormat";
import {
  computePreview,
  resetMarkdownEditorHistory,
  scheduleDraftRevisionSave,
} from "./composeComposerBridge";
import { replaceComposeWithModelText } from "./composeBodyEditor";
import { draftHasRecipientsExtra } from "./composeDraftRecipients";
import { startNewDraftSession } from "./composeDraftSession";
import { syncPreviewOpenFromComposeLayout } from "./composeLayoutState";
import { enterComposeView } from "./composeViewWireActions";
import { introducesLlmMeta, LLM_META_BODY_TOAST } from "./llmMetaGuard";
import { threadIsAutoMail } from "./threadAutoMail";

export async function agentInsertDraftIntoCompose(extra?: string): Promise<void> {
  const s = state.agentSession;
  if (!s?.draft.trim() && !extra?.trim()) return;
  let body = s?.draft?.trim() ?? "";
  if (extra?.trim()) body = appendSchedulingSlotsToDraft(body, extra.trim());
  const source = (state.selectedThread?.messages ?? []).map((message) => message.cleanedText || "").join("\n");
  if (introducesLlmMeta(source, body)) {
    toast.error(LLM_META_BODY_TOAST);
    return;
  }

  const threadId = (s?.threadId ?? state.selectedThreadId ?? "").trim();
  if (!threadId) {
    toast.warning("Ouvrez le fil auquel vous répondez, puis réessayez.");
    return;
  }
  if (!isTauriRuntime()) {
    toast.warning("Réponse dans le fil : application desktop (Tauri) requise.");
    return;
  }
  if (threadIsAutoMail(state.selectedThread, threadId)) {
    toast.warning("Réponse indisponible pour ce fil automatique / newsletter.");
    return;
  }

  try {
    const replyDraft = await withTimeout(
      invoke<Draft>("prepare_reply", { threadId, messageId: null }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    replyDraft.markdownBody = body;
    state.draft = replyDraft;
    enterComposeView();
    startNewDraftSession();
    // Même chemin TipTap que rewrite/grammar (HTML marqué), pas load markdown brut.
    replaceComposeWithModelText(body);
    state.composeCcBccOpen = draftHasRecipientsExtra(state.draft);
    state.composeAdvancedOpen = false;
    state.composeLayout = "split";
    syncPreviewOpenFromComposeLayout();
    resetMarkdownEditorHistory();
    render();
    window.setTimeout(() => void computePreview(), 0);
    scheduleDraftRevisionSave(350);
  } catch (e) {
    console.error("agentInsertDraftIntoCompose prepare_reply", e);
    toast.error(`Impossible d’ouvrir la réponse dans le fil : ${tauriErrorMessage(e)}`);
  }
}
