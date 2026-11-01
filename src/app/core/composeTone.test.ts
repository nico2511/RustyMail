import { describe, expect, it } from "vitest";
import {
  rewriteStyleForTone,
  toneStyleMappingRows,
  tones,
  SHORTEN_LABEL_FR,
  SHORTEN_REWRITE_STYLE,
} from "./composeTone";

describe("rewriteStyleForTone", () => {
  it("mappe les tons connus", () => {
    expect(rewriteStyleForTone("Professional")).toBe("Formal");
    expect(rewriteStyleForTone("Casual")).toBe("Casual");
    expect(rewriteStyleForTone("Assertive")).toBe("Assertive");
    expect(rewriteStyleForTone("Empathetic")).toBe("Polite");
  });

  it("repli Neutral", () => {
    expect(rewriteStyleForTone("Unknown")).toBe("Neutral");
    expect(rewriteStyleForTone(undefined)).toBe("Neutral");
  });
});

describe("toneStyleMappingRows", () => {
  it("a une ligne par ton plus Raccourcir", () => {
    const rows = toneStyleMappingRows();
    expect(rows).toHaveLength(tones.length + 1);
    expect(rows[rows.length - 1]).toEqual({
      label: SHORTEN_LABEL_FR,
      style: SHORTEN_REWRITE_STYLE,
    });
  });
});
