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

  it("bloque background, image-set et les url CSS échappées", () => {
    const cases = [
      `<table background="https://t.example/p.gif"><tr><td>a</td></tr></table>`,
      `<table><tr><td background="https://t.example/p.gif">a</td></tr></table>`,
      `<body background="https://t.example/p.gif"><p>a</p></body>`,
      `<div style="background-image:image-set('https://t.example/x' 1x)">a</div>`,
      `<div style="background-image:-webkit-image-set(url(https://t.example/x) 1x)">a</div>`,
      `<div style="background:u\\72 l(https://t.example/x)">a</div>`,
      `<div style="background:\\75 rl(https://t.example/x)">a</div>`,
      `<div style="background:ur/**/l(https://t.example/x)">a</div>`,
    ];
    for (const html of cases) {
      const out = sanitizeEmailHtml(html).html;
      expect(out, html).not.toMatch(/\sbackground="https?:/i);
      expect(out, html).not.toMatch(/\sstyle="[^"]*https?:/i);
      expect(out.replace(/data-remote-[a-z]+="[^"]*"/gi, ""), html).not.toContain("t.example");
    }
    const table = sanitizeEmailHtml(cases[0]).html;
    expect(table).toContain('data-remote-background="https://t.example/p.gif"');
  });

  it("conserve background quand les images distantes sont autorisées", () => {
    const { html } = sanitizeEmailHtml(`<table background="https://t.example/p.gif"><tr><td>a</td></tr></table>`, {
      allowRemoteImages: true,
    });
    expect(html).toContain('background="https://t.example/p.gif"');
    expect(html).not.toContain("data-remote-background");
  });

  it("conserve la largeur d’image (attr ou style) pour le rendu", () => {
    const { html } = sanitizeEmailHtml(
      `<img src="cid:img1-abcd" width="200" style="width: 200px; height: auto; max-width: 100%;" alt="a"/>`,
    );
    expect(html).toContain('width="200"');
    expect(html).toContain("width: 200px");
    expect(html).toContain("cid:img1-abcd");
  });
});
