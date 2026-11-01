import { describe, expect, it } from "vitest";
import { renderPromptsSettingsBody, type PromptCatalogItem } from "./promptsSettingsPanel";
import { tones } from "./app/core/composeTone";

const deps = {
  escapeHtml: (s: string) => s,
};

const writingEntry: PromptCatalogItem = {
  id: "writing",
  feature: "Writing",
  templateEn: "template",
  variables: [],
  linkedSkills: [],
};

describe("renderPromptsSettingsBody tone mapping", () => {
  it("affiche le tableau sous writing", () => {
    const html = renderPromptsSettingsBody(deps, [writingEntry], "", "fr");
    expect(html).toContain("Professionnel");
    expect(html).toContain("Formal");
    expect(html).toContain("Raccourcir");
    expect(html).toContain("Concise");
    expect(html).toContain("Décontracté");
    expect(tones.length).toBe(4);
  });

  it("pas de tableau pour summary seul", () => {
    const html = renderPromptsSettingsBody(
      deps,
      [{ ...writingEntry, id: "summary", feature: "Summary" }],
      "",
      "fr",
    );
    expect(html).not.toContain("Concise");
  });

  it("loadError sans tableau", () => {
    const html = renderPromptsSettingsBody(deps, [writingEntry], "err", "fr");
    expect(html).not.toContain("Formal");
  });
});
