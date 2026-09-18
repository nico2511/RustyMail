import type { SummaryResult } from "../types";

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
