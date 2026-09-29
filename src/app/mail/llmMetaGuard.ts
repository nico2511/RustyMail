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
