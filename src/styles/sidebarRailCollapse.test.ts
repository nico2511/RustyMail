import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("rail repliable", () => {
  it("ne masque plus le bouton qui déplie le volet", () => {
    const base = readFileSync(resolve(root, "src/styles.css"), "utf8");
    const wave2 = readFileSync(resolve(root, "src/styles/productivity-wave2.css"), "utf8");
    expect(base).not.toMatch(/sidebar-collapsed[\s\S]{0,180}sidebar-collapse-edge\s*\{\s*display:\s*none/);
    expect(wave2).toMatch(
      /\.app-shell\.sidebar-collapsed:not\(\.compose-fullscreen-active\) \.sidebar-collapse-edge\s*\{[^}]*display:\s*grid/,
    );
    expect(wave2).toMatch(
      /\.app-shell\.sidebar-collapsed:not\(\.compose-fullscreen-active\) \.sidebar-collapse-edge\s*\{[^}]*pointer-events:\s*auto/,
    );
    expect(wave2).toMatch(
      /\.app-shell\.sidebar-collapsed:not\(\.compose-fullscreen-active\) \.sidebar-collapse-edge\s*\{[^}]*order:\s*-1/,
    );
  });

  it("espace les blocs du rail et ne déplie qu’un compte", () => {
    const shell = readFileSync(resolve(root, "src/styles/productivity-shell.css"), "utf8");
    expect(shell).toMatch(
      /\.sidebar-folder-group--accounts,\s*\.sidebar-folder-group--virtual-local\s*\{[^}]*margin-bottom:\s*20px/,
    );
    expect(shell).toMatch(/\.sidebar-personal-entry\s*\{[^}]*margin-top:\s*20px/);
    const wave2 = readFileSync(resolve(root, "src/styles/productivity-wave2.css"), "utf8");
    expect(wave2).toMatch(/\.sidebar-account-row\.is-expanded \.sidebar-account-fold__chevron/);
    expect(wave2).toMatch(/\.app-shell\.sidebar-collapsed \.sidebar-account-fold\s*\{[^}]*display:\s*none/);
  });
});
