// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { commitAppShellHtml, resetAppShellMainCache, restoreParkedMain } from "./appShellRenderCommitRun";

beforeEach(() => {
  resetAppShellMainCache();
});

describe("commitAppShellHtml", () => {
  it("garde le nœud de lecture quand seul le chrome change", () => {
    const root = document.createElement("div");
    const main = `<main class="main"><p id="letter">Bonjour</p></main>`;
    const parked = commitAppShellHtml(root, `<aside>liste</aside>${main}<footer>a</footer>`, main, true);
    expect(parked).toBeNull();
    const letter = root.querySelector("#letter");
    expect(letter).not.toBeNull();
    letter?.setAttribute("data-hydrated", "1");

    const again = commitAppShellHtml(root, `<aside>liste</aside>${main}<footer>b</footer>`, main, true);
    expect(again).toBe(letter?.parentElement);
    restoreParkedMain(root, again);
    const kept = root.querySelector("#letter");
    expect(kept).toBe(letter);
    expect(kept?.getAttribute("data-hydrated")).toBe("1");
    expect(root.querySelector("footer")?.textContent).toBe("b");
  });

  it("remplace la colonne quand le fil change", () => {
    const root = document.createElement("div");
    const first = `<main class="main"><p id="letter">Un</p></main>`;
    commitAppShellHtml(root, first, first, true);
    const before = root.querySelector("#letter");
    const second = `<main class="main"><p id="letter">Deux</p></main>`;
    const parked = commitAppShellHtml(root, second, second, true);
    restoreParkedMain(root, parked);
    expect(root.querySelector("#letter")).not.toBe(before);
    expect(root.querySelector("#letter")?.textContent).toBe("Deux");
  });
});
