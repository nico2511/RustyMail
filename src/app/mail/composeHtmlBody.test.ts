// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  COMPOSE_HTML_MARK,
  composeSourcePlainText,
  composeSourceToEditorHtml,
  isComposeHtmlSource,
  markComposeHtml,
  markdownToEditorHtml,
  unwrapComposeHtml,
} from "./composeHtmlBody";

describe("format du corps compositeur", () => {
  it("convertit le markdown historique en HTML d’éditeur", () => {
    const html = markdownToEditorHtml("Bonjour **monde**");
    expect(html).toContain("<strong>monde</strong>");
    expect(isComposeHtmlSource(html)).toBe(false);
  });

  it("préfixe l’HTML TipTap et le relit", () => {
    const stored = markComposeHtml("<p>Bonjour</p>");
    expect(stored.startsWith(COMPOSE_HTML_MARK)).toBe(true);
    expect(isComposeHtmlSource(stored)).toBe(true);
    expect(unwrapComposeHtml(stored)).toBe("<p>Bonjour</p>");
    expect(composeSourceToEditorHtml(stored)).toBe("<p>Bonjour</p>");
    expect(composeSourcePlainText(stored)).toBe("Bonjour");
  });

  it("retire une image data du texte brut", () => {
    const stored = markComposeHtml(
      `<p>Avant <img src="data:image/png;base64,AAAA" alt="capture"> après</p>`,
    );
    const plain = composeSourcePlainText(stored);
    expect(plain).toContain("Avant");
    expect(plain).toContain("[image: capture]");
    expect(plain).not.toContain("base64");
  });
});
