import type { AppPrefs } from "./prefs_defaults";

export function captureAppearanceFieldsFromDom(target: AppPrefs): void {
  // Ne mettre à jour un champ que si son contrôle est monté (ex. onglet Apparence).
  // Sur l’onglet IA, `#prefs-color-scheme` est absent : un fallback sur le défaut
  // « light » écraserait un thème sombre déjà enregistré (bug « Tester la connexion »).
  const schemeSel = document.querySelector<HTMLSelectElement>("#prefs-color-scheme");
  if (schemeSel) {
    const rawScheme = schemeSel.value?.trim() ?? "light";
    target.general.colorScheme =
      rawScheme === "dark" || rawScheme === "system" || rawScheme === "light" ? rawScheme : "light";
  }

  const sessionCb = document.querySelector<HTMLInputElement>("#prefs-session-comfort");
  if (sessionCb) target.general.sessionComfort = Boolean(sessionCb.checked);

  const contrastCb = document.querySelector<HTMLInputElement>("#prefs-contrast-plus");
  if (contrastCb) target.general.contrastPlus = Boolean(contrastCb.checked);

  const lavenderCb = document.querySelector<HTMLInputElement>("#prefs-accent-lavender");
  if (lavenderCb) target.general.accentLavender = Boolean(lavenderCb.checked);
}
