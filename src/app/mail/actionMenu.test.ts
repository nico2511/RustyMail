import { describe, expect, it } from "vitest";
import { renderActionMenuHtml } from "./actionMenu";

describe("renderActionMenuHtml", () => {
  it("rend un menu avec items data-action", () => {
    const html = renderActionMenuHtml({
      label: "Organiser",
      items: [
        { action: "thread-archive-cur", label: "Archiver" },
        { action: "thread-trash-cur", label: "Corbeille", danger: true },
      ],
    });
    expect(html).toContain('class="action-menu"');
    expect(html).toContain(">Organiser <");
    expect(html).toContain('data-action="thread-archive-cur"');
    expect(html).toContain('data-action="thread-trash-cur"');
    expect(html).toContain("action-menu__item--danger");
  });

  it("ne rend rien sans items", () => {
    expect(renderActionMenuHtml({ label: "Vide", items: [] })).toBe("");
  });
});
