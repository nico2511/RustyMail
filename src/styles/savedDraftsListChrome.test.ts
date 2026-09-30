// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function readCss(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

function installAppCss(doc: Document) {
  const tokens = readCss("src/styles/tokens.css");
  const appearance = readCss("src/styles/appearance.css");
  const base = readCss("src/styles.css").replace(/@import\s+["'][^"']+["'];/g, "");
  const shell = readCss("src/styles/productivity-shell.css");
  const wave2 = readCss("src/styles/productivity-wave2.css");
  const style = doc.createElement("style");
  style.textContent = `${tokens}\n${appearance}\n${base}\n${shell}\n${wave2}`;
  doc.head.appendChild(style);
}

describe("liste Sauvés sans filet collé à la carte", () => {
  it("retire le filet d’en-tête et le cadre au-dessus du premier brouillon", () => {
    installAppCss(document);
    document.body.className = "clarity-dark appearance-bg-dark";
    document.body.innerHTML = `
      <section class="thread-view inbox-index inbox-index--sauves">
        <header class="inbox-appbar">
          <h1 class="inbox-mailbox-title">Sauvés</h1>
        </header>
        <div class="inbox-panel surface">
          <div class="inbox-thread-list">
            <div class="thread-row inbox-thread-row thread-row--saved-local">
              <button type="button" class="thread-row-main inbox-thread-row-main">Salut ça va ?</button>
            </div>
          </div>
          <div class="inbox-panel-footer">local</div>
        </div>
      </section>`;

    const appbar = document.querySelector(".inbox-appbar");
    const panel = document.querySelector(".inbox-panel");
    const row = document.querySelector(".thread-row");
    const footer = document.querySelector(".inbox-panel-footer");
    expect(appbar && panel && row && footer).toBeTruthy();

    const appbarStyle = getComputedStyle(appbar!);
    const panelStyle = getComputedStyle(panel!);
    const rowStyle = getComputedStyle(row!);
    const footerStyle = getComputedStyle(footer!);
    const gone = (value: string) => value === "" || value === "0px" || value === "0";

    expect(gone(appbarStyle.borderBottomWidth)).toBe(true);
    expect(gone(panelStyle.borderTopWidth)).toBe(true);
    expect(gone(panelStyle.borderBottomWidth)).toBe(true);
    expect(gone(rowStyle.borderBottomWidth)).toBe(true);
    expect(gone(rowStyle.borderTopWidth)).toBe(true);
    expect(gone(footerStyle.borderTopWidth)).toBe(true);

    const list = document.querySelector(".inbox-thread-list");
    expect(getComputedStyle(list!).paddingTop).not.toBe("0px");
    expect(getComputedStyle(appbar!).paddingBottom).not.toBe("0px");
  });
});
