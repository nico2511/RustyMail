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

export const LLM_META_REWRITE_TOAST =
  "Réécriture refusée : le modèle a renvoyé une consigne (format JSON, message système) au lieu du texte. Le message n’a pas été modifié.";

export const LLM_META_GRAMMAR_TOAST =
  "Correction refusée : le modèle a renvoyé un refus ou une consigne au lieu d’une correction. Le texte n’a pas été modifié.";

export const LLM_META_TRANSLATION_TOAST =
  "Traduction refusée : le modèle a renvoyé une consigne au lieu du message traduit.";

function foldMeta(value: string): string {
  return value
    .toLowerCase()
    .replace(/[éèêë]/g, "e")
    .replace(/[àâä]/g, "a")
    .replace(/[ùûü]/g, "u")
    .replace(/[îï]/g, "i")
    .replace(/[ôö]/g, "o")
    .replace(/ç/g, "c");
}

export function containsLlmMeta(text: string): boolean {
  const folded = foldMeta(text);
  return LLM_META_MARKERS.some((marker) => folded.includes(marker));
}

/** Vrai si `output` introduit une consigne absente du brouillon ou du mail source. */
export function introducesLlmMeta(source: string, output: string): boolean {
  const src = foldMeta(source);
  const out = foldMeta(output);
  return LLM_META_MARKERS.some((marker) => out.includes(marker) && !src.includes(marker));
}
