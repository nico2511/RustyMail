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
