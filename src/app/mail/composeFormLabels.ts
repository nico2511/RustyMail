import type { Draft } from "../types";

export function composeKindTitle(kind?: Draft["kind"]): string {
  switch (kind) {
    case "Reply":
      return "Réponse";
    case "Forward":
      return "Transfert";
    default:
      return "Nouveau message";
  }
}

export function formatDraftRevisionStamp(iso: string): string {
  const raw = iso.trim();
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return raw;
  return new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}
