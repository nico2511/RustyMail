import type { CleanedMessageView } from "../types";

export function messagePlainSampleForLangGuess(message: CleanedMessageView): string {
  const raw = (message.cleanedText || message.sourceText || "").trim();
  if (!raw) return "";
  return raw.slice(0, 4000);
}

export function normalizeIso639Primary(langRaw: string): string {
  const t = langRaw.trim().toLowerCase();
  if (t.length < 2) return "fr";
  const two = t.slice(0, 2);
  return /^[a-z]{2}$/.test(two) ? two : "fr";
}
