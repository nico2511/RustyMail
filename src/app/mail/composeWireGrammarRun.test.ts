// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerRender } from "../dispatch";
import { state } from "../state";
import type { Draft } from "../types";
import { computePreview, registerComposeDraftPreviewDeps } from "./composeDraftPreview";
import { tryHandleComposeEditorAiWire } from "./composeEditorAiWireRun";
import { destroyComposeBodyEditor, mountComposeBodyEditor, readComposePlainText } from "./composeBodyEditor";
import { loadComposeMarkdownIntoEditor, resetMarkdownEditorHistory } from "./composeMarkdownEditor";
import { persistDraft } from "./composePersistDraft";
import { applyComposeGrammarSuggestionAtIndex } from "./composeWireGrammarRun";

const invokeCtl = vi.hoisted(() => {
  const resolvers: Array<(value: unknown) => void> = [];
  return {
    resolvers,
    mode: "reject" as "reject" | "manual",
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command: string, args?: { markdownBody?: string }) => {
    if (invokeCtl.mode === "manual") {
      return new Promise((resolve) => {
        invokeCtl.resolvers.push(resolve);
      });
    }
    if (command !== "preview_draft") return Promise.resolve(null);
    const markdown = args?.markdownBody ?? "";
    return Promise.resolve({ textPlain: markdown, html: `<p>${markdown}</p>` });
  }),
}));

function emptyDraft(markdownBody: string): Draft {
  return {
    id: "draft-local",
    kind: "New",
    to: [],
    cc: [],
    bcc: [],
    subject: "RE: Demande de rendez-vous",
    markdownBody,
    sendHtml: true,
    inReplyTo: null,
    references: [],
    attachmentPaths: [],
    threadId: null,
  };
}

function paintShell(): void {
  let app = document.querySelector("#app");
  if (!app) {
    app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
  }
  app.innerHTML = `
    <section class="composer-mail-shell">
      <div class="composer-body composer-body--split">
        <div id="compose-body" class="compose-tiptap"></div>
        <div class="preview">${state.preview?.html ?? ""}</div>
      </div>
    </section>`;
  const host = document.querySelector<HTMLElement>("#compose-body");
  if (host) mountComposeBodyEditor(host);
}

function bodyValue(): string {
  return readComposePlainText();
}

function previewText(): string {
  return document.querySelector(".composer-body .preview")?.textContent ?? "";
}

function toastText(): string {
  return document.querySelector("#toast-box")?.textContent ?? "";
}

async function flushPreview(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  invokeCtl.mode = "reject";
  invokeCtl.resolvers.length = 0;
  document.body.innerHTML = `<div id="app"></div>`;
  registerRender(paintShell);
  registerComposeDraftPreviewDeps({
    persistDraft,
    sanitizePreviewHtml: (html) => html,
  });
  resetMarkdownEditorHistory();
  state.view = "compose";
  state.composeLayout = "split";
  state.composeBody = "";
  state.composeCanonicalBody = "";
  state.composeGrammarSuggestions = null;
  state.preview = undefined;
  state.draft = emptyDraft("");
});

afterEach(() => {
  destroyComposeBodyEditor();
  document.body.innerHTML = "";
  state.composeGrammarSuggestions = null;
  state.view = "list";
});

