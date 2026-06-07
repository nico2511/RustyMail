/** Échappement HTML pour contenu texte (pas les attributs seuls). */
export function escapeHtml(value: unknown): string {
  const text = value == null ? "" : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Échappement pour valeurs d’attributs HTML (guillemets, apostrophes, sauts de ligne). */
export function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, " ");
}

