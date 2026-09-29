import { rewriteStyleLabelFr } from "./composeTone";

/** Libellés de file LLM lus par la barre du compositeur pour l’état occupé. */
export const COMPOSE_GRAMMAR_JOB = "Orthographe";
export const COMPOSE_REPLIES_JOB = "Réponses rapides";

export function composeRewriteJobLabel(style: string): string {
  return `Réécriture · ${rewriteStyleLabelFr(style)}`;
}

export type ComposeAiBusyKind = "grammar" | "rewrite" | "shorten" | "replies" | "other";

export function composeAiBusyKind(label: string | null): ComposeAiBusyKind | null {
  if (!label) return null;
  if (label === COMPOSE_GRAMMAR_JOB) return "grammar";
  if (label === COMPOSE_REPLIES_JOB) return "replies";
  if (label.startsWith("Réécriture")) {
    return label.endsWith(rewriteStyleLabelFr("Concise")) ? "shorten" : "rewrite";
  }
  return "other";
}
