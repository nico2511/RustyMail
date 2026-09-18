import { invoke } from "@tauri-apps/api/core";
import { recordActivity } from "../../activity";
import type { SendDraftOutcome, SplitPlan } from "../types";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { draftPayloadForRust } from "./composeDraftPayload";
import { persistDraft } from "./composePersistDraft";
import { toastSendDraftImapNotice } from "./sendDraftImapNotice";
import {
  composeSendDraftRunDeps,
  finishComposeAfterSuccessfulSend,
  registerComposeSendDraftRunDeps,
} from "./composeSendDraftFinishRun";

export type { ComposeSendDraftRunDeps } from "./composeSendDraftFinishRun";
export { registerComposeSendDraftRunDeps };
export { confirmAndExecuteSplitSend } from "./composeSendDraftSplitRun";

export async function sendDraft(): Promise<void> {
  persistDraft();
  if (!state.draft) {
    toast("Aucun brouillon à envoyer.");
    console.warn("sendDraft: state.draft is undefined");
    return;
  }
  const toEmails = state.draft.to.map((x) => x.email?.trim()).filter(Boolean);
  if (toEmails.length === 0) {
    toast("Ajoutez au moins une adresse dans le champ À.");
    return;
  }
  if (!state.draft.subject?.trim()) {
    toast("Renseignez l’objet du message.");
    return;
  }
  const account = currentAccount();
  const accountId = account?.id ?? null;
  const draftOutbound = draftPayloadForRust(state.draft);
  const attachPaths = draftOutbound.attachmentPaths ?? [];

  if (isTauriRuntime() && attachPaths.length > 0) {
    try {
      state.composeMessage = "Analyse des pièces jointes…";
      render();
      const plan = await withTimeout(invoke<SplitPlan>("plan_split_send", { draft: draftOutbound }), MAIL_ACTION_TIMEOUT_MS);
      if (plan.chunks.length > 1) {
        state.splitSendConfirm = plan;
        state.composeMessage = "";
        render();
        return;
      }
    } catch (error) {
      console.error("plan_split_send", error);
      state.composeMessage = "";
      toast(tauriErrorMessage(error));
      render();
      return;
    }
  }

  try {
    state.composeMessage = "Envoi en cours…";
    render();
    const keepThreadId = state.selectedThreadId;
    const sendOutcome = await withTimeout(
      invoke<SendDraftOutcome>("send_draft", {
        accountId,
        draft: draftOutbound,
        sendAck: "send-draft",
      }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    state.composeMessage = "Email envoyé";
    toast(state.composeMessage);
    toastSendDraftImapNotice(sendOutcome);
    if (keepThreadId) {
      recordActivity({
        eventType: "message_sent",
        threadId: String(keepThreadId),
        senderEmail: toEmails[0] ?? null,
      });
    }
    await finishComposeAfterSuccessfulSend(keepThreadId);
    composeSendDraftRunDeps().clearDraftSession();
    window.setTimeout(() => {
      state.composeMessage = "";
      render();
    }, 2500);
    render();
  } catch (error) {
    console.error("send_draft", error);
    state.composeMessage = `Envoi échoué: ${tauriErrorMessage(error)}`;
    toast(state.composeMessage);
    render();
  }
}
