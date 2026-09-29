import type { SummaryResult } from "../types";
import { isNoiseBullet, salvageSummaryFields, SUMMARY_PARSE_FAILED_FR } from "./threadSummaryFormat";

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
  const joined = [r.title, ...r.bullets.map((bullet) => `- ${bullet}`)].join("\n");
  const salvaged = salvageSummaryFields(joined);
  if (salvaged && (salvaged.title || salvaged.bullets.length)) {
    const lines: string[] = [];
    if (salvaged.title) lines.push(salvaged.title);
    for (const bullet of salvaged.bullets) lines.push(`- ${bullet}`);
    return lines.join("\n");
  }
  const bullets = r.bullets.map((b) => b.trim()).filter((b) => b && !isNoiseBullet(b));
  const lines: string[] = [];
  const title = r.title.trim();
  if (title && !isNoiseBullet(title)) lines.push(title);
  if (!bullets.length && r.bullets.some((b) => b.trim())) lines.push(SUMMARY_PARSE_FAILED_FR);
  for (const bullet of bullets) lines.push(`- ${bullet}`);
  return lines.join("\n");
}
