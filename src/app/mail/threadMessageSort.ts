import type { CleanedMessageView } from "../types";

export function parseMaybeDate(value: string): Date | null {
  const raw = String(value).trim();
  if (!raw || raw === "—" || raw === "-" || raw === "–") return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

export function formatThreadCompactClock(receivedAt: string): string {
  const d = parseMaybeDate(receivedAt);
  if (!d) return receivedAt.trim() || "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function sortMessagesByReceivedAscending(messages: CleanedMessageView[]): CleanedMessageView[] {
  return sortMessagesByReceivedAt(messages, "asc");
}

export function sortMessagesByReceivedDescending(messages: CleanedMessageView[]): CleanedMessageView[] {
  return sortMessagesByReceivedAt(messages, "desc");
}

export function sortMessagesByReceivedAt(messages: CleanedMessageView[], direction: "asc" | "desc"): CleanedMessageView[] {
  const cmp = direction === "asc" ? 1 : -1;
  const indexed = messages.map((m, index) => ({ m, index, t: parseMaybeDate(m.receivedAt)?.getTime() ?? Number.NaN }));
  indexed.sort((a, b) => {
    const aOk = Number.isFinite(a.t);
    const bOk = Number.isFinite(b.t);
    if (aOk && bOk && a.t !== b.t) return cmp * (a.t - b.t);
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    const idCmp = a.m.messageId.localeCompare(b.m.messageId);
    if (idCmp !== 0) return direction === "asc" ? idCmp : -idCmp;
    return a.index - b.index;
  });
  return indexed.map((x) => x.m);
}

export function formatThreadReadingWhen(receivedAt: string): string {
  const d = parseMaybeDate(receivedAt);
  if (!d) return receivedAt;
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).replace(/\.$/, "");
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  // Heure d’abord pour une lecture chronologique évidente (puis jour).
  return `${time} · ${day}`;
}

export function receivedAtIsoDatetime(receivedAt: string): string {
  const d = parseMaybeDate(receivedAt);
  return d ? d.toISOString() : "";
}
