import { describe, expect, it } from "vitest";
import { renderHistoryFold } from "./historyFold";

describe("renderHistoryFold", () => {
  it("ne rend rien sans historique", () => {
    expect(renderHistoryFold([])).toBe("");
    expect(renderHistoryFold(undefined)).toBe("");
    expect(renderHistoryFold(["  \n"])).toBe("");
  });

  it("replie l’historique Outlook hors du corps", () => {
    const html = renderHistoryFold([
      "De : Nicolas Lechopier\nEnvoyé : mercredi\nObjet : RE: Demande\n\nVoici le document demandé.",
    ]);
    expect(html).toContain("<details");
    expect(html).toContain("rm-history-fold");
    expect(html).toContain(">Historique</summary>");
    expect(html).toContain("document demandé");
    expect(html).not.toContain("<script");
  });

  it("nomme le pli par la ligne « a écrit »", () => {
    const html = renderHistoryFold([
      "Le 14 septembre 2026, Nicolas a écrit :\nAncien message.",
    ]);
    expect(html).toContain("a écrit");
    expect(html).not.toContain(">Historique</summary>");
  });
});
