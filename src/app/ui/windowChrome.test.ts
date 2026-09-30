// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildAppShellClassName } from "../mail/appShellRenderMarkupRun";
import {
  integratedWindowChromeEnabled,
  renderWindowChromeHtml,
  setWindowChromeMaximized,
  windowChromeMaximized,
} from "./windowChrome";

const off = {
  tauri: false,
  platform: "Linux x86_64",
  userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
  search: "",
  dev: false,
};

describe("integratedWindowChromeEnabled", () => {
  it("s’affiche sur le bureau Windows", () => {
    expect(
      integratedWindowChromeEnabled({
        ...off,
        tauri: true,
        platform: "Win32",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      }),
    ).toBe(true);
  });

  it("reste absent hors Windows ou hors Tauri", () => {
    expect(integratedWindowChromeEnabled(off)).toBe(false);
    expect(integratedWindowChromeEnabled({ ...off, tauri: true, platform: "MacIntel" })).toBe(false);
    expect(
      integratedWindowChromeEnabled({
        ...off,
        tauri: false,
        platform: "Win32",
        userAgent: "Mozilla/5.0 (Windows NT 10.0)",
      }),
    ).toBe(false);
    expect(integratedWindowChromeEnabled({ ...off, tauri: true, platform: "Darwin" })).toBe(false);
  });

  it("autorise un aperçu dev explicite", () => {
    expect(integratedWindowChromeEnabled({ ...off, dev: true, search: "?windowChrome=1" })).toBe(true);
    expect(integratedWindowChromeEnabled({ ...off, dev: false, search: "?windowChrome=1" })).toBe(false);
  });
});

describe("renderWindowChromeHtml", () => {
  it("garde réduire, agrandir et fermer dans la barre, hors de la zone de glisser", () => {
    const html = renderWindowChromeHtml({ maximized: false });
    expect(html).toContain('data-tauri-drag-region');
    expect(html).toContain('data-action="window-minimize"');
    expect(html).toContain('data-action="window-toggle-maximize"');
    expect(html).toContain('data-action="window-close"');
    expect(html).toContain('aria-label="Agrandir"');
    expect(html).not.toContain("is-maximized");
    const drag = html.slice(0, html.indexOf("window-chrome__controls"));
    expect(drag).toContain("data-tauri-drag-region");
    expect(drag).not.toContain("data-action");
  });

  it("bascule le libellé quand la fenêtre est agrandie", () => {
    setWindowChromeMaximized(false);
    expect(windowChromeMaximized()).toBe(false);
    const html = renderWindowChromeHtml({ maximized: true });
    expect(html).toContain('aria-label="Restaurer"');
    expect(html).toContain("is-maximized");
    setWindowChromeMaximized(false);
  });
});

describe("buildAppShellClassName", () => {
  it("réserve une ligne de grille seulement quand le chrome fenêtre est là", () => {
    const base = {
      isCompose: false,
      aiPanelExpanded: true,
      sidebarCollapsed: false,
    };
    expect(buildAppShellClassName({ ...base, windowChrome: false })).not.toContain("has-window-chrome");
    expect(buildAppShellClassName({ ...base, windowChrome: true })).toContain("has-window-chrome");
  });
});
