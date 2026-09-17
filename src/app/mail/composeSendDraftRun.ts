import { invoke } from "@tauri-apps/api/core";
import { recordActivity } from "../../activity";
import type { SendDraftOutcome, SplitPlan, SplitSendResult } from "../types";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { draftPayloadForRust } from "./composeDraftPayload";
import { syncPreviewOpenFromComposeLayout } from "./composeLayoutState";
import { persistDraft } from "./composePersistDraft";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { toastSendDraftImapNotice } from "./sendDraftImapNotice";

export type ComposeSendDraftRunDeps = {
  loadMailView: (append: boolean) => Promise<void>;
  loadMailboxUnread: () => Promise<void>;
  clearDraftSession: () => void;
};

let sendDraftRunDeps: ComposeSendDraftRunDeps | null = null;

export function registerComposeSendDraftRunDeps(deps: ComposeSendDraftRunDeps): void {
  sendDraftRunDeps = deps;
}

function runDeps(): ComposeSendDraftRunDeps {
  if (!sendDraftRunDeps) throw new Error("registerComposeSendDraftRunDeps not called");
  return sendDraftRunDeps;
}

function toastSplitImapNotices(notes: Array<string | null | undefined> | undefined) {
  if (!notes?.length) return;
  const shorten = (s: string, n = 220) => (s.length <= n ? s : `${s.slice(0, n)}…`);
  for (const note of notes) {
    const t = note?.trim();
    if (t) toast(`Information : ${shorten(t)}`);
  }
}

async function finishComposeAfterSuccessfulSend(keepThreadId: string | undefined): Promise<void> {
  const d = runDeps();
  await d.loadMailView(false);
  await d.loadMailboxUnread();
  if (keepThreadId) {
    const refreshed = await fetchOpenThreadOrNotify(keepThreadId);
    if (refreshed) state.selectedThread = refreshed;
  }
  state.view = state.selectedThread ? "thread" : "list";
  state.draft = undefined;
  state.composeBody = "";
  state.composeCanonicalBody = "";
  state.composeLayout = "split";
  syncPreviewOpenFromComposeLayout();
  state.preview = undefined;
}

export async function confirmAndExecuteSplitSend(): Promise<void> {
  if (!state.draft) {
    state.splitSendConfirm = null;
    render();
    return;
  }
  persistDraft();
  const draftOutbound = draftPayloadForRust(state.draft);
  const n = state.splitSendConfirm?.chunks.length ?? 0;
  state.splitSendConfirm = null;
  const accountId = currentAccount()?.id ?? null;
  const splitTimeout = MAIL_ACTION_TIMEOUT_MS * Math.max(1, Math.min(n || 1, 12));
  try {
    state.composeMessage = n > 1 ? `Envoi en cours (${n} parties)…` : "Envoi en cours…";
    render();
    const keepThreadId = state.selectedThreadId;
    const result = await withTimeout(
      invoke<SplitSendResult>("execute_split_send_cmd", {
        accountId,
        draft: draftOutbound,
        sendAck: "send-draft",
      }),
      splitTimeout,
    );
    if (result.failedChunkIndex != null) {
      const done = result.messageIds?.length ?? 0;
      const err = (result.errorMessage ?? "").trim();
      toast(
        `Envoi interrompu à la partie ${result.failedChunkIndex}/${n} (${done} partie(s) déjà envoyée(s)).${err ? ` ${err}` : ""}`,
      );
      state.composeMessage = `Échec partie ${result.failedChunkIndex}/${n}`;
      toastSplitImapNotices(result.imapNotices);
      render();
      return;
    }
    state.composeMessage = n > 1 ? `Email envoyé en ${n} parties` : "Email envoyé";
    toast(state.composeMessage);
    toastSplitImapNotices(result.imapNotices);
    await finishComposeAfterSuccessfulSend(keepThreadId);
    window.setTimeout(() => {
      state.composeMessage = "";
      render();
    }, 2500);
    render();
  } catch (error) {
    console.error("execute_split_send_cmd", error);
    state.composeMessage = `Envoi échoué: ${tauriErrorMessage(error)}`;
    toast(state.composeMessage);
    render();
  }
}

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
    runDeps().clearDraftSession();
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
