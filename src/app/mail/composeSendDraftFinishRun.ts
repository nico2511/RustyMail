import type { SendDraftOutcome } from "../types";
import { syncPreviewOpenFromComposeLayout } from "./composeLayoutState";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { toast } from "../lib/toast";
import { state } from "../state";

export type ComposeSendDraftRunDeps = {
  loadMailView: (append: boolean) => Promise<void>;
  loadMailboxUnread: () => Promise<void>;
  clearDraftSession: () => void;
};

let sendDraftRunDeps: ComposeSendDraftRunDeps | null = null;

export function registerComposeSendDraftRunDeps(deps: ComposeSendDraftRunDeps): void {
  sendDraftRunDeps = deps;
}

export function composeSendDraftRunDeps(): ComposeSendDraftRunDeps {
  if (!sendDraftRunDeps) throw new Error("registerComposeSendDraftRunDeps not called");
  return sendDraftRunDeps;
}

export function toastSplitImapNotices(notes: Array<string | null | undefined> | undefined) {
  if (!notes?.length) return;
  const shorten = (s: string, n = 220) => (s.length <= n ? s : `${s.slice(0, n)}…`);
  for (const note of notes) {
    const t = note?.trim();
    if (t) toast(`Information : ${shorten(t)}`);
  }
}

export async function finishComposeAfterSuccessfulSend(keepThreadId: string | undefined): Promise<void> {
  const d = composeSendDraftRunDeps();
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