describe("applyComposeGrammarSuggestionAtIndex", () => {
  it("met à jour le textarea SPLIT, l’aperçu et le brouillon", async () => {
    const source = "salu moi c'est nicolas";
    state.composeBody = source;
    state.composeCanonicalBody = source;
    state.draft = emptyDraft(source);
    state.composeGrammarSuggestions = [
      {
        reason: "Forme de présentation",
        original: source,
        replacement: "Bonjour, je m'appelle Nicolas",
      },
    ];
    paintShell();

    const button = document.createElement("button");
    button.dataset.grammarI = "0";
    await tryHandleComposeEditorAiWire("compose-grammar-apply", button);
    await flushPreview();

    expect(bodyValue()).toBe("Bonjour, je m'appelle Nicolas");
    expect(state.composeBody).toContain("Bonjour, je m'appelle Nicolas");
    expect(state.composeCanonicalBody).toContain("Bonjour, je m'appelle Nicolas");
    expect(state.draft?.markdownBody).toContain("Bonjour, je m'appelle Nicolas");
    expect(previewText()).toContain("Bonjour, je m'appelle Nicolas");
    expect(previewText()).not.toContain("salu moi");
    expect(toastText()).toContain("Remplacement appliqué.");
    expect(toastText()).not.toContain("première occurrence");
    expect(state.composeGrammarSuggestions).toBeNull();
  });

  it("n’applique pas une suggestion qui retire un nom", () => {
    const source = "Bonjour, je m'appelle Nicola.";
    state.composeBody = source;
    state.composeCanonicalBody = source;
    state.draft = emptyDraft(source);
    state.composeGrammarSuggestions = [
      { reason: "ponctuation", original: source, replacement: "Bonjour, je m'appelle." },
    ];
    paintShell();

    applyComposeGrammarSuggestionAtIndex(0);

    expect(bodyValue()).toBe(source);
    expect(toastText()).toContain("retirerait du texte");
    expect(toastText()).not.toContain("Remplacement appliqué");
  });

  it("ne confirme pas le remplacement si l’extrait est absent", () => {
    state.composeBody = "salu moi c'est nicolas";
    state.composeCanonicalBody = state.composeBody;
    state.draft = emptyDraft(state.composeBody);
    state.composeGrammarSuggestions = [
      { reason: "x", original: "texte absent", replacement: "Bonjour" },
    ];
    paintShell();

    applyComposeGrammarSuggestionAtIndex(0);

    expect(bodyValue()).toBe("salu moi c'est nicolas");
    expect(state.composeBody).toBe("salu moi c'est nicolas");
    expect(toastText()).toContain("n’a pas été modifié");
    expect(toastText()).not.toContain("Remplacement appliqué");
  });

  it("remplace seulement la première occurrence et le dit dans le toast", () => {
    state.composeBody = "aa puis aa";
    state.composeCanonicalBody = state.composeBody;
    state.draft = emptyDraft(state.composeBody);
    state.composeGrammarSuggestions = [{ reason: "x", original: "aa", replacement: "bb" }];
    paintShell();

    applyComposeGrammarSuggestionAtIndex(0);

    expect(bodyValue()).toBe("bb puis aa");
    expect(state.composeCanonicalBody).toContain("bb puis aa");
    expect(toastText()).toContain("Remplacement appliqué (première occurrence).");
    expect(state.composeGrammarSuggestions).toHaveLength(1);
  });

  it("applique sur un corps HTML TipTap (pas un no-op)", () => {
    const html = `<!--rustymail-html--><p>salu moi c'est nicolas</p>`;
    state.composeBody = html;
    state.composeCanonicalBody = html;
    state.draft = emptyDraft(html);
    state.composeGrammarSuggestions = [
      { reason: "x", original: "salu moi c'est nicolas", replacement: "Bonjour, je m'appelle Nicolas" },
    ];
    paintShell();

    applyComposeGrammarSuggestionAtIndex(0);

    expect(bodyValue()).toBe("Bonjour, je m'appelle Nicolas");
    expect(toastText()).toContain("Remplacement appliqué");
  });

  it("remplace toutes les occurrences via apply-all", async () => {
    const { applyComposeGrammarSuggestionAllAtIndex } = await import("./composeWireGrammarRun");
    state.composeBody = "aa puis aa";
    state.composeCanonicalBody = state.composeBody;
    state.draft = emptyDraft(state.composeBody);
    state.composeGrammarSuggestions = [{ reason: "x", original: "aa", replacement: "bb" }];
    paintShell();

    applyComposeGrammarSuggestionAllAtIndex(0);

    expect(bodyValue()).toBe("bb puis bb");
    expect(toastText()).toContain("Remplacements appliqués");
    expect(state.composeGrammarSuggestions).toBeNull();
  });

  it("retrouve l’extrait malgré une apostrophe typographique", async () => {
    state.composeBody = "salu moi c'est nicolas";
    state.composeCanonicalBody = state.composeBody;
    state.draft = emptyDraft(state.composeBody);
    state.composeGrammarSuggestions = [
      {
        reason: "apostrophe",
        original: "salu moi c\u2019est nicolas",
        replacement: "Bonjour, je m'appelle Nicolas",
      },
    ];
    paintShell();

    applyComposeGrammarSuggestionAtIndex(0);
    await flushPreview();

    expect(bodyValue()).toBe("Bonjour, je m'appelle Nicolas");
    expect(previewText()).toContain("Bonjour, je m'appelle Nicolas");
  });

  it("préserve une image inline du markdown canonique", () => {
    const data = `data:image/png;base64,${"A".repeat(5000)}`;
    const canonical = `Avant ![a](${data}) après`;
    state.draft = emptyDraft(canonical);
    loadComposeMarkdownIntoEditor(canonical);
    state.composeGrammarSuggestions = [{ reason: "x", original: "Avant", replacement: "Bonjour" }];
    paintShell();

    applyComposeGrammarSuggestionAtIndex(0);

    expect(bodyValue().startsWith("Bonjour")).toBe(true);
    expect(state.composeCanonicalBody).toContain("Bonjour");
    expect(state.composeCanonicalBody).toContain(data);
    expect(state.draft?.markdownBody).toContain(data);
  });

  it("ignore un aperçu encore en vol qui renverrait l’ancien HTML", async () => {
    invokeCtl.mode = "manual";
    const source = "salu moi c'est nicolas";
    state.composeBody = source;
    state.composeCanonicalBody = source;
    state.draft = emptyDraft(source);
    state.preview = { textPlain: source, html: "<p>salu moi c'est nicolas</p>" };
    paintShell();

    const stale = computePreview();
    state.composeGrammarSuggestions = [
      { reason: "x", original: source, replacement: "Bonjour, je m'appelle Nicolas" },
    ];
    applyComposeGrammarSuggestionAtIndex(0);

    expect(invokeCtl.resolvers.length).toBeGreaterThanOrEqual(2);
    const fresh = invokeCtl.resolvers[1]!;
    const old = invokeCtl.resolvers[0]!;
    fresh({ textPlain: "Bonjour, je m'appelle Nicolas", html: "<p>Bonjour, je m'appelle Nicolas</p>" });
    await flushPreview();
    expect(previewText()).toContain("Bonjour, je m'appelle Nicolas");

    old({ textPlain: source, html: "<p>salu moi c'est nicolas</p>" });
    await stale;
    await flushPreview();

    expect(bodyValue()).toBe("Bonjour, je m'appelle Nicolas");
    expect(previewText()).toContain("Bonjour, je m'appelle Nicolas");
    expect(previewText()).not.toContain("salu moi");
    expect(state.preview?.html).toContain("Bonjour, je m'appelle Nicolas");
  });
});
