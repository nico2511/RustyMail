import { state } from "../state";
import type { Tone } from "../types";

export const tones: Tone[] = ["Professional", "Casual", "Assertive", "Empathetic"];

export const toneLabelsFr: Record<Tone, string> = {
  Professional: "Professionnel",
  Casual: "Décontracté",
  Assertive: "Ferme",
  Empathetic: "Empathique",
};

export function composeRewriteStyleFromTone(): string {
  switch (state.tone) {
    case "Professional":
      return "Formal";
    case "Casual":
      return "Casual";
    case "Assertive":
      return "Assertive";
    case "Empathetic":
      return "Polite";
    default:
      return "Neutral";
  }
}

/** Libellé français d’un style `llm_rewrite_compose` (Formal, Concise, …). */
export function rewriteStyleLabelFr(style: string): string {
  switch (style.trim().toLowerCase()) {
    case "formal":
      return "formel";
    case "casual":
      return "décontracté";
    case "concise":
      return "plus court";
    case "polite":
      return "poli";
    case "assertive":
      return "ferme";
    case "apologetic":
      return "d’excuse";
    default:
      return "neutre";
  }
}
