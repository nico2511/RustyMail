import { describe, expect, it } from "vitest";
import { composeAiBusyKind, composeRewriteJobLabel } from "../../core/composeAiJobs";
import { rewriteStyleLabelFr } from "../../core/composeTone";
import { renderComposeToolbar, type ComposeToolbarProps } from "./composeToolbarRender";

const base: ComposeToolbarProps = {
  tone: "Professional",
  llmJobLabel: null,
  micState: "idle",
  micTitle: "Dictée",
  micAria: "Dictée",
  rewriteEnabled: true,
  grammarEnabled: true,
  quickRepliesEnabled: false,
};

function openTag(html: string, attr: string): string {
  const re = new RegExp(`<button\\b[^>]*${attr}[^>]*>`);
  const found = html.match(re);
  expect(found, attr).toBeTruthy();
  return found?.[0] ?? "";
}

describe("barre du compositeur", () => {
  it("regroupe écrire, corriger et transformer sans doublons de ton", () => {
    const html = renderComposeToolbar(base);
    expect(html).toContain(">Écrire<");
    expect(html).toContain(">Corriger<");
    expect(html).toContain(">Transformer<");
    expect(html).toContain('data-md="bold"');
    expect(html).toContain('data-md="quote"');
    expect(html).toContain('data-action="mic"');
    expect(html).toContain('data-action="compose-ai-grammar"');
    expect(html).toContain('data-action="compose-ai-rewrite-selected-tone"');
    expect(html).toContain('data-rewrite-style="Concise"');
    expect(html).toContain('data-compose-cmd="ai:shorten"');
    expect(html).not.toContain("Style sélectionné");
    expect(html).not.toContain(">Formel<");
    expect(html).not.toContain('data-rewrite-style="Formal"');
    expect(html).not.toContain('data-rewrite-style="Casual"');
    expect(html).toContain('role="radiogroup"');
  });

  it("masque les actions IA désactivées et garde la dictée", () => {
    const html = renderComposeToolbar({
      ...base,
      rewriteEnabled: false,
      grammarEnabled: false,
      quickRepliesEnabled: false,
    });
    expect(html).toContain(">Écrire<");
    expect(html).toContain('data-action="mic"');
    expect(html).not.toContain(">Corriger<");
    expect(html).not.toContain(">Transformer<");
    expect(html).not.toContain("compose-ai-grammar");
    expect(html).not.toContain("compose-ai-rewrite");
  });

  it("place les réponses rapides dans Écrire seulement si l’option est active", () => {
    expect(renderComposeToolbar(base)).not.toContain("llm-quick-replies-compose");
    const html = renderComposeToolbar({ ...base, quickRepliesEnabled: true, rewriteEnabled: false, grammarEnabled: false });
    expect(html).toContain('data-action="llm-quick-replies-compose"');
    expect(html).toContain('data-compose-cmd="ai:replies"');
    expect(html).not.toContain(">Transformer<");
  });

  it("marque l’action en cours et désactive les autres", () => {
    const html = renderComposeToolbar({
      ...base,
      llmJobLabel: composeRewriteJobLabel("Concise"),
      quickRepliesEnabled: true,
    });
    const shorten = openTag(html, 'data-rewrite-style="Concise"');
    const rewrite = openTag(html, 'data-action="compose-ai-rewrite-selected-tone"');
    const grammar = openTag(html, 'data-action="compose-ai-grammar"');
    expect(shorten).toContain('aria-busy="true"');
    expect(shorten).toContain("disabled");
    expect(rewrite).toContain('aria-busy="false"');
    expect(rewrite).toContain("disabled");
    expect(grammar).toContain("disabled");
  });

  it("filet d’état sur le ton choisi", () => {
    const html = renderComposeToolbar({ ...base, tone: "Empathetic" });
    const selected = openTag(html, 'data-tone="Empathetic"');
    const other = openTag(html, 'data-tone="Professional"');
    expect(selected).toContain("active");
    expect(selected).toContain('aria-checked="true"');
    expect(selected).toContain('tabindex="0"');
    expect(other).toContain('aria-checked="false"');
    expect(other).toContain('tabindex="-1"');
  });
});

describe("états IA du compositeur", () => {
  it("nomme les styles en français et distingue raccourcir", () => {
    expect(rewriteStyleLabelFr("Formal")).toBe("formel");
    expect(rewriteStyleLabelFr("Concise")).toBe("plus court");
    expect(composeRewriteJobLabel("Formal")).toBe("Réécriture · formel");
    expect(composeAiBusyKind(composeRewriteJobLabel("Concise"))).toBe("shorten");
    expect(composeAiBusyKind(composeRewriteJobLabel("Assertive"))).toBe("rewrite");
    expect(composeAiBusyKind("Orthographe")).toBe("grammar");
    expect(composeAiBusyKind("Réponses rapides")).toBe("replies");
    expect(composeAiBusyKind("Synthèse")).toBe("other");
    expect(composeAiBusyKind(null)).toBeNull();
  });
});
