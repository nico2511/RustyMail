import { invoke } from "@tauri-apps/api/core";
import { appendQuotedMessageToDraft } from "../../composeQuote";
import type { Draft } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { toast } from "../lib/toast";
import { withTimeout, tauriErrorMessage } from "../lib/tauriCommand";
import { state } from "../state";
import {
  afterDraftPreparedForCompose,
  getComposeThreadReplyDeps,
  currentThreadIdForReply,
} from "./composeThreadReplyDepsRun";

export async function prepareReply(): Promise<void> {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const d = getComposeThreadReplyDeps();
  try {
    state.draft = await withTimeout(invoke<Draft>("prepare_reply", { threadId, messageId: null }), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("Tauri command failed: prepare_reply", error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  d.loadComposeMarkdownIntoEditor(state.draft.markdownBody);
  afterDraftPreparedForCompose();
}

export async function prepareReplyToMessage(messageId: string): Promise<void> {
  const mid = messageId.trim();
  if (!mid) return;
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const thread = state.selectedThread;
  const msg = thread?.messages.find((m) => m.messageId === mid);
  if (!msg) {
    await prepareReply();
    return;
  }
  const d = getComposeThreadReplyDeps();
  try {
    state.draft = await withTimeout(invoke<Draft>("prepare_reply", { threadId, messageId: mid }), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("Tauri command failed: prepare_reply (quote)", error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  const header = `${d.formatThreadReadingWhen(msg.receivedAt)} — ${msg.sender}`;
  const body = (msg.cleanedText || msg.sourceText || "").trim();
  const next = appendQuotedMessageToDraft(state.draft?.markdownBody ?? "", header, body);
  d.loadComposeMarkdownIntoEditor(next);
  afterDraftPreparedForCompose();
}

export async function prepareReplyAll(): Promise<void> {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const d = getComposeThreadReplyDeps();
  try {
    state.draft = await withTimeout(invoke<Draft>("prepare_reply_all", { threadId }), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("Tauri command failed: prepare_reply_all", error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  d.loadComposeMarkdownIntoEditor(state.draft.markdownBody);
  afterDraftPreparedForCompose();
}
