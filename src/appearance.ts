import type { AppPrefsGeneral } from "./prefs_defaults";

export type EffectiveColorScheme = "light" | "dark";

const SCHEME_VALUES = new Set(["light", "dark", "system"]);

export function resolveEffectiveColorScheme(general: AppPrefsGeneral): EffectiveColorScheme {
  const raw = general.colorScheme ?? "light";
  const scheme = SCHEME_VALUES.has(raw) ? raw : "light";
  if (scheme === "dark") return "dark";
  if (scheme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyAppearanceFromPrefs(general: AppPrefsGeneral): void {
  const dark = resolveEffectiveColorScheme(general) === "dark";
  const sessionOn = general.sessionComfort !== false;
  const contrast = Boolean(general.contrastPlus);
  const lavender = Boolean(general.accentLavender);

  document.body.classList.toggle("clarity-dark", dark);
  document.body.classList.toggle("appearance-bg-dark", dark);
  document.body.classList.toggle("appearance-bg-light", !dark);

  document.body.classList.toggle("clarity-pastel-v020", !dark && !sessionOn);
  document.body.classList.toggle("clarity-session", !dark && sessionOn);

  const lightMods = !dark;
  document.body.classList.toggle("clarity-contrast-plus", lightMods && contrast);
  document.body.classList.toggle("clarity-accent-lavender", lightMods && lavender);

  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

let systemListenerBound = false;

export function ensureAppearanceSystemListener(onChange: () => void): void {
  if (systemListenerBound) return;
  systemListenerBound = true;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => onChange());
}
