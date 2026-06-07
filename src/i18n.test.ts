import { describe, expect, it } from "vitest";
import { resolveUiLocale, setLocale, t } from "./i18n";

describe("resolveUiLocale", () => {
  it("maps French codes to fr", () => {
    expect(resolveUiLocale("fr")).toBe("fr");
    expect(resolveUiLocale("fr-FR")).toBe("fr");
  });
  it("maps English codes to en", () => {
    expect(resolveUiLocale("en")).toBe("en");
    expect(resolveUiLocale("en-US")).toBe("en");
  });
  it("falls back to en for other mother languages", () => {
    expect(resolveUiLocale("de")).toBe("en");
    expect(resolveUiLocale("it")).toBe("en");
  });
});

describe("t", () => {
  it("interpolates params", () => {
    setLocale("fr");
    expect(t("common.save")).toBe("Enregistrer");
    setLocale("en");
    expect(t("settings.title")).toBe("Settings");
    setLocale("en");
    expect(t("prompts.outputLanguageHint", { lang: "fr" })).toContain("fr");
  });
});
