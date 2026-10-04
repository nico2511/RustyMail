// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  ensureInlineImagesWithinLimit,
  estimateDataUrlDecodedBytes,
  listInlineDataImageUrls,
  MAX_INLINE_IMAGE_BYTES,
  TARGET_INLINE_IMAGE_BYTES,
} from "./composeInlineImageLimits";

function dataUrlOfDecodedBytes(bytes: number, mime = "image/png"): string {
  // 4 base64 chars → 3 decoded bytes
  const b64Len = Math.ceil(bytes / 3) * 4;
  return `data:${mime};base64,${"A".repeat(b64Len)}`;
}

describe("composeInlineImageLimits", () => {
  it("estime la taille décodée d’un data URL", () => {
    const payload = "AAAA"; // 4 chars → 3 bytes
    const url = `data:image/png;base64,${payload}`;
    expect(estimateDataUrlDecodedBytes(url)).toBe(3);
  });

  it("expose le plafond 8 Mo et la cible de compression", () => {
    expect(MAX_INLINE_IMAGE_BYTES).toBe(8 * 1024 * 1024);
    expect(TARGET_INLINE_IMAGE_BYTES).toBeLessThan(MAX_INLINE_IMAGE_BYTES);
  });

  it("liste les data URLs HTML et markdown", () => {
    const a = dataUrlOfDecodedBytes(3);
    const b = dataUrlOfDecodedBytes(6, "image/jpeg");
    const body = `<p><img src="${a}" alt="x"></p>\n![y](${b})\n`;
    expect(listInlineDataImageUrls(body)).toEqual([a, b]);
  });

  it("laisse passer un corps sans image", async () => {
    const out = await ensureInlineImagesWithinLimit("<p>Bonjour</p>");
    expect(out).toEqual({ ok: true, body: "<p>Bonjour</p>", compressed: 0 });
  });

  it("refuse une image au-delà du plafond si la compression échoue", async () => {
    // happy-dom : Image ne décode pas un faux PNG → compression échoue → refus si > MAX
    const huge = dataUrlOfDecodedBytes(MAX_INLINE_IMAGE_BYTES + 1000);
    const body = `<p><img src="${huge}"></p>`;
    const out = await ensureInlineImagesWithinLimit(body);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toMatch(/trop volumineuse|compresser|illisible|indisponible/i);
    }
  });
});
