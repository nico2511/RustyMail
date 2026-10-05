// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { hasCompleteTagPair, snapToCuttableBlock, validateElementForZone } from "./digestCutValidate";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("digestCutValidate", () => {
  it("accepte une balise ouverte/fermée complète", () => {
    const root = mount(`<div class="block"><p>ok</p></div>`);
    const el = root.querySelector(".block")!;
    expect(hasCompleteTagPair(el).ok).toBe(true);
    document.body.removeChild(root);
  });

  it("refuse une balise vide comme zone", () => {
    const root = mount(`<div><img src="x.png" alt="" /></div>`);
    const img = root.querySelector("img")!;
    expect(hasCompleteTagPair(img).ok).toBe(false);
    document.body.removeChild(root);
  });

  it("snap remonte hors d’un span inline vers le bloc parent", () => {
    const root = mount(`
      <section class="card">
        <p>Texte avec <span class="hl">mot</span> isolé</p>
      </section>
    `);
    const span = root.querySelector(".hl")!;
    const snapped = snapToCuttableBlock(span, root);
    expect(snapped?.tagName.toLowerCase()).toMatch(/p|section/);
    expect(hasCompleteTagPair(snapped!).ok).toBe(true);
    document.body.removeChild(root);
  });

  it("valide un en-tête plausible", () => {
    const root = mount(`<div class="shell"><header class="brand">Logo</header><div class="body">Corps</div></div>`);
    const header = root.querySelector("header")!;
    const check = validateElementForZone(header, root, "header");
    expect(check.completeMarkup).toBe(true);
    expect(check.status).not.toBe("bad");
    document.body.removeChild(root);
  });
});
