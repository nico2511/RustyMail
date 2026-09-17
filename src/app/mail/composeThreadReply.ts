import { invoke } from "@tauri-apps/api/core";
import { appendQuotedMessageToDraft } from "../../composeQuote";
import type { ComposeLayout, Draft } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { toast } from "../lib/toast";
import { withTimeout, tauriErrorMessage } from "../lib/tauriCommand";
import { render } from "../dispatch";
import { state } from "../state";

export type ComposeThreadReplyDeps = {
  loadComposeMarkdownIntoEditor: (markdown: string) => void;
  resetMarkdownEditorHistory: () => void;
  computePreview: () => void | Promise<void>;
  scheduleDraftRevisionSave: (delayMs?: number) => void;
  draftHasRecipientsExtra: (draft?: Draft) => boolean;
  formatThreadReadingWhen: (receivedAt: string) => string;
  enterComposeView: (opts?: { skipHistory?: boolean }) => void;
  startNewDraftSession: () => void;
  syncPreviewOpenFromComposeLayout: () => void;
};

let composeThreadReplyDeps: ComposeThreadReplyDeps | null = null;

export function registerComposeThreadReplyDeps(deps: ComposeThreadReplyDeps): void {
  composeThreadReplyDeps = deps;
}

function replyDeps(): ComposeThreadReplyDeps {
  if (!composeThreadReplyDeps) throw new Error("registerComposeThreadReplyDeps not called");
  return composeThreadReplyDeps;
}

export function currentThreadIdForReply(): string | undefined {
  const a = state.selectedThreadId?.trim();
  if (a) return a;
  const b = state.threads[0]?.id;
  return b ? String(b) : undefined;
}

function afterDraftPreparedForCompose(): void {
  const d = replyDeps();
  d.enterComposeView();
  d.startNewDraftSession();
  state.composeCcBccOpen = d.draftHasRecipientsExtra(state.draft);
  state.composeLayout = "split";
  d.syncPreviewOpenFromComposeLayout();
  d.resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void d.computePreview(), 0);
  d.scheduleDraftRevisionSave(350);
}

export async function prepareReply(): Promise<void> {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const d = replyDeps();
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
  const d = replyDeps();
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
  const d = replyDeps();
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

async function prepareForwardWithOptionalMessage(messageId: string | null): Promise<void> {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const mid = messageId?.trim() || null;
  const d = replyDeps();
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
  d.enterComposeView();
  d.startNewDraftSession();
  state.composeCcBccOpen = false;
  state.composeLayout = "split" as ComposeLayout;
  d.syncPreviewOpenFromComposeLayout();
  d.resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void d.computePreview(), 0);
  d.scheduleDraftRevisionSave(350);
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
