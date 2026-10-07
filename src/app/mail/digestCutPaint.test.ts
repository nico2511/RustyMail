// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { exclusiveZoneHits, expandCutNode, pickFromElement, shrinkCutNode } from "./digestCutPaint";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("digestCutPaint size", () => {
  it("shrink descends into first useful child", () => {
    const root = mount(`
      <div class="wrap">
        <div class="outer">
          <div class="inner">contenu</div>
        </div>
      </div>
    `);
    const outer = root.querySelector(".outer")!;
    const shrunk = shrinkCutNode(outer, root);
    expect(shrunk.classList.contains("inner")).toBe(true);
    document.body.removeChild(root);
  });

  it("expand from parent climbs to useful block", () => {
    const root = mount(`
      <div class="shell">
        <section class="block">
          <div class="cell">texte</div>
        </section>
      </div>
    `);
    const cell = root.querySelector(".cell")!;
    const expanded = expandCutNode(cell.parentElement!, root);
    expect(expanded.classList.contains("block")).toBe(true);
    const pick = pickFromElement(expanded, root);
    expect(pick?.classContains).toBe("block");
    document.body.removeChild(root);
  });

  it("keeps a single frame when header and body cover the same title", () => {
    const root = mount(`<div class="letter"><h1>Duplicata de facture</h1><p>Corps du message assez long pour rester une zone à part.</p></div>`);
    const title = root.querySelector("h1")!;
    const body = root.querySelector("p")!;
    const kept = exclusiveZoneHits([
      { zone: "header", el: title },
      { zone: "body", el: title },
      { zone: "footer", el: body },
    ]);
    const onTitle = kept.filter((hit) => hit.el === title);
    expect(onTitle).toHaveLength(1);
    expect(onTitle[0]?.zone).toBe("header");
    expect(kept.some((hit) => hit.el === body)).toBe(true);
    document.body.removeChild(root);
  });
});
