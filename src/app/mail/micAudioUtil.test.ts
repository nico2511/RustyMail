import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "./micAudioUtil";

describe("bytesToBase64", () => {
  it("encode comme btoa sans spread", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // Hello
    expect(bytesToBase64(bytes)).toBe(btoa("Hello"));
  });

  it("gère un buffer plus grand que la taille de chunk", () => {
    const bytes = new Uint8Array(0x3000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const encoded = bytesToBase64(bytes);
    expect(encoded.length).toBeGreaterThan(0);
    const decoded = atob(encoded);
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.charCodeAt(0)).toBe(0);
    expect(decoded.charCodeAt(255)).toBe(255);
  });
});
