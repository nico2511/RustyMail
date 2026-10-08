import { invoke } from "@tauri-apps/api/core";
import { recordActivity } from "../../activity";
import type { Draft, SendDraftOutcome } from "../types";

type SendDraftStatus =
  | { state: "unknown" }
  | { state: "inFlight" }
  | { state: "done"; imapNotice?: string | null }
  | { state: "failed"; error: string };
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

function isInvokeTimeout(message: string): boolean {
  const lower = message.toLowerCase();
  return message === "Tauri command timeout" || lower.includes("timeout") || lower.includes("délai");
}

function currentSendId(): string {
  if (state.composeSendId.trim()) return state.composeSendId.trim();
  const id = globalThis.crypto.randomUUID();
  state.composeSendId = id;
  return id;
}

async function finishSuccessfulSend(sendOutcome: SendDraftOutcome, keepThreadId: string | undefined, toEmails: string[]) {
  state.sendDraftInFlight = false;
  state.composeSendId = "";
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
}

async function pollSendDraftStatus(sendId: string, keepThreadId: string | undefined, toEmails: string[]) {
  for (let attempt = 0; attempt < 20; attempt++) {
    let status: SendDraftStatus;
    try {
      status = await withTimeout(
        invoke<SendDraftStatus>("send_draft_status", { sendId }),
        10_000,
      );
    } catch {
      state.sendDraftInFlight = false;
      state.composeMessage = "Statut d'envoi inconnu : vérification…";
      render();
      return;
    }
    if (status.state === "inFlight") {
      state.sendDraftInFlight = true;
      state.composeMessage = "Statut d'envoi inconnu : vérification…";
      render();
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      continue;
    }
    if (status.state === "done") {
      await finishSuccessfulSend({ imapNotice: status.imapNotice ?? null }, keepThreadId, toEmails);
      return;
    }
    if (status.state === "failed") {
      state.sendDraftInFlight = false;
      state.composeMessage = `Envoi échoué: ${status.error}`;
      toast(state.composeMessage);
      render();
      return;
    }
    state.sendDraftInFlight = false;
    state.composeMessage = "Statut d'envoi inconnu : vérification…";
    render();
    return;
  }
}

export async function invokeSendDraft(accountId: string | null, draftOutbound: Draft): Promise<void> {
  const sendId = currentSendId();
  const keepThreadId = state.selectedThreadId;
  const toEmails = draftOutbound.to.map((x) => x.email?.trim()).filter(Boolean);
  state.sendDraftInFlight = true;
  try {
    state.composeMessage = "Envoi en cours…";
    render();
    const sendOutcome = await withTimeout(
      invoke<SendDraftOutcome>("send_draft", {
        accountId,
        draft: draftOutbound,
        sendAck: "send-draft",
        sendId,
      }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await finishSuccessfulSend(sendOutcome, keepThreadId, toEmails);
  } catch (error) {
    const message = tauriErrorMessage(error);
    if (isInvokeTimeout(message)) {
      state.composeMessage = "Statut d'envoi inconnu : vérification…";
      render();
      await pollSendDraftStatus(sendId, keepThreadId, toEmails);
      return;
    }
    console.error("send_draft", error);
    state.sendDraftInFlight = false;
    state.composeMessage = `Envoi échoué: ${message}`;
    toast(state.composeMessage);
    render();
  }
}
