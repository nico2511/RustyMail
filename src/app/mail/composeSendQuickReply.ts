import { invoke } from "@tauri-apps/api/core";
import type { Draft, SendDraftOutcome } from "../types";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { loadMailView, loadMailboxUnread } from "./mailListView";
import { currentThreadIdForReply } from "./composeThreadReply";
import { toastSendDraftImapNotice } from "./sendDraftImapNotice";

export async function sendQuickReply(kind: "reply" | "reply-all"): Promise<void> {
  const quickInput = document.querySelector<HTMLInputElement>("[data-quick-reply]");
  const body = quickInput?.value.trim() ?? "";
  if (!body) {
    toast("Le quick reply est vide.");
    return;
  }
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
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
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  draft.markdownBody = `${body}\n`;
  try {
    const sendOutcome = await withTimeout(
      invoke<SendDraftOutcome>("send_draft", {
        accountId: currentAccount()?.id ?? null,
        draft,
        sendAck: "send-draft",
      }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    toast(kind === "reply" ? "Réponse envoyée." : "Réponse à tous envoyée.");
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
    toast(`Envoi échoué: ${tauriErrorMessage(error)}`);
  }
}
