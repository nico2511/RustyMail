import { invoke } from "@tauri-apps/api/core";
import type { Draft } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { toast } from "../lib/toast";
import { withTimeout, tauriErrorMessage } from "../lib/tauriCommand";
import { state } from "../state";
import {
  afterForwardDraftPrepared,
  getComposeThreadReplyDeps,
  currentThreadIdForReply,
} from "./composeThreadReplyDepsRun";

async function prepareForwardWithOptionalMessage(messageId: string | null): Promise<void> {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const mid = messageId?.trim() || null;
  const d = getComposeThreadReplyDeps();
  try {
    state.draft = await withTimeout(
      invoke<Draft>("prepare_forward", { threadId, messageId: mid }),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("Tauri command failed: prepare_forward", error);
    toast(`Impossible de préparer le transfert: ${tauriErrorMessage(error)}`);
    return;
  }
  d.loadComposeMarkdownIntoEditor(state.draft.markdownBody);
  afterForwardDraftPrepared();
}

export async function prepareForward(): Promise<void> {
  await prepareForwardWithOptionalMessage(null);
}

export async function prepareForwardToMessage(messageId: string): Promise<void> {
  const mid = messageId.trim();
  if (!mid) {
    await prepareForward();
    return;
  }
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const thread = state.selectedThread;
  const msg = thread?.messages.find((m) => m.messageId === mid);
  if (!msg) {
    await prepareForward();
    return;
  }
  await prepareForwardWithOptionalMessage(mid);
}
