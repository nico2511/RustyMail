import type { ComposeLayout } from "../types";
import { render } from "../dispatch";
import { state } from "../state";
import { draftHasRecipientsExtra } from "./composeDraftRecipients";

export type ComposeThreadReplyDeps = {
  loadComposeMarkdownIntoEditor: (markdown: string) => void;
  resetMarkdownEditorHistory: () => void;
  computePreview: () => void | Promise<void>;
  scheduleDraftRevisionSave: (delayMs?: number) => void;
  formatThreadReadingWhen: (receivedAt: string) => string;
  enterComposeView: (opts?: { skipHistory?: boolean }) => void;
  startNewDraftSession: () => void;
  syncPreviewOpenFromComposeLayout: () => void;
};

let composeThreadReplyDepsState: ComposeThreadReplyDeps | null = null;

export function registerComposeThreadReplyDeps(deps: ComposeThreadReplyDeps): void {
  composeThreadReplyDepsState = deps;
}

export function getComposeThreadReplyDeps(): ComposeThreadReplyDeps {
  if (!composeThreadReplyDepsState) throw new Error("registerComposeThreadReplyDeps not called");
  return composeThreadReplyDepsState;
}

export function currentThreadIdForReply(): string | undefined {
  const a = state.selectedThreadId?.trim();
  if (a) return a;
  const b = state.threads[0]?.id;
  return b ? String(b) : undefined;
}

export function afterDraftPreparedForCompose(): void {
  const d = getComposeThreadReplyDeps();
  d.enterComposeView();
  d.startNewDraftSession();
  state.composeCcBccOpen = draftHasRecipientsExtra(state.draft);
  state.composeLayout = "split";
  d.syncPreviewOpenFromComposeLayout();
  d.resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void d.computePreview(), 0);
  d.scheduleDraftRevisionSave(350);
}

export function afterForwardDraftPrepared(): void {
  const d = getComposeThreadReplyDeps();
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
