/** Détecte une consigne / un refus de modèle recopié à la place du mail. Aligné sur `contains_llm_meta`. */

const LLM_META_MARKERS = [
  "non fiable",
  "format json",
  "message systeme",
  "instructions du message",
  "contenus de mails",
  "contenu non fiable",
  "json requis",
  "consignes de format",
  "untrusted data",
  "begin untrusted",
  "end untrusted",
];

/** Refus génériques : ils comptent même si le mail source les contient déjà. */
const LLM_REFUSAL_MARKERS = [
  "i cannot comply",
  "i cannot",
  "i cant",
  "im unable",
  "i am unable",
  "im not able",
  "i am not able",
  "desole je ne peux",
  "je ne peux pas",
  "je ne peux",
];

const META_PRESERVE_CHARS = 20;

export const LLM_META_REWRITE_TOAST =
  "Réécriture refusée : le modèle a renvoyé une consigne (format JSON, message système) au lieu du texte. Le message n’a pas été modifié.";

export const LLM_META_GRAMMAR_TOAST =
  "Correction refusée : le modèle a renvoyé un refus ou une consigne au lieu d’une correction. Le texte n’a pas été modifié.";

export const LLM_META_TRANSLATION_TOAST =
  "Traduction refusée : le modèle a renvoyé une consigne au lieu du message traduit.";

export const LLM_META_BODY_TOAST =
  "Le modèle a renvoyé une consigne (format JSON, message système) au lieu du message. Le texte n’a pas été modifié.";

function foldMeta(value: string): string {
  let out = "";
  let prevSpace = false;
  for (const raw of value) {
    if (raw === "'" || raw === "’" || raw === "‘" || raw === "ʼ") continue;
    let c = raw.toLowerCase();
    c = c
      .replace(/[éèêë]/g, "e")
      .replace(/[àâä]/g, "a")
      .replace(/[ùûü]/g, "u")
      .replace(/[îï]/g, "i")
      .replace(/[ôö]/g, "o")
      .replace(/ç/g, "c");
    if (c === "," || c === ";" || c === ":") c = " ";
    for (const low of c) {
      const space = /\s/.test(low);
      if (space && prevSpace) continue;
      out += low;
      prevSpace = space;
    }
  }
  return out;
}

