import type { CleanedMessageView } from "../types";
import { isOwnSender } from "./threadViewUiParticipantsRun";
import { sortMessagesByReceivedAscending } from "./threadMessageSort";

export function threadTreeLaneRight(
  thread: { messages: CleanedMessageView[] },
  message: CleanedMessageView,
): { isRoot: boolean; laneRight: boolean } {
  const ascending = sortMessagesByReceivedAscending(thread.messages);
  const rootId = ascending[0]?.messageId ?? "";
  const isRoot = Boolean(rootId) && message.messageId === rootId;
  // Alignement unique du fil : plus de voie droite selon l’expéditeur ou « moi ».
  return { isRoot, laneRight: false };
}

export function senderAccentVars(sender: string): string {
  const s = (sender || "").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const fg = `hsla(${hue} 56% 70% / 1)`;
  const bg = `hsla(${hue} 56% 70% / 0.18)`;
  return `--sender-accent:${fg};--sender-accent-bg:${bg};`;
}

export function threadQuickReplyTargetName(msgs: CleanedMessageView[]): string {
  for (let i = 0; i < msgs.length; i++) {
    if (!isOwnSender(msgs[i].sender)) return msgs[i].sender;
  }
  return msgs[0]?.sender ?? "…";
}
