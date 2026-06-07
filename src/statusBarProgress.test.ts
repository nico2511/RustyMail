import { describe, expect, it } from "vitest";
import { statusBarProgressCountLabel, statusBarProgressPercent } from "./statusBarProgress";

describe("statusBarProgress", () => {
  it("calcule le pourcentage", () => {
    expect(statusBarProgressPercent({ id: "x", label: "x", done: 3, total: 12 })).toBe(25);
    expect(statusBarProgressPercent({ id: "x", label: "x", done: 0, total: null })).toBeNull();
  });

  it("formate le compteur", () => {
    expect(statusBarProgressCountLabel({ id: "x", label: "x", done: 5, total: 20 })).toBe("5/20");
  });
});
