/** Langues proposées pour traduire le brouillon / la sélection (aligné Paramètres → langue mère). */

export type ComposeTranslateLang = {
  /** Code ISO court pour l’API (`fr`, `en`, …). */
  code: string;
  label: string;
};

export const COMPOSE_TRANSLATE_LANGS: readonly ComposeTranslateLang[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
] as const;

/** Normalise `fr-FR` → `fr` pour l’API et le sélecteur. */
export function normalizeComposeTranslateLang(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return "fr";
  const primary = t.split(/[-_]/)[0] || "fr";
  if (COMPOSE_TRANSLATE_LANGS.some((l) => l.code === primary)) return primary;
  return primary.slice(0, 8) || "fr";
}

export function composeTranslateLangLabel(code: string): string {
  const n = normalizeComposeTranslateLang(code);
  return COMPOSE_TRANSLATE_LANGS.find((l) => l.code === n)?.label ?? n;
}
