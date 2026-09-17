import { ENABLE_CLEAN_MESSAGE_VIEW } from "../lib/appUiConstants";
import { escapeHtml } from "../../ui/sanitize";
import { currentAccount } from "../core/accountContext";
import type {
  CleanedMessageView,
  MessageViewMode,
  SummaryResult,
  ThreadParticipantLink,
  ThreadRecipientPresenceEvents,
} from "../types";
import { canonicalEmailForNlMatch } from "./searchAccountResolve";
import { threadIsAutoMail } from "./threadAutoMail";
import {
  sortMessagesByReceivedAscending,
} from "./threadMessageSort";

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

export function repairUtf8Mojibake(s: string): string {
  const t = s ?? "";
  if (!t.includes("Ã") && !t.includes("Â")) return t;
  try {
    const bytes = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) bytes[i] = t.charCodeAt(i) & 0xff;
    const dec = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!dec || dec === t) return t;
    const mojib = (x: string) => (x.match(/Ã.|Â[^\s]/g) ?? []).length;
    return mojib(dec) <= mojib(t) ? dec : t;
  } catch {
    return t;
  }
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

export function repairSummaryResultStrings(o: SummaryResult): SummaryResult {
  return {
    ...o,
    title: repairUtf8Mojibake(String(o.title ?? "")),
    bullets: (o.bullets ?? []).map((b) => repairUtf8Mojibake(String(b))),
  };
}

export function summaryResultToZenText(o: SummaryResult): string {
  const r = repairSummaryResultStrings(o);
  return `${r.title}\n\n${r.bullets.map((bullet) => `- ${bullet}`).join("\n")}`;
}

export function normalizeRecipientEmailForDiff(email: string): string {
  return email.trim().toLowerCase();
}

export function recipientMapForDiff(msg: CleanedMessageView): Map<string, { name?: string | null; email: string }> {
  const m = new Map<string, { name?: string | null; email: string }>();
  for (const r of msg.recipients ?? []) {
    const k = normalizeRecipientEmailForDiff(r.email ?? "");
    if (!k) continue;
    if (!m.has(k)) m.set(k, r);
  }
  return m;
}

export function threadRecipientPresenceEventsByMessageId(
  messages: CleanedMessageView[],
): Map<string, ThreadRecipientPresenceEvents> {
  const asc = sortMessagesByReceivedAscending(messages);
  const firstIndex = new Map<string, number>();
  const lastIndex = new Map<string, number>();
  const firstInfo = new Map<string, { name?: string | null; email: string }>();
  const lastInfo = new Map<string, { name?: string | null; email: string }>();

  const acc = currentAccount();
  const ownEmailLower = acc?.email?.trim().toLowerCase() ?? "";
  const ownCanon = canonicalEmailForNlMatch(acc?.email ?? "") ?? "";
  const isOwnRecipientKey = (k: string): boolean => {
    if (!k) return false;
    if (ownEmailLower && k === ownEmailLower) return true;
    if (ownCanon) {
      const kCanon = canonicalEmailForNlMatch(k);
      if (kCanon) return kCanon === ownCanon;
    }
    return false;
  };

  // Certains messages n’ont pas d’enveloppe To/Cc remontée (recipients absent/vides).
  // On évite de générer de faux "+ To/Cc" en prenant le 1er message avec enveloppe connue comme baseline.
  let firstKnownIdx = -1;
  let lastKnownIdx = -1;
  let maxEnvelopeSize = 0;

  for (let i = 0; i < asc.length; i++) {
    const msg = asc[i]!;
    const env = recipientMapForDiff(msg);
    if (env.size > maxEnvelopeSize) maxEnvelopeSize = env.size;
    if (env.size === 0) continue;
    if (firstKnownIdx < 0) firstKnownIdx = i;
    lastKnownIdx = i;
    for (const [k, r] of env) {
      if (isOwnRecipientKey(k)) continue;
      if (!firstIndex.has(k)) {
        firstIndex.set(k, i);
        firstInfo.set(k, r);
      }
      lastIndex.set(k, i);
      lastInfo.set(k, r);
    }
  }

  // En 1-to-1, l’enveloppe To/Cc dépend du sens (entrant vs sortant) et produit des faux “ajouts”.
  // On n’affiche ces événements que si l’enveloppe est réellement "groupe" (≥2 destinataires).
  if (maxEnvelopeSize <= 1) return new Map();

  const out = new Map<string, ThreadRecipientPresenceEvents>();
  const get = (id: string): ThreadRecipientPresenceEvents => {
    const hit = out.get(id);
    if (hit) return hit;
    const created: ThreadRecipientPresenceEvents = { added: [], removed: [] };
    out.set(id, created);
    return created;
  };

  for (const [k, idx] of firstIndex) {
    // Baseline : 1ère enveloppe connue — on ne sait pas ce qui était avant, donc pas d’“ajout”.
    if (idx === firstKnownIdx) continue;
    const msg = asc[idx];
    if (!msg) continue;
    const info = firstInfo.get(k);
    if (!info) continue;
    get(msg.messageId).added.push(info);
  }

  for (const [k, idx] of lastIndex) {
    // Dernière enveloppe connue (ou fin du fil) : ne pas afficher un “retiré” sans preuve.
    if (idx === lastKnownIdx || idx >= asc.length - 1) continue;
    const msg = asc[idx];
    if (!msg) continue;
    const info = lastInfo.get(k);
    if (!info) continue;
    get(msg.messageId).removed.push(info);
  }

  return out;
}

