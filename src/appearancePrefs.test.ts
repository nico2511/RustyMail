// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { captureAppearanceFieldsFromDom } from "./appearancePrefs";
import { defaultAppPrefs } from "./prefs_defaults";

describe("captureAppearanceFieldsFromDom", () => {
  it("ne réécrit pas colorScheme quand le select Apparence est absent (onglet IA)", () => {
    document.body.innerHTML = `<div data-settings-ai></div>`;
    const prefs = defaultAppPrefs();
    prefs.general.colorScheme = "dark";

    captureAppearanceFieldsFromDom(prefs);

    expect(prefs.general.colorScheme).toBe("dark");
  });

  it("lit colorScheme quand le select est monté", () => {
    document.body.innerHTML = `
      <select id="prefs-color-scheme">
        <option value="light" selected>Clair</option>
        <option value="dark">Sombre</option>
      </select>`;
    const prefs = defaultAppPrefs();
    prefs.general.colorScheme = "dark";

    captureAppearanceFieldsFromDom(prefs);

    expect(prefs.general.colorScheme).toBe("light");
  });
});
