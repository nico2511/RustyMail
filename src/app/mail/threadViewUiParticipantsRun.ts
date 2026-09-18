import { currentAccount } from "../core/accountContext";
import type { CleanedMessageView, ThreadParticipantLink } from "../types";
import { canonicalEmailForNlMatch } from "./searchAccountResolve";
import { sortMessagesByReceivedAscending } from "./threadMessageSort";

export function uniqueSendersOrdered(msgs: CleanedMessageView[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const m of msgs) {
    const s = m.sender.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    names.push(s);
  }
  return names;
}

export function threadParticipantsWithEmails(messages: CleanedMessageView[]): ThreadParticipantLink[] {
  const map = new Map<string, string>();
  for (const m of sortMessagesByReceivedAscending(messages)) {
    const name = m.sender.trim();
    if (!name || map.has(name)) continue;
    const email = (m.senderEmail ?? "").trim().toLowerCase();
    map.set(name, email.includes("@") ? email : "");
  }
  return [...map.entries()].map(([name, email]) => ({ name, email }));
}

export function normalizeThreadSenderLabel(sender: string): string {
  return sender.trim().toLowerCase().replace(/\s+/g, " ");
}

export function threadParticipantDedupKey(msg: CleanedMessageView): string {
  const c = canonicalEmailForNlMatch(msg.senderEmail ?? "");
  if (c) return `e:${c}`;
  return `s:${normalizeThreadSenderLabel(msg.sender)}`;
}

export function threadParticipantFirstMessageIds(messages: CleanedMessageView[]): Set<string> {
  const asc = sortMessagesByReceivedAscending(messages);
  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const m of asc) {
    const k = threadParticipantDedupKey(m);
    if (seen.has(k)) continue;
    seen.add(k);
    ids.add(m.messageId);
  }
  return ids;
}

export function isOwnSender(sender: string) {
  const account = currentAccount();
  const s = sender.trim().toLowerCase();
  if (!s) return false;
  const byEmail = account?.email?.trim().toLowerCase();
  const byName = account?.displayName?.trim().toLowerCase();
  return Boolean((byEmail && s === byEmail) || (byName && s === byName) || s === "sarah chen");
}
