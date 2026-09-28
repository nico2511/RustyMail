import { describe, expect, it } from "vitest";
import { renderDimmedBlocksFold } from "./dimmedBlocksFold";

describe("renderDimmedBlocksFold", () => {
  it("ne rend rien sans mention", () => {
    expect(renderDimmedBlocksFold([])).toBe("");
    expect(renderDimmedBlocksFold(undefined)).toBe("");
    expect(renderDimmedBlocksFold(["  ", ""])).toBe("");
  });

  it("replie les mentions au lieu de les perdre", () => {
    const html = renderDimmedBlocksFold([
      "This message is confidential and intended recipient only.",
    ]);
    expect(html).toContain("<details");
    expect(html).toContain("Mentions masquées");
    expect(html).toContain("intended recipient");
    expect(html).not.toContain("<script");
  });
});
