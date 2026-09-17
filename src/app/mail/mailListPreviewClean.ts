/** Nettoie l’aperçu liste (HTML/CSS bruit) pour affichage texte. */
export function cleanThreadListPreview(raw: string): string {
  let s = String(raw ?? "");
  s = s.replace(/<[^>]*>/g, " ");
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/[^{]{0,120}\{[^}]{0,600}\}/g, " ");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 220) s = `${s.slice(0, 220).trim()}…`;
  return s;
}
