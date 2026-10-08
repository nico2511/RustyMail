import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { senderHueSlot } from "../app/mail/historyFold";

const root = resolve(import.meta.dirname, "../..");

const RAIL = ["#1d4f8a", "#1b6b45", "#8a4b12", "#7a2f68", "#1a5c72", "#8a3030"] as const;
const DARK_SURFACE_RAIL = ["#9ec0ff", "#8ed4ae", "#f0c08a", "#f0b0dc", "#8ed4e4", "#f0b0b0"] as const;
const LIGHT_PAPER = "#ffffff";
const DARK_PAPER = "#ebe6dc";
const DARK_SURFACE = "#22262e";
const LIGHT_TEXT = "#16191e";
const DARK_MESSAGE_TEXT = "#1a1d22";

function channel(hex: string, index: number): number {
  const h = hex.replace("#", "");
  return Number.parseInt(h.slice(index, index + 2), 16);
}

function linearize(channelByte: number): number {
  const c = channelByte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = linearize(channel(h, 0));
  const g = linearize(channel(h, 2));
  const b = linearize(channel(h, 4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const hi = Math.max(luminance(foreground), luminance(background));
  const lo = Math.min(luminance(foreground), luminance(background));
  return (hi + 0.05) / (lo + 0.05);
}

function mix(fg: string, weight: number, bg: string): string {
  const out = [0, 2, 4].map((i) => {
    const v = Math.round(channel(fg, i) * weight + channel(bg, i) * (1 - weight));
    return v.toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}

describe("historique cité", () => {
  const shadow = readFileSync(resolve(root, "src/app/mail/mailHtmlShadowInnerRun.ts"), "utf8");
  const css = readFileSync(resolve(root, "src/styles.css"), "utf8");

  it("teinte le rail par expéditeur et alterne le fond selon la profondeur", () => {
    expect(shadow).toContain("data-sender-hue");
    expect(shadow).toContain("data-depth-parity");
    expect(shadow).toContain("data-depth-over");
    expect(shadow).not.toContain("rgba(255,255,255,.015)");
    expect(css).toContain("data-sender-hue");
    expect(css).toContain("var(--font-serif)");
  });

  it("garde un rail lisible sur le papier clair et le papier sombre", () => {
    for (const hue of RAIL) {
      expect(contrast(hue, LIGHT_PAPER)).toBeGreaterThanOrEqual(3);
      expect(contrast(hue, DARK_PAPER)).toBeGreaterThanOrEqual(3);
    }
    for (const hue of DARK_SURFACE_RAIL) {
      expect(contrast(hue, DARK_SURFACE)).toBeGreaterThanOrEqual(3);
      expect(css).toContain(hue);
    }
  });

  it("garde le texte lisible sur les fonds de profondeur", () => {
    for (const paper of [LIGHT_PAPER, DARK_PAPER]) {
      const text = paper === LIGHT_PAPER ? LIGHT_TEXT : DARK_MESSAGE_TEXT;
      const odd = mix(text, 0.04, paper);
      const even = mix(text, 0.08, paper);
      expect(contrast(text, odd)).toBeGreaterThanOrEqual(7);
      expect(contrast(text, even)).toBeGreaterThanOrEqual(7);
    }
  });

  it("borne la teinte d’expéditeur entre 1 et 6", () => {
    expect(senderHueSlot("ada@example.com")).toBeGreaterThanOrEqual(1);
    expect(senderHueSlot("ada@example.com")).toBeLessThanOrEqual(6);
    expect(senderHueSlot("ada@example.com")).toBe(senderHueSlot("ADA@example.com"));
    expect(senderHueSlot("bob@example.com")).not.toBe(senderHueSlot(""));
  });
});
