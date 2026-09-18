import type { Tag } from "../types";
import { normalizeIso639Primary } from "./threadLangGuessSamples";
import { LANG_GUESS_HINTS } from "./threadLangGuessHints";

export function guessIso6391FromMessageText(raw: string): string | null {
  const sample = raw.slice(0, 4000).toLowerCase().normalize("NFC");
  if (sample.trim().length < 24) return null;

  if (/\p{Script=Han}/u.test(sample)) return "zh";
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(sample)) return "ja";
  if (/\p{Script=Hangul}/u.test(sample)) return "ko";
  if (/\p{Script=Cyrillic}/u.test(sample)) return "ru";
  if (/\p{Script=Arabic}/u.test(sample)) return "ar";
  if (/\p{Script=Greek}/u.test(sample)) return "el";

  const normalized = sample.replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  const blob = ` ${normalized} `;
  let best: string | null = null;
  let bestScore = 0;
  let second = 0;
  for (const [lang, hints] of Object.entries(LANG_GUESS_HINTS)) {
    let s = 0;
    for (const h of hints) {
      if (blob.includes(h)) s += 1;
    }
    if (s > bestScore) {
      second = bestScore;
      bestScore = s;
      best = lang;
    } else if (s > second) {
      second = s;
    }
  }
  if (bestScore < 4) return null;
  if (bestScore - second < 2 && second >= 4) return null;
  return best;
}

export function normalizeDetectedLangIso639(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (!t || t === "und" || t === "unknown" || t === "xxx") return null;
  const two = t.slice(0, 2);
  return /^[a-z]{2}$/.test(two) ? two : null;
}

export function langFromKindTags(tags: Tag[]): string | null {
  for (const t of tags) {
    if (String(t.family).toLowerCase() !== "kind") continue;
    const v = String(t.value).trim().toLowerCase();
    if (!v.startsWith("lang-")) continue;
    const iso = normalizeIso639Primary(v.slice(5));
    if (iso) return iso;
  }
  return null;
}
