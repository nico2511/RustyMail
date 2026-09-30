// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sanitizeComposePreviewHtml, sanitizeEmailHtml } from "./mailEmailHtmlSanitize";

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

  it("garde l’historique replié quand le bruit Outlook est retiré", () => {
    const { html } = sanitizeEmailHtml(
      `<p>Pouvez-vous me rappeler svp</p><details class="rm-mail-folded-quote"><summary>Historique</summary><div class="rm-mail-quote-body"><p>De : Nicolas</p><p>Envoyé : mercredi</p><p>Objet : RE: Demande</p><p>Ancien message</p></div></details><div><b>De :</b> Alice<br><b>Envoyé :</b> lundi<br><b>Objet :</b> Sujet orphelin</div>`,
      { stripOutlookNoise: true },
    );
    expect(html).toContain("rappeler");
    expect(html).toContain("rm-mail-folded-quote");
    expect(html).toContain("Ancien message");
    expect(html.toLowerCase()).not.toContain("sujet orphelin");
  });

  it("laisse une citation repliée ouvrable", () => {
    const { html } = sanitizeEmailHtml(
      `<p>Réponse</p><details class="rm-mail-folded-quote"><summary>Citation</summary><p>Ancien message</p></details>`,
    );
    expect(html).toContain("Réponse");
    expect(html).toContain("<details");
    expect(html).toContain("rm-mail-folded-quote");
    expect(html).toContain("Ancien message");
    expect(html).toContain("<summary");
  });

  it("conserve une image png inline", () => {
    const { html } = sanitizeEmailHtml(`<img src="data:image/png;base64,iVBORw0KGgo=" alt="ok"/>`);
    expect(html).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("retire la taille des images reçues", () => {
    const { html } = sanitizeEmailHtml(
      `<img src="data:image/png;base64,iVBORw0KGgo=" alt="ok" width="320" style="width: 320px; height: auto"/>`,
    );
    expect(html).not.toContain("width=");
    expect(html).not.toMatch(/width\s*:/);
  });

  it("conserve la taille dans l’aperçu du compositeur", () => {
    const raw = `<img src="data:image/png;base64,iVBORw0KGgo=" alt="ok" width="320" style="width: 320px; height: auto; max-width: 100%; color: red"/>`;
    const html = sanitizeComposePreviewHtml(raw);
    expect(html).toContain('width="320"');
    expect(html).toContain("width: 320px");
    expect(html).toContain("height: auto");
    expect(html).toContain("max-width: 100%");
    const blocked = sanitizeComposePreviewHtml(
      `<img src="data:image/png;base64,iVBORw0KGgo=" alt="ok" width="javascript:alert(1)" style="width: expression(alert(1))"/>`,
    );
    expect(blocked.toLowerCase()).not.toContain("javascript");
    expect(blocked.toLowerCase()).not.toContain("expression");
    expect(blocked).not.toContain("width=");
  });
});
