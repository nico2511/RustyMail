import { describe, expect, it } from "vitest";
import { summarizeDraftDiffLines } from "./composeDraftRevisionDiffAlgoRun";

describe("summarizeDraftDiffLines", () => {
  it("calcule +/− caractères et un libellé d’ampleur", () => {
    const stats = summarizeDraftDiffLines([
      { kind: "eq", text: "Bonjour" },
      { kind: "del", text: "ancien" },
      { kind: "add", text: "nouveau texte long pour un changement notable" },
    ]);
    expect(stats.removedChars).toBe(6);
    expect(stats.addedChars).toBeGreaterThan(20);
    expect(stats.addedLines).toBe(1);
    expect(stats.removedLines).toBe(1);
    expect(stats.label).toMatch(/Changement|Gros|Petit/);
  });
});
