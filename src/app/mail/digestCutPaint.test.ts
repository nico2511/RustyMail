// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { expandCutNode, pickFromElement, shrinkCutNode } from "./digestCutPaint";

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
});
