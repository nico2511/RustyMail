// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  cutRangeLabel,
  exclusiveZoneHits,
  expandCutNode,
  pickFromElement,
  picksFromElements,
  shrinkCutNode,
  snapDragRange,
  unwrapSingleChildWrappers,
} from "./digestCutPaint";

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

describe("snapDragRange", () => {
  it("saute les enveloppes à un seul enfant et n’attrape jamais la racine", () => {
    const root = mount(`
      <div class="outer">
        <div class="inner">
          <p>Bonjour <span class="digest-cut__hover">mot</span></p>
        </div>
      </div>
    `);
    const span = root.querySelector("span")!;
    const range = snapDragRange(root, span, span);
    expect(range).toHaveLength(1);
    expect(range[0]?.tagName.toLowerCase()).toBe("p");
    expect(range[0]).not.toBe(root);
    expect(unwrapSingleChildWrappers(root.querySelector(".outer")!, root).tagName.toLowerCase()).toBe("p");
    expect(cutRangeLabel(range)).toBe("p");
    expect(snapDragRange(root, root, root)).toEqual([]);
    document.body.removeChild(root);
  });

  it("peint une plage de frères contigus, pas le parent", () => {
    const root = mount(`
      <div class="letter">
        <div class="row">En-tête</div>
        <div class="row">Corps utile</div>
        <div class="row digest-cut__zone-hl">Pied légal</div>
      </div>
    `);
    const rows = [...root.querySelectorAll(".row")];
    const range = snapDragRange(root, rows[0], rows[2]);
    expect(range.map((el) => el.textContent?.trim())).toEqual(["En-tête", "Corps utile", "Pied légal"]);
    expect(range).not.toContain(root.querySelector(".letter"));
    const picks = picksFromElements(range, root);
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((pick) => pick.index)).size).toBe(3);
    expect(picks.every((pick) => !String(pick.classContains ?? "").includes("digest-cut__"))).toBe(true);
    expect(cutRangeLabel(range)).toBe("3 blocs");
    document.body.removeChild(root);
  });

  it("donne une racine nth-of-type quand le parent n’a pas de classe", () => {
    const root = document.createElement("div");
    root.setAttribute("data-digest-cut-mail", "1");
    root.innerHTML = `<div><div><p>un</p></div><div><p>deux</p></div></div>`;
    document.body.appendChild(root);
    const second = root.querySelectorAll("div")[2]!;
    const pick = pickFromElement(second, root);
    expect(pick?.structureRoot ?? "").toMatch(/nth-of-type/);
    expect(pick?.structureRoot).not.toBe("div");
    expect(pick?.structureRoot).not.toBe("td");
    document.body.removeChild(root);
  });
});
