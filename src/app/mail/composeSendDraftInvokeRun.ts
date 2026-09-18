import { invoke } from "@tauri-apps/api/core";
import { recordActivity } from "../../activity";
import type { Draft, SendDraftOutcome } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { toastSendDraftImapNotice } from "./sendDraftImapNotice";
import {
  composeSendDraftRunDeps,
  finishComposeAfterSuccessfulSend,
} from "./composeSendDraftFinishRun";

export async function invokeSendDraft(accountId: string | null, draftOutbound: Draft): Promise<void> {
  try {
    state.composeMessage = "Envoi en cours…";
    render();
    const keepThreadId = state.selectedThreadId;
    const toEmails = draftOutbound.to.map((x) => x.email?.trim()).filter(Boolean);
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
