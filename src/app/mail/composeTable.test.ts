import { describe, expect, it } from "vitest";
import { clampComposeTableDim } from "./composeTable";

describe("composeTable", () => {
  it("borne les dimensions du tableau", () => {
    expect(clampComposeTableDim(3, 3)).toBe(3);
    expect(clampComposeTableDim(0, 3)).toBe(1);
    expect(clampComposeTableDim(99, 3)).toBe(20);
    expect(clampComposeTableDim(Number.NaN, 3)).toBe(3);
  });
});
