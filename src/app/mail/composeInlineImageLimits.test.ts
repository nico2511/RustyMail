// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { estimateDataUrlDecodedBytes, MAX_INLINE_IMAGE_BYTES } from "./composeInlineImageLimits";

describe("composeInlineImageLimits", () => {
  it("estime la taille décodée d’un data URL", () => {
    const payload = "AAAA"; // 4 chars → 3 bytes
    const url = `data:image/png;base64,${payload}`;
    expect(estimateDataUrlDecodedBytes(url)).toBe(3);
  });

  it("expose le plafond 8 Mo", () => {
    expect(MAX_INLINE_IMAGE_BYTES).toBe(8 * 1024 * 1024);
  });
});
