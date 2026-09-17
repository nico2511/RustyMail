import type { CleanedMessageView } from "../types";
import { toast } from "../lib/toast";
import { state } from "../state";
import { threadMessageAnchorId } from "./threadMessageAnchor";

export type ThreadScrollToMessageDeps = {
  sortMessagesByReceivedDescending: (messages: CleanedMessageView[]) => CleanedMessageView[];
};

let threadScrollToMessageDeps: ThreadScrollToMessageDeps | null = null;

export function registerThreadScrollToMessageDeps(deps: ThreadScrollToMessageDeps): void {
  threadScrollToMessageDeps = deps;
}

export function scrollToThreadMessage(messageId: string): void {
  const sortDesc = threadScrollToMessageDeps?.sortMessagesByReceivedDescending;
  if (!sortDesc) throw new Error("registerThreadScrollToMessageDeps not called");
  const thread = state.selectedThread;
  if (!thread) return;
  const msgs = sortDesc(thread.messages);
  const idx = msgs.findIndex((m) => m.messageId === messageId.trim());
  if (idx < 0) {
    toast("Message introuvable dans ce fil.");
    return;
  }
  const anchorId = threadMessageAnchorId(messageId, idx);
  const el = document.getElementById(anchorId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("thread-msg--evidence-flash");
    window.setTimeout(() => el.classList.remove("thread-msg--evidence-flash"), 2400);
  } else {
    toast("Message introuvable dans la vue.");
  }
}
