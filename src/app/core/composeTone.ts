import { state } from "../state";
import type { Tone } from "../types";

export const tones: Tone[] = ["Professional", "Casual", "Assertive", "Empathetic"];

export const toneLabelsFr: Record<Tone, string> = {
  Professional: "Professionnel",
  Casual: "Décontracté",
  Assertive: "Ferme",
  Empathetic: "Empathique",
};

export type RewriteStyleName =
  | "Neutral"
  | "Formal"
  | "Casual"
  | "Concise"
  | "Polite"
  | "Assertive"
  | "Apologetic";

export const SHORTEN_REWRITE_STYLE: RewriteStyleName = "Concise";
export const SHORTEN_LABEL_FR = "Raccourcir";

export function rewriteStyleForTone(tone: string | null | undefined): RewriteStyleName {
  switch (tone) {
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

export function composeRewriteStyleFromTone(): string {
  return rewriteStyleForTone(state.tone);
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

export function toneStyleMappingRows(): { label: string; style: RewriteStyleName }[] {
  const rows = tones.map((t) => ({
    label: toneLabelsFr[t],
    style: rewriteStyleForTone(t),
  }));
  rows.push({ label: SHORTEN_LABEL_FR, style: SHORTEN_REWRITE_STYLE });
  return rows;
}
