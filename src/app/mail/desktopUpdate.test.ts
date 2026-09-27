import { describe, expect, it } from "vitest";
import { formatUpdateProgress, frenchUpdateError } from "./desktopUpdate";

describe("desktop update copy", () => {
  it("affiche un pourcentage quand la taille est connue", () => {
    expect(formatUpdateProgress(25, 100)).toBe("Téléchargement… 25 %");
    expect(formatUpdateProgress(150, 100)).toBe("Téléchargement… 100 %");
  });

  it("reste lisible sans taille totale", () => {
    expect(formatUpdateProgress(2048, null)).toBe("Téléchargement… 2 Ko");
    expect(formatUpdateProgress(0, null)).toBe("Téléchargement…");
  });

  it("traduit une clé publique manquante", () => {
    expect(frenchUpdateError(new Error("invalid minisign public key"))).toContain("docs/RELEASE.md");
    expect(frenchUpdateError(new Error("network timeout"))).toContain("GitHub Releases");
  });
});
