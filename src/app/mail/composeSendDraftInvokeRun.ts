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
import { releaseSendAttempt, sendIdForDraft } from "./composeSendId";

function isInvokeTimeout(message: string): boolean {
  const lower = message.toLowerCase();
  return message === "Tauri command timeout" || lower.includes("timeout") || lower.includes("délai");
}

/** Plafond de sondage. Au-delà, l'indicateur local est levé mais l'id du brouillon reste. */
export const sendDraftPoll = {
  maxAttempts: 24,
  delayMs: (attempt: number) => Math.min(Math.round(1500 * 1.5 ** attempt), 8_000),
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function pollSendDraftUntilTerminal(sendId: string): Promise<SendDraftStatus | null> {
  for (let attempt = 0; attempt < sendDraftPoll.maxAttempts; attempt++) {
    let status: SendDraftStatus;
    try {
      status = await withTimeout(invoke<SendDraftStatus>("send_draft_status", { sendId }), 10_000);
    } catch {
      return { state: "unknown" };
    }
    if (status.state !== "inFlight") return status;
    await sleep(sendDraftPoll.delayMs(attempt));
  }
  return null;
}

async function finishSuccessfulSend(
  sendOutcome: SendDraftOutcome,
  keepThreadId: string | undefined,
  toEmails: string[],
  draftId: string,
) {
  state.sendDraftInFlight = false;
  releaseSendAttempt(draftId);
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

async function pollSendDraftStatus(
  sendId: string,
  keepThreadId: string | undefined,
  toEmails: string[],
  draftId: string,
) {
  const status = await pollSendDraftUntilTerminal(sendId);
  if (!status) {
    state.sendDraftInFlight = false;
    state.composeMessage =
      "Vérification interrompue : le même brouillon garde son identifiant d'envoi.";
    render();
    return;
  }
  if (status.state === "done") {
    await finishSuccessfulSend({ imapNotice: status.imapNotice ?? null }, keepThreadId, toEmails, draftId);
    return;
  }
  if (status.state === "failed") {
    state.sendDraftInFlight = false;
    releaseSendAttempt(draftId);
    state.composeMessage = `Envoi échoué: ${status.error}`;
    toast(state.composeMessage);
    render();
    return;
  }
  state.sendDraftInFlight = false;
  state.composeMessage = "Statut d'envoi inconnu : vérification…";
  render();
}

export async function invokeSendDraft(accountId: string | null, draftOutbound: Draft): Promise<void> {
  const draftId = draftOutbound.id ?? "";
  const sendId = sendIdForDraft(draftOutbound);
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
    await finishSuccessfulSend(sendOutcome, keepThreadId, toEmails, draftId);
  } catch (error) {
    const message = tauriErrorMessage(error);
    if (isInvokeTimeout(message)) {
      state.composeMessage = "Statut d'envoi inconnu : vérification…";
      render();
      await pollSendDraftStatus(sendId, keepThreadId, toEmails, draftId);
      return;
    }
    console.error("send_draft", error);
    state.sendDraftInFlight = false;
    releaseSendAttempt(draftId);
    state.composeMessage = `Envoi échoué: ${message}`;
    toast(state.composeMessage);
    render();
  }
}
