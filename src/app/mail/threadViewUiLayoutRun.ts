import type { CleanedMessageView } from "../types";
import { isOwnSender, normalizeThreadSenderLabel } from "./threadViewUiParticipantsRun";
import { sortMessagesByReceivedAscending } from "./threadMessageSort";

export function threadTreeLaneRight(
  thread: { messages: CleanedMessageView[] },
  message: CleanedMessageView,
): { isRoot: boolean; laneRight: boolean } {
  const ascending = sortMessagesByReceivedAscending(thread.messages);
  const rootId = ascending[0]?.messageId ?? "";
  const isRoot = Boolean(rootId) && message.messageId === rootId;
  if (isRoot) return { isRoot: true, laneRight: false };
  if (isOwnSender(message.sender)) return { isRoot: false, laneRight: true };

  const lanes = new Map<string, boolean>();
  let nextRight = false; // 1er expéditeur rencontré (hors root, hors moi) => gauche
  for (const m of ascending.slice(1)) {
    if (m.messageId === rootId) continue;
    const key = normalizeThreadSenderLabel(m.sender);
    if (!key) continue;
    if (isOwnSender(m.sender)) {
      lanes.set(key, true);
      continue;
    }
    if (lanes.has(key)) continue;
    lanes.set(key, nextRight);
    nextRight = !nextRight;
  }
  const k = normalizeThreadSenderLabel(message.sender);
  return { isRoot: false, laneRight: lanes.get(k) ?? false };
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
