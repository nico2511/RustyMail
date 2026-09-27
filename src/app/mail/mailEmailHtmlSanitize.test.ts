// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml } from "./mailEmailHtmlSanitize";

describe("sanitizeEmailHtml", () => {
  it("retire style, video et svg sans laisser l’URL de tracking", () => {
    const { html } = sanitizeEmailHtml(
      `<style>body{background:url(https://track.example/x)}</style><p>Bonjour</p><video src="https://evil.example/v.mp4"></video><svg onload="alert(1)"></svg>`,
    );
    const low = html.toLowerCase();
    expect(low).toContain("bonjour");
    expect(low).not.toContain("<style");
    expect(low).not.toContain("track.example");
    expect(low).not.toContain("<video");
    expect(low).not.toContain("evil.example");
    expect(low).not.toContain("<svg");
  });

  it("désactive javascript: et bloque une image svg data", () => {
    const { html } = sanitizeEmailHtml(
      `<a href="javascript:alert(1)">lien</a><img src="data:image/svg+xml;base64,PHN2Zy8+" alt="x"/>`,
    );
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html).not.toContain("data:image/svg");
    expect(html).toContain("lien");
  });

  it("bloque srcset distant et une image https par défaut", () => {
    const { html } = sanitizeEmailHtml(
      `<picture><source srcset="https://evil.example/a.jpg"/><img src="https://cdn.example/p.jpg" alt="photo"/></picture>`,
    );
    expect(html).not.toContain("srcset");
    expect(html).not.toContain("<picture");
    expect(html).not.toContain("<source");
    expect(html).not.toMatch(/\ssrc="https:\/\/cdn\.example\/p\.jpg"/);
    expect(html).toContain('data-remote-src="https://cdn.example/p.jpg"');
    expect(html).toContain("mail-remote-image-blocked");
  });

  it("conserve une image png inline", () => {
    const { html } = sanitizeEmailHtml(`<img src="data:image/png;base64,iVBORw0KGgo=" alt="ok"/>`);
    expect(html).toContain("data:image/png;base64,iVBORw0KGgo=");
  });
});
