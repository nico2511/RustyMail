import { invoke } from "@tauri-apps/api/core";
import type { Draft, SendDraftOutcome } from "../types";
import { composeSendAccount } from "../core/composeSendAccount";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { loadMailView, loadMailboxUnread } from "./mailListView";
import { currentThreadIdForReply } from "./composeThreadReply";
import { toastSendDraftImapNotice } from "./sendDraftImapNotice";
import { pollSendDraftUntilTerminal } from "./composeSendDraftInvokeRun";

let quickReplyInFlight = false;
const quickReplyIds = new Map<string, string>();

function quickReplySendId(threadId: string, body: string): string {
  const key = `${threadId}\0${body}`;
  const existing = quickReplyIds.get(key);
  if (existing) return existing;
  const id = globalThis.crypto.randomUUID();
  quickReplyIds.set(key, id);
  return id;
}

export async function sendQuickReply(kind: "reply" | "reply-all"): Promise<void> {
  if (quickReplyInFlight) return;
  const quickInput = document.querySelector<HTMLInputElement>("[data-quick-reply]");
  const body = quickInput?.value.trim() ?? "";
  if (!body) {
    toast.warning("Le quick reply est vide.");
    return;
  }
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast.warning("Aucun fil sélectionné.");
    return;
  }
  const command = kind === "reply" ? "prepare_reply" : "prepare_reply_all";
  let draft: Draft;
  try {
    draft = await withTimeout(
      invoke<Draft>(command, kind === "reply" ? { threadId, messageId: null } : { threadId }),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch (error) {
    console.error(`Tauri command failed: ${command}`, error);
    toast.error(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  draft.markdownBody = `${body}\n`;
  const sendId = quickReplySendId(threadId, draft.markdownBody);
  quickReplyInFlight = true;
  try {
    let sendOutcome: SendDraftOutcome;
    try {
      sendOutcome = await withTimeout(
        invoke<SendDraftOutcome>("send_draft", {
          accountId: composeSendAccount()?.id ?? null,
          draft,
          sendAck: "send-draft",
          sendId,
        }),
        MAIL_ACTION_TIMEOUT_MS,
      );
    } catch (error) {
      const message = tauriErrorMessage(error);
      const lower = message.toLowerCase();
      const timedOut = message === "Tauri command timeout" || lower.includes("timeout") || lower.includes("délai");
      if (!timedOut) throw error;
      const status = await pollSendDraftUntilTerminal(sendId);
      if (!status || status.state !== "done") {
        toast.warning("Vérification interrompue : la même réponse garde son identifiant d'envoi.");
        return;
      }
      sendOutcome = { imapNotice: status.imapNotice ?? null };
    }
    toast.success(kind === "reply" ? "Réponse envoyée." : "Réponse à tous envoyée.");
    toastSendDraftImapNotice(sendOutcome);
    if (quickInput) quickInput.value = "";
    await loadMailView(false);
    await loadMailboxUnread();
    if (state.selectedThreadId) {
      const tid = state.selectedThreadId;
      const refreshed = await fetchOpenThreadOrNotify(tid);
      if (refreshed) state.selectedThread = refreshed;
    }
    render();
  } catch (error) {
    console.error("send_draft (quick reply)", error);
    toast.error(`Envoi échoué: ${tauriErrorMessage(error)}`);
  } finally {
    quickReplyInFlight = false;
  }
}
