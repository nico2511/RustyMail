import { describe, expect, it } from "vitest";
import { summaryResultToZenText } from "./threadViewUiMojibakeRun";
import { SUMMARY_DRAFTING_FR, SUMMARY_PARSE_FAILED_FR } from "./threadSummaryFormat";
import { zenSummaryHtmlFragments } from "./threadViewUiZenHtmlRun";

const COURTY_TITLE = "Rendez-vous avec le Dr. Courty!";
const COURTY_BULLETS = [
  "Le rendez-vous est possible sans courrier d'adressage si vous n'avez jamais rencontré Dr COURTY.",
  "Il est recommandé de fournir un courrier d'adressage si vous n'avez déjà rencontré le Dr.",
  "Le rendez-vous est fixé à une date et une heure à déterminer.",
  "Il est possible de renvoyer le mail avec la bonne adresse pour éviter les problèmes de livraison.",
];

function courtyJson(): string {
  return JSON.stringify({
    title: COURTY_TITLE,
    bullets: COURTY_BULLETS,
    sourceMessageIds: ["m1", "m2"],
  });
}

function expectCourtyCard(html: string): void {
  expect(html).toContain(COURTY_TITLE);
  expect(html).toContain("Dr COURTY");
  expect(html).toContain("date et une heure");
  expect(html).toContain("<ul");
  expect(html).toContain("<li>");
  expect(html).not.toContain("extrait modèle");
  expect(html).not.toContain("=== [");
  expect(html).not.toContain('"bullets"');
  expect(html).not.toContain("&quot;title&quot;");
  expect(html).not.toContain("Nicolas Lechopier");
}

describe("zenSummaryHtmlFragments — résumé de fil", () => {
  it("affiche titre et puces pour le JSON tronqué de la capture (RDV Dr Courty)", () => {
    const full = courtyJson();
    const truncated = full.slice(0, full.indexOf("livraison"));
    const text = summaryResultToZenText({
      title: "RE: Demande de rendez-vous",
      bullets: [
        `(extrait modèle) ${truncated}`,
        "Nicolas Lechopier: === [1] .. ===",
        "secretariat@drcourty.fr: === [1] .. ===",
      ],
      sourceMessageIds: ["m1", "m2"],
    });
    expectCourtyCard(zenSummaryHtmlFragments(text));
    expect(text).not.toContain("RE: Demande de rendez-vous");
  });

  it("lit un JSON préfixé et entouré d’une fence", () => {
    const raw = `Je résume {rapidement} le fil.\n\`\`\`json\n${courtyJson()}\n\`\`\``;
    expectCourtyCard(zenSummaryHtmlFragments(raw));
    expect(zenSummaryHtmlFragments(raw)).not.toContain("rapidement");
  });

  it("lit un JSON encapsulé dans une chaîne", () => {
    const wrapped = JSON.stringify({ output: courtyJson() });
    expectCourtyCard(zenSummaryHtmlFragments(wrapped));
  });

  it("lit un objet sans accolade ouvrante", () => {
    expectCourtyCard(zenSummaryHtmlFragments(courtyJson().slice(1)));
  });

  it("ne montre pas le JSON brut ni les marqueurs quand le parse échoue", () => {
    const html = zenSummaryHtmlFragments(
      [
        "RE: Demande de rendez-vous",
        "- (extrait modèle) pas du json du tout, vraiment aucun objet",
        "- Nicolas Lechopier: === [1] .. ===",
        "- secretariat@drcourty.fr: === [1] .. ===",
      ].join("\n"),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(SUMMARY_PARSE_FAILED_FR);
    expect(html).not.toContain("extrait modèle");
    expect(html).not.toContain("=== [");
    expect(html).not.toContain('"title"');
  });

  it("affiche un état de rédaction tant que le JSON streamé est incomplet", () => {
    const html = zenSummaryHtmlFragments('{"tit');
    expect(html).toContain(SUMMARY_DRAFTING_FR);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('{"tit');
  });

  it("remplace un JSON terminé illisible par un message d’état", () => {
    const html = zenSummaryHtmlFragments("{ceci n'est pas une synthese exploitable}");
    expect(html).toContain(SUMMARY_PARSE_FAILED_FR);
    expect(html).not.toContain("ceci n");
  });

  it("rend un résumé déjà structuré et laisse passer la prose", () => {
    const summary = zenSummaryHtmlFragments(
      "Rendez-vous avec le Dr. Courty!\n- Apporter le courrier.\n- Fixer l'heure.",
    );
    expect(summary).toContain("Rendez-vous avec le Dr. Courty!");
    expect(summary).toContain("Apporter le courrier.");
    expect(summary).toContain("<li>");
    expect(summary).not.toContain('role="status"');

    const prose = zenSummaryHtmlFragments("Bonjour,\n\nLe rendez-vous est confirmé.\n\nCordialement.");
    expect(prose.match(/<p /g)?.length).toBe(3);
    expect(prose).not.toContain('role="status"');
    expect(prose).toContain("Cordialement.");
  });

  it("échappe le HTML des puces", () => {
    const html = zenSummaryHtmlFragments('{"title":"Sujet","bullets":["<script>alert(1)</script>"]}');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("ne montre pas une puce sourceMessageIds issue du schéma JSON", () => {
    const html = zenSummaryHtmlFragments(
      JSON.stringify({
        title: "Renouvellement contrat",
        bullets: [
          "Proposition de visite le 18 novembre 2026.",
          "sourceMessageIds",
          "Paiement sur place lors du passage.",
        ],
        sourceMessageIds: ["m1"],
      }),
    );
    expect(html).toContain("18 novembre");
    expect(html).toContain("Paiement sur place");
    expect(html).not.toContain("sourceMessageIds");
  });
});
