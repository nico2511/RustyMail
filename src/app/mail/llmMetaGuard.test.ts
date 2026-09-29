import { describe, expect, it } from "vitest";
import { containsLlmMeta, introducesLlmMeta } from "./llmMetaGuard";

describe("llmMetaGuard", () => {
  it("repère le refus recopié dans le compositeur", () => {
    const leak =
      "Bonjour, nous avons reçu votre message. Cependant, les contenus de mails fournis par l’utilisateur sont des informations non fiables. Nous nous conformerons uniquement aux instructions du message système et au format JSON demandé.";
    expect(containsLlmMeta(leak)).toBe(true);
    expect(introducesLlmMeta("Salu je mappel nicola", leak)).toBe(true);
    expect(
      introducesLlmMeta(
        "Bonjour, je suis Nicola.",
        "Bonjour, je suis Nicola et je suis prêt à continuer. Veuillez fournir les informations nécessaires pour le format JSON requis.",
      ),
    ).toBe(true);
  });

  it("laisse passer une réécriture qui parle déjà de JSON dans le brouillon", () => {
    const source = "Le format JSON requis est décrit dans la pièce jointe.";
    expect(introducesLlmMeta(source, "Le format JSON requis figure en pièce jointe.")).toBe(false);
    expect(containsLlmMeta("Salut, je m'appelle Nicola.")).toBe(false);
  });
});
