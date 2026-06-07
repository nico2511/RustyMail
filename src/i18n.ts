import fr from "./locales/fr.json";
import en from "./locales/en.json";

export type UiLocale = "fr" | "en";

const PACKS: Record<UiLocale, Record<string, string>> = {
  fr: flattenMessages(fr as Record<string, unknown>),
  en: flattenMessages(en as Record<string, unknown>),
};

let currentLocale: UiLocale = "fr";

function flattenMessages(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out[key] = v;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenMessages(v as Record<string, unknown>, key));
    }
  }
  return out;
}

/** UI language from mother_language pref: fr* → fr, en* → en, else en. */
export function resolveUiLocale(motherLanguage: string): UiLocale {
  const raw = motherLanguage.trim().toLowerCase();
  if (raw.startsWith("fr")) return "fr";
  if (raw.startsWith("en")) return "en";
  return "en";
}

/** BCP 47 tag for dates/numbers. */
export function localeTag(locale: UiLocale = currentLocale): string {
  return locale === "fr" ? "fr-FR" : "en-US";
}

export function getUiLocale(): UiLocale {
  return currentLocale;
}

export function setLocale(motherLanguage: string): UiLocale {
  currentLocale = resolveUiLocale(motherLanguage);
  if (typeof document !== "undefined") {
    document.documentElement.lang = localeTag(currentLocale);
  }
  return currentLocale;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  let s = template;
  for (const [k, v] of Object.entries(params)) {
    const needle = `{${k}}`;
    s = s.split(needle).join(String(v));
  }
  return s;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const pack = PACKS[currentLocale];
  let s = pack[key] ?? PACKS.en[key] ?? PACKS.fr[key] ?? key;
  if (params) return interpolate(s, params);
  return s;
}
