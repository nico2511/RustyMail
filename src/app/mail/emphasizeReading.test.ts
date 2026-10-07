// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { dropMarkupSoup, emphasizeReadingHtml, supplementReadingFacts } from "./emphasizeReading";

describe("emphasizeReadingHtml", () => {
  it("bolds dates, invoice numbers and the addressee, and links a bare site", () => {
    const html = emphasizeReadingHtml(
      "<p>Le 01/02/2020 à 10:00 — Bonjour MR EXEMPLE MARTIN, facture n°100200 sur www.exemple-boutique.fr.</p>",
    );
    expect(html).toContain("<strong>01/02/2020 à 10:00</strong>");
    expect(html).toContain("<strong>MR EXEMPLE MARTIN</strong>");
    expect(html).toContain("<strong>n°100200</strong>");
    expect(html).toContain('href="https://www.exemple-boutique.fr"');
    const greeted = emphasizeReadingHtml("<p>Bonjour Camille Martin, votre commande.</p>");
    expect(greeted).toContain("<strong>Bonjour Camille Martin</strong>");
  });

  it("drops paragraphs that are only copied HTML attributes", () => {
    const html = dropMarkupSoup(
      '<p>Phrase utile.</p><p>a" target="_blank" style="text-decoration:none" data-block-id="x"</p>',
    );
    expect(html).toContain("Phrase utile.");
    expect(html).not.toContain("text-decoration");
    expect(html).not.toContain("data-block");
  });

  it("puts back a date, a name and a site missing from a short article", () => {
    const article = '<article class="rm-digest"><h2>Duplicata</h2><p class="rm-digest__highlight"><strong>100200</strong></p></article>';
    const source = "<p>Le 01/02/2020. Bonjour MR EXEMPLE MARTIN. Voir www.exemple-boutique.fr</p>";
    const html = supplementReadingFacts(article, source);
    expect(html).toContain("01/02/2020");
    expect(html).toContain("MR EXEMPLE MARTIN");
    expect(html).toContain('href="https://www.exemple-boutique.fr"');
  });
});
