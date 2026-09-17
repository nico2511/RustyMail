import type { CleanedMessageView, Tag } from "../types";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { messagePlainSampleForLangGuess, normalizeIso639Primary } from "./threadLangGuessSamples";

export const LANG_GUESS_HINTS: Readonly<Record<string, readonly string[]>> = {
  fr: [
    " le ",
    " la ",
    " les ",
    " l'",
    " un ",
    " une ",
    " des ",
    " du ",
    " de ",
    " et ",
    " est ",
    " que ",
    " qui ",
    " pour ",
    " dans ",
    " pas ",
    " avec ",
    " sur ",
    " par ",
    " vous ",
    " nous ",
    " été ",
    " tout ",
    " comme ",
    " salut ",
    " comment ",
    " vas ",
    " peux ",
    " veux ",
    " faire ",
    " cette ",
    " merci ",
    " bonjour ",
    " mais ",
    " aussi ",
    " leur ",
    " aux ",
    " je ",
    " te ",
    " tu ",
    " moi ",
    " mon ",
    " ma ",
    " mes ",
    " son ",
    " sa ",
    " ses ",
    " ce ",
    " ces ",
    " ou ",
    " où ",
    " très ",
    " plus ",
    " bien ",
    " s'il ",
    " n'est ",
    " d'un ",
    " d'une ",
  ],
  en: [
    " the ",
    " and ",
    " that ",
    " this ",
    " with ",
    " from ",
    " have ",
    " were ",
    " been ",
    " are ",
    " was ",
    " for ",
    " not ",
    " you ",
    " they ",
    " your ",
    " what ",
    " when ",
    " will ",
    " would ",
    " there ",
    " could ",
    " about ",
    " hello ",
    " thanks ",
    " please ",
    " does ",
    " how ",
    " it's ",
    " don't ",
    " i'm ",
    " we ",
    " our ",
    " has ",
    " had ",
  ],
  it: [
    " il ",
    " la ",
    " lo ",
    " gli ",
    " le ",
    " un ",
    " una ",
    " uno ",
    " per ",
    " con ",
    " che ",
    " non ",
    " sono ",
    " questo ",
    " anche ",
    " dalla ",
    " nella ",
    " grazie ",
    " ciao ",
    " buongiorno ",
    " come ",
    " molto ",
    " tutto ",
    " stato ",
    " hai ",
    " ho ",
    " mi ",
    " ti ",
    " era ",
    " suo ",
    " sua ",
    " degli ",
    " delle ",
    " quando ",
    " dove ",
  ],
  de: [
    " der ",
    " die ",
    " das ",
    " und ",
    " nicht ",
    " mit ",
    " von ",
    " den ",
    " dem ",
    " ein ",
    " eine ",
    " ist ",
    " auf ",
    " für ",
    " wie ",
    " auch ",
    " als ",
    " an ",
    " des ",
    " zu ",
    " sie ",
    " wir ",
    " ich ",
    " noch ",
    " nur ",
    " oder ",
    " wenn ",
    " aber ",
    " guten ",
    " danke ",
    " hallo ",
    " haben ",
    " sein ",
  ],
  es: [
    " el ",
    " la ",
    " los ",
    " las ",
    " de ",
    " que ",
    " y ",
    " en ",
    " para ",
    " con ",
    " una ",
    " un ",
    " por ",
    " no ",
    " como ",
    " más ",
    " su ",
    " del ",
    " se ",
    " ha ",
    " está ",
    " yo ",
    " hola ",
    " gracias ",
    " muy ",
    " todo ",
    " este ",
    " esta ",
    " también ",
  ],
  pt: [
    " o ",
    " a ",
    " os ",
    " as ",
    " de ",
    " e ",
    " do ",
    " da ",
    " dos ",
    " das ",
    " em ",
    " com ",
    " não ",
    " um ",
    " uma ",
    " para ",
    " por ",
    " que ",
    " se ",
    " como ",
    " mais ",
    " seu ",
    " obrigado ",
    " olá ",
    " bom ",
    " está ",
    " tem ",
  ],
};

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

export function shouldOfferPerMessageTranslate(
  message: CleanedMessageView,
  motherLangRaw: string,
  threadTags?: Tag[]
): boolean {
  if (!isTauriRuntime()) return false;
  const mother = normalizeIso639Primary(motherLangRaw || "fr");

  const fromTags = langFromKindTags(message.tags) ?? (threadTags?.length ? langFromKindTags(threadTags) : null);
  if (fromTags && fromTags === mother) return false;

  const fromDb = normalizeDetectedLangIso639(message.detectedLang);
  if (fromDb) {
    return fromDb !== mother;
  }

  const plain = messagePlainSampleForLangGuess(message);
  if (plain.trim().length < 24) return false;

  const guess = guessIso6391FromMessageText(plain);
  if (guess === null) return false;
  return guess !== mother;
}

export function shouldOfferThreadTranslate(
  thread: { messages: CleanedMessageView[]; tags?: Tag[] },
  motherLangRaw: string,
): boolean {
  if (!isTauriRuntime()) return false;
  const mother = motherLangRaw || "fr";
  return thread.messages.some((m) => shouldOfferPerMessageTranslate(m, mother, thread.tags));
}
