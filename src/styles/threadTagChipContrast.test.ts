import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderThreadTagChip } from "../app/ui/render/threadTagsRender";
import type { Tag } from "../app/types";

const root = resolve(import.meta.dirname, "../..");

/** Fond clair / sombre déclarés pour chaque famille de pastille. */
const CHIP_PAIRS = [
  { tone: "kind", light: "#f7eee8", dark: "#4a342c" },
  { tone: "source", light: "#e7eef6", dark: "#2c3a4a" },
  { tone: "state", light: "#e6f0e7", dark: "#2c3c30" },
  { tone: "entity", light: "#f3e8ef", dark: "#3e303a" },
] as const;

const LIGHT_TEXT = "#16191e";
const DARK_TEXT = "#e7e9ee";

function channel(hex: string, index: number): number {
  return Number.parseInt(hex.slice(index, index + 2), 16);
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

describe("pastilles Tags du fil", () => {
  const css = readFileSync(resolve(root, "src/styles.css"), "utf8");
  const chipCss = css.slice(css.indexOf(".thread-tag-chip {"), css.indexOf(".thread-more-actions"));

  it("n’utilise plus le vert pâle illisible sur fond clair", () => {
    expect(chipCss).not.toMatch(/rgba\(\s*220\s*,\s*230\s*,\s*218/);
    expect(chipCss).toContain("color: var(--text)");
  });

  it("garde un contraste AAA du texte sur chaque teinte, clair et sombre", () => {
    for (const pair of CHIP_PAIRS) {
      expect(css).toContain(`.thread-tag-chip--${pair.tone}`);
      expect(css).toContain(pair.light);
      expect(css).toContain(pair.dark);
      expect(contrast(LIGHT_TEXT, pair.light)).toBeGreaterThanOrEqual(7);
      expect(contrast(DARK_TEXT, pair.dark)).toBeGreaterThanOrEqual(7);
    }
  });

  it("pose la teinte sur les pastilles fil et message (type, source, état)", () => {
    const samples: Tag[] = [
      { family: "Kind", value: "finance" },
      { family: "Source", value: "yunohost.org" },
      { family: "State", value: "unsubscribe" },
      { family: "Entity", value: "person:ada" },
    ];
    for (const tag of samples) {
      const html = renderThreadTagChip(tag);
      const tone = tag.family.toLowerCase();
      expect(html).toContain(`thread-tag-chip--${tone}`);
      expect(html).toContain(`${tone}:${tag.value}`);
    }
  });
});