export function threadTreeLaneRight(thread: { messages: CleanedMessageView[] }, message: CleanedMessageView): { isRoot: boolean; laneRight: boolean } {
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



export function zenSummaryHtmlFragments(text: string): string {
  const lines = repairUtf8Mojibake(text).replace(/\r\n/g, "\n").split("\n");
  const chunks: string[] = [];
  let inList = false;
  const closeList = (): void => {
    if (!inList) return;
    chunks.push("</ul>");
    inList = false;
  };
  for (const line of lines) {
    const t = line.trim();
    if (/^[-•]\s+/.test(t)) {
      if (!inList) {
        chunks.push('<ul class="thread-zen-list">');
        inList = true;
      }
      chunks.push(`<li>${escapeHtml(t.replace(/^[-•]\s+/, ""))}</li>`);
    } else if (t) {
      closeList();
      chunks.push(`<p class="thread-zen-par">${escapeHtml(t)}</p>`);
    }
  }
  closeList();
  return chunks.join("") || `<p class="thread-zen-par">${escapeHtml(text)}</p>`;
}

export function normalizeForCleanCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function hasStructuredHtmlCleaningProvider(message: CleanedMessageView): boolean {
  const p = message.htmlCleaningProvider;
  if (p && p !== "generic") return true;
  const ch = message.cleanedHtmlBody ?? "";
  return (
    ch.includes("rustymail:amazon-digest") ||
    ch.includes("rustymail:deblock-digest") ||
    ch.includes("rustymail:github-digest")
  );
}

export function messagePrefersCleanByDefault(message: CleanedMessageView): boolean {
  if (hasStructuredHtmlCleaningProvider(message)) return true;

  const ch = message.cleanedHtmlBody?.trim();
  const hb = message.htmlBody?.trim();
  if (hb && ch) {
    return normalizeForCleanCompare(ch) !== normalizeForCleanCompare(hb);
  }

  const st = message.sourceText.trim();
  const ct = (message.cleanedText ?? "").trim();
  if (!ct) return false;
  return normalizeForCleanCompare(ct) !== normalizeForCleanCompare(st);
}

export function effectiveMessageViewMode(message: CleanedMessageView, userMode: MessageViewMode): MessageViewMode {
  if (!ENABLE_CLEAN_MESSAGE_VIEW) return "original";
  if (userMode === "original") return "original";
  return messagePrefersCleanByDefault(message) ? "clean" : "original";
}

export function threadSuppressAutoEnvelopeMeta(
  thread: { isNewsletterThread?: boolean },
  message: CleanedMessageView,
  nlListedHere: boolean
): boolean {
  return threadIsAutoMail(thread) || Boolean(message.isNewsletter) || nlListedHere;
}
export function isOwnSender(sender: string) {
  const account = currentAccount();
  const s = sender.trim().toLowerCase();
  if (!s) return false;
  const byEmail = account?.email?.trim().toLowerCase();
  const byName = account?.displayName?.trim().toLowerCase();
  return Boolean((byEmail && s === byEmail) || (byName && s === byName) || s === "sarah chen");
}

