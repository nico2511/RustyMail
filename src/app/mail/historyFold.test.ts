import { describe, expect, it } from "vitest";
import { renderHistoryFold, splitHistoryTurns } from "./historyFold";

describe("renderHistoryFold", () => {
  it("ne rend rien sans historique", () => {
    expect(renderHistoryFold([])).toBe("");
    expect(renderHistoryFold(undefined)).toBe("");
    expect(renderHistoryFold(["  \n"])).toBe("");
  });

  it("ouvre un historique lisible, avec en-tête à part du corps", () => {
    const html = renderHistoryFold([
      [
        "De : Alice Exemple",
        "Envoyé : mercredi 16 septembre 2026 11:44",
        "Objet : RE: Demande de rendez-vous",
        "",
        "Bonjour,",
        "",
        "Merci pour votre retour.",
        "",
        "Le 14 septembre 2026, Alice Exemple a écrit :",
        "",
        "Voici le document demandé.",
      ].join("\n"),
    ]);
    expect(html).toContain("<details");
    expect(html).toContain(">Historique</summary>");
    expect(html).toContain("rm-history-kicker");
    expect(html).toContain("De : Alice Exemple");
    expect(html).toContain("rm-history-turn__body");
    expect(html).toContain("Merci pour votre retour.");
    expect(html).toContain("document demandé");
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("<script");
  });

  it("découpe l’en-tête Outlook et la ligne « a écrit » en tours", () => {
    const turns = splitHistoryTurns(
      [
        "De : Alice Exemple",
        "Envoyé : mercredi",
        "Objet : RE: Demande",
        "",
        "Merci pour votre retour.",
        "",
        "Le 14 septembre 2026, Alice a écrit :",
        "Voici le document demandé.",
      ].join("\n"),
    );
    expect(turns).toHaveLength(2);
    expect(turns[0].kicker).toContain("De : Alice");
    expect(turns[0].kicker).toContain("Objet :");
    expect(turns[0].body).toBe("Merci pour votre retour.");
    expect(turns[1].kicker).toContain("a écrit");
    expect(turns[1].body).toContain("document demandé");
  });
});