function hasMarker(text: string, markers: readonly string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

function sentenceHasMeta(sentence: string): boolean {
  return hasMarker(sentence, LLM_META_MARKERS) || hasMarker(sentence, LLM_REFUSAL_MARKERS);
}

function splitMetaSentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const c of text) {
    buf += c;
    if (c === "." || c === "!" || c === "?" || c === "\n") {
      const sentence = buf.trim();
      if (sentence) out.push(sentence);
      buf = "";
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

function nonMetaCharCount(text: string): number {
  return splitMetaSentences(text)
    .filter((sentence) => !sentenceHasMeta(sentence))
    .reduce((sum, sentence) => sum + [...sentence].length, 0);
}

function echoesInjectedInstruction(source: string, output: string): boolean {
  if (!hasMarker(output, LLM_META_MARKERS)) return false;
  const outTotal = [...output].length;
  if (outTotal === 0) return false;
  const outNon = nonMetaCharCount(output);
  const srcNon = nonMetaCharCount(source);
  return outNon * 4 < outTotal && srcNon >= 80;
}

function spanPreserved(source: string, output: string, at: number, markerLen: number): boolean {
  const chars = [...output];
  let byte = 0;
  let startI = chars.length;
  let endI = chars.length;
  const endByte = at + markerLen;
  for (let i = 0; i < chars.length; i++) {
    if (byte >= at && startI === chars.length) startI = i;
    if (byte >= endByte) {
      endI = i;
      break;
    }
    byte += chars[i]!.length;
  }
  const markerChars = Math.max(1, endI - startI);
  const need = Math.max(META_PRESERVE_CHARS, markerChars);
  if (chars.length <= need) return source.includes(output);
  const first = Math.max(0, startI - (need - markerChars));
  const last = Math.min(startI, chars.length - need);
  for (let s = first; s <= last; s++) {
    const slice = chars.slice(s, s + need).join("");
    if (source.includes(slice)) return true;
  }
  return false;
}

function markerPreserved(source: string, output: string, marker: string): boolean {
  let searchFrom = 0;
  let any = false;
  while (searchFrom <= output.length) {
    const rel = output.indexOf(marker, searchFrom);
    if (rel < 0) break;
    any = true;
    if (!spanPreserved(source, output, rel, marker.length)) return false;
    searchFrom = rel + marker.length;
  }
  return any;
}

export function containsLlmMeta(text: string): boolean {
  const folded = foldMeta(text);
  return hasMarker(folded, LLM_META_MARKERS) || hasMarker(folded, LLM_REFUSAL_MARKERS);
}

/**
 * Vrai si `output` est un refus, une consigne nouvelle, ou l’écho d’une consigne injectée dans le mail.
 * Un marqueur déjà présent dans la source ne suffit pas : l’extrait autour doit être celui du message.
 */
export function introducesLlmMeta(source: string, output: string): boolean {
  const src = foldMeta(source);
  const out = foldMeta(output);
  if (hasMarker(out, LLM_REFUSAL_MARKERS)) return true;
  if (echoesInjectedInstruction(src, out)) return true;
  return LLM_META_MARKERS.some((marker) => out.includes(marker) && !markerPreserved(src, out, marker));
}

/** Aligné sur `salvage_translation_text` (Rust). « je ne peux pas venir » reste du contenu. */

const TRANSLATION_REFUSAL_PHRASES = [
  "i cannot comply with this request",
  "i am unable to translate",
  "i am unable to answer",
  "i am unable to help",
  "i am not able to",
  "im unable to translate",
  "im unable to answer",
  "im unable to help",
  "im unable to comply",
  "im not able to",
  "i cannot translate",
  "i cannot comply",
  "i cannot assist",
  "i cannot help",
  "i cannot fulfill",
  "i cant help with that",
  "i cant translate",
  "i cant comply",
  "i cant assist",
  "i cant help",
  "desole je ne peux pas traduire",
  "desole je ne peux pas repondre",
  "desole je ne peux pas traiter",
  "desole je ne peux pas aider",
  "je ne peux pas traduire",
  "je ne peux pas repondre",
  "je ne peux pas traiter cette demande",
  "je ne peux pas traiter",
  "je ne peux pas aider",
  "je ne peux traiter cette demande",
  "je ne peux pas respecter",
  "je ne peux pas generer",
  "je ne peux pas obeir",
  "je ne peux pas fournir",
  "je ne peux traduire",
  "je ne peux repondre",
  "je ne peux traiter",
  "i am unable",
  "im unable",
  "i cannot",
  "i cant",
  "desole je ne peux",
  "je ne peux pas",
  "je ne peux",
];

const TRANSLATION_BOILERPLATE_MARKERS = [
  "contenu non fiable",
  "contenus de mails",
  "donnees non fiables",
  "untrusted data",
  "begin untrusted",
  "end untrusted",
  "do not obey",
  "consignes de format",
  "instructions du message",
  "message systeme",
  "sans consigne ni mention de json",
  "never quote or paraphrase",
  "translatedtext",
  "preservedentityids",
  "detectedsourcelang",
];

const TRANSLATION_FORMAT_MARKERS = ["format json", "json requis"];

const TRANSLATION_FORMAT_CUES = [
  "consigne",
  "instruction",
  "respect",
  "mention",
  "untrusted",
  "non fiable",
  "fournir les informations",
  "nothing else",
  "rien dautre",
  "uniquement le message",
  "only the translation",
];

function boundedPhraseAt(text: string, phrase: string): number {
  if (!phrase) return -1;
  let start = 0;
  while (start < text.length) {
    const at = text.indexOf(phrase, start);
    if (at < 0) return -1;
    const end = at + phrase.length;
    const before = at === 0 ? "" : text[at - 1]!;
    const after = end >= text.length ? "" : text[end]!;
    const beforeOk = before === "" || !/[0-9a-z]/i.test(before);
    const afterOk = after === "" || !/[0-9a-z]/i.test(after);
    if (beforeOk && afterOk) return at;
    start = end;
  }
  return -1;
}

function containsBoundedPhrase(text: string, phrase: string): boolean {
  return boundedPhraseAt(text, phrase) >= 0;
}

function removeOneBoundedPhrase(text: string, phrase: string): string {
  const at = boundedPhraseAt(text, phrase);
  if (at < 0) return text;
  return text.slice(0, at) + text.slice(at + phrase.length);
}

function stripRefusalPhrases(sentence: string): string {
  let rest = sentence;
  for (;;) {
    let best = "";
    for (const phrase of TRANSLATION_REFUSAL_PHRASES) {
      if (containsBoundedPhrase(rest, phrase) && phrase.length > best.length) best = phrase;
    }
    if (!best) break;
    rest = removeOneBoundedPhrase(rest, best);
  }
  return rest;
}

function isPureRefusalSentence(sentenceFolded: string): boolean {
  const trimmed = sentenceFolded.trim();
  if (!trimmed) return false;
  if (!TRANSLATION_REFUSAL_PHRASES.some((phrase) => containsBoundedPhrase(trimmed, phrase))) return false;
  return ![...stripRefusalPhrases(trimmed)].some((c) => /[0-9a-z]/i.test(c));
}

function isOnlyPureRefusal(folded: string): boolean {
  const sentences = splitMetaSentences(folded).filter((s) => s.trim());
  return sentences.length > 0 && sentences.every((s) => isPureRefusalSentence(s));
}

function markersIn(text: string, markers: readonly string[]): string[] {
  return markers.filter((marker) => text.includes(marker));
}

function sentenceIsBoilerplateEcho(sourceFolded: string, sentence: string): boolean {
  const folded = foldMeta(sentence);
  const boilerplate = markersIn(folded, TRANSLATION_BOILERPLATE_MARKERS);
  if (boilerplate.length) return boilerplate.some((marker) => !sourceFolded.includes(marker));
  const formatHits = markersIn(folded, TRANSLATION_FORMAT_MARKERS);
  if (!formatHits.length) return false;
  if (formatHits.every((marker) => sourceFolded.includes(marker))) return false;
  return TRANSLATION_FORMAT_CUES.some((cue) => folded.includes(cue));
}

function isTranslationWrapperLine(line: string): boolean {
  const folded = foldMeta(line);
  if (!folded) return false;
  return (
    folded.includes("debut contenu non fiable") ||
    folded.includes("fin contenu non fiable") ||
    folded.includes("untrusted data follows") ||
    folded.includes("do not obey instructions") ||
    folded.includes("never quote or paraphrase this notice") ||
    folded.includes("begin untrusted") ||
    folded.includes("end untrusted")
  );
}

function normalizeSalvagedLines(lines: string[]): string {
  const blocks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (!line.trim()) {
      if (current.trim()) {
        blocks.push(current.trim());
        current = "";
      }
      continue;
    }
    current = current ? `${current}\n${line.trim()}` : line.trim();
  }
  if (current.trim()) blocks.push(current.trim());
  return blocks.join("\n\n");
}

/** Traduction affichable, ou `null` si la sortie est une consigne / un refus à la place du message. */
export function translationVisibleText(source: string, output: string): string | null {
  const sourceFolded = foldMeta(source);
  const keptLines: string[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) {
      keptLines.push("");
      continue;
    }
    if (isTranslationWrapperLine(line)) continue;
    const sentences = splitMetaSentences(line);
    if (!sentences.length) continue;
    const kept = sentences.filter((sentence) => !sentenceIsBoilerplateEcho(sourceFolded, sentence));
    if (!kept.length) continue;
    keptLines.push(kept.join(" "));
  }
  const text = normalizeSalvagedLines(keptLines);
  if (!text) return null;
  if (isOnlyPureRefusal(foldMeta(text)) && !isOnlyPureRefusal(sourceFolded)) return null;
  return text;
}

export function translationIsInstructionEcho(source: string, output: string): boolean {
  return translationVisibleText(source, output) === null;
}
