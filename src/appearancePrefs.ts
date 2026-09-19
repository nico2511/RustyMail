import type { AppPrefs } from "./prefs_defaults";
import { defaultAppPrefs } from "./prefs_defaults";

export function captureAppearanceFieldsFromDom(target: AppPrefs): void {
  const d = defaultAppPrefs().general;
  const schemeSel = document.querySelector<HTMLSelectElement>("#prefs-color-scheme");
  const rawScheme = schemeSel?.value?.trim() ?? d.colorScheme ?? "light";
  target.general.colorScheme =
    rawScheme === "dark" || rawScheme === "system" || rawScheme === "light" ? rawScheme : "light";

  const sessionCb = document.querySelector<HTMLInputElement>("#prefs-session-comfort");
  if (sessionCb) target.general.sessionComfort = Boolean(sessionCb.checked);

  const contrastCb = document.querySelector<HTMLInputElement>("#prefs-contrast-plus");
  if (contrastCb) target.general.contrastPlus = Boolean(contrastCb.checked);

  const lavenderCb = document.querySelector<HTMLInputElement>("#prefs-accent-lavender");
  if (lavenderCb) target.general.accentLavender = Boolean(lavenderCb.checked);
}
