/** Insert agent-generated reply text into compose (scheduling slot formatting). */

import type { AssistSlot } from "../../assistAgent";

function parseSlotComponents(isoLocal: string): { y: number; mo: number; d: number; h: number; mi: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(isoLocal.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  return { y, mo, d, h, mi };
}

/** Libellé créneau structuré (heure murale affichée via UTC, indépendamment du fuseau machine). */
export function formatAssistSlotLabel(slot: AssistSlot, locale: string): string | null {
  const start = parseSlotComponents(slot.start);
  const end = parseSlotComponents(slot.end);
  if (!start || !end) return null;
  let loc = locale.trim() || "fr";
  try {
    const fmt = new Intl.DateTimeFormat(loc, {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const startLabel = fmt.format(Date.UTC(start.y, start.mo - 1, start.d, start.h, start.mi));
    const endTime = new Intl.DateTimeFormat(loc, {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    }).format(Date.UTC(end.y, end.mo - 1, end.d, end.h, end.mi));
    const tz = slot.timezone.trim() || "Europe/Paris";
    return `${startLabel}–${endTime} (${tz})`;
  } catch (e) {
    if (e instanceof RangeError) {
      try {
        const fmt = new Intl.DateTimeFormat("fr", {
          timeZone: "UTC",
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        const startLabel = fmt.format(Date.UTC(start.y, start.mo - 1, start.d, start.h, start.mi));
        const endTime = new Intl.DateTimeFormat("fr", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
        }).format(Date.UTC(end.y, end.mo - 1, end.d, end.h, end.mi));
        const tz = slot.timezone.trim() || "Europe/Paris";
        return `${startLabel}–${endTime} (${tz})`;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function formatAgentSlotsParagraph(slotsText: string): string {
  const lines = slotsText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  if (lines.length === 1) return `Je vous propose le créneau suivant : ${lines[0]}.`;
  return `Je vous propose les créneaux suivants :\n${lines.map((l) => `· ${l}`).join("\n")}`;
}

export function appendSchedulingSlotsToDraft(draft: string, slotsText: string): string {
  const d = draft.trimEnd();
  const block = formatAgentSlotsParagraph(slotsText);
  if (!block) return d;

  const signOffRe =
    /\n(\s*(?:Bien\s+)?cordialement\s*,?|Bien\s+à\s+vous\s*,?|Salutations\s+(?:distinguées\s+)?,?|Cordialement\s*,?|Regards\s*,?|Cdlt\.?\s*,?|Merci(?:\s+par\s+avance)?\s*,?)\s*$/i;
  const m = d.match(signOffRe);
  if (m?.index !== undefined) {
    const before = d.slice(0, m.index).trimEnd();
    const after = d.slice(m.index + 1).trimStart();
    return `${before}\n\n${block}\n\n${after}`;
  }

  const paras = d.split(/\n\n+/);
  if (paras.length >= 2) {
    const last = paras[paras.length - 1]!.trim();
    if (
      /^(?:bien\s+)?cordialement\s*,?$/i.test(last) ||
      /^salutations/i.test(last) ||
      /^merci\s*$/i.test(last)
    ) {
      return `${paras.slice(0, -1).join("\n\n")}\n\n${block}\n\n${last}`;
    }
  }

  return `${d}\n\n${block}`;
}
