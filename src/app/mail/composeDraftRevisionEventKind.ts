/** Libellé d’événement pour la prochaine révision auto (consommé au save). */
let pendingEventKind: string | null = null;

export function setPendingDraftRevisionEventKind(kind: string): void {
  const t = kind.trim().toLowerCase();
  pendingEventKind = t || null;
}

/** Lit et efface le kind en attente (défaut `edit`). */
export function takePendingDraftRevisionEventKind(): string {
  const k = pendingEventKind?.trim() || "edit";
  pendingEventKind = null;
  return k;
}

export function draftRevisionEventKindLabelFr(kind: string | undefined | null): string {
  switch ((kind ?? "edit").trim().toLowerCase()) {
    case "rewrite":
      return "Réécriture";
    case "shorten":
      return "Raccourci";
    case "tone":
      return "Changement de ton";
    case "grammar":
      return "Correction";
    case "attachments":
      return "Pièces jointes";
    case "restore":
      return "Restauration";
    case "edit":
    default:
      return "Édition";
  }
}

export function formatCharsDelta(delta: number | undefined | null): string {
  const n = Number(delta ?? 0);
  if (!Number.isFinite(n) || n === 0) return "±0";
  return n > 0 ? `+${n}` : `${n}`;
}
