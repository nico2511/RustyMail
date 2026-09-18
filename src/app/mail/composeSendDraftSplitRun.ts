import { invoke } from "@tauri-apps/api/core";
import type { SplitSendResult } from "../types";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { draftPayloadForRust } from "./composeDraftPayload";
import { persistDraft } from "./composePersistDraft";
import {
  finishComposeAfterSuccessfulSend,
  toastSplitImapNotices,
} from "./composeSendDraftFinishRun";

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
