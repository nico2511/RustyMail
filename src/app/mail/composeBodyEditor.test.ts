// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args?: { markdownBody?: string }) => {
    if (command !== "preview_draft") return null;
    const markdown = args?.markdownBody ?? "";
    return { textPlain: markdown, html: `<p>${markdown}</p>` };
  }),
}));
import { state } from "../state";
import type { Draft } from "../types";
import { renderComposeToolbar, type ComposeToolbarProps } from "../ui/render/composeToolbarRender";
import {
  destroyComposeBodyEditor,
  getComposeBodyEditor,
  mapComposePlainSpanToDoc,
  mountComposeBodyEditor,
  readComposeEditorHtml,
  readComposePlainText,
} from "./composeBodyEditor";
import { isComposeHtmlSource } from "./composeHtmlBody";
import { registerComposeDraftPreviewDeps } from "./composeDraftPreview";
import { persistDraft } from "./composePersistDraft";
import { applyMarkdownAction } from "./composeMarkdownToolbarRun";
import { applyComposeGrammarSuggestionAtIndex } from "./composeWireGrammarRun";

const toolbarProps: ComposeToolbarProps = {
  tone: "Professional",
  llmJobLabel: null,
  micState: "idle",
  micTitle: "Dictée",
  micAria: "Dictée",
  rewriteEnabled: true,
  grammarEnabled: true,
  quickRepliesEnabled: true,
};

function emptyDraft(markdownBody: string): Draft {
  return {
    id: "draft-local",
    kind: "New",
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    markdownBody,
    sendHtml: true,
    inReplyTo: null,
    references: [],
    attachmentPaths: [],
    threadId: null,
  };
}

function mount(source = ""): HTMLElement {
  state.composeBody = source;
  state.composeCanonicalBody = source;
  state.draft = emptyDraft(source);
  document.body.innerHTML = `<div id="compose-body" class="compose-tiptap"></div>`;
  const host = document.querySelector<HTMLElement>("#compose-body");
  if (!host) throw new Error("host");
  mountComposeBodyEditor(host);
  return host;
}

beforeEach(() => {
  destroyComposeBodyEditor();
  document.body.innerHTML = "";
  registerComposeDraftPreviewDeps({
    persistDraft,
    sanitizePreviewHtml: (html) => html,
  });
  state.view = "compose";
  state.composeLayout = "write";
  state.composeBody = "";
  state.composeCanonicalBody = "";
  state.composeGrammarSuggestions = null;
  state.draft = emptyDraft("");
});

afterEach(() => {
  destroyComposeBodyEditor();
  document.body.innerHTML = "";
});

describe("éditeur TipTap du compositeur", () => {
  it("démarre vide et n’écrit pas d’HTML tant que l’on n’a pas saisi", () => {
    mount("**gras**");
    expect(readComposeEditorHtml()).toContain("<strong>gras</strong>");
    expect(isComposeHtmlSource(state.composeCanonicalBody)).toBe(false);
    expect(state.draft?.markdownBody).toBe("**gras**");
  });

  it("lit et écrit le HTML après une frappe", () => {
    mount("");
    const editor = getComposeBodyEditor();
    expect(editor).toBeTruthy();
    editor?.commands.insertContent("Bonjour");
    expect(readComposePlainText()).toContain("Bonjour");
    expect(readComposeEditorHtml()).toContain("Bonjour");
    expect(isComposeHtmlSource(state.composeCanonicalBody)).toBe(true);
    expect(state.draft?.markdownBody).toContain("Bonjour");
  });

  it("aligne un extrait du texte visible sur le document", () => {
    mount("");
    const editor = getComposeBodyEditor();
    editor?.commands.setContent("<p>aa puis aa</p>", false);
    const plain = readComposePlainText();
    expect(plain).toBe("aa puis aa");
    const at = plain.indexOf("aa");
    const mapped = mapComposePlainSpanToDoc(editor!.state.doc, { start: at, end: at + 2 });
    expect(mapped).toBeTruthy();
    expect(editor!.state.doc.textBetween(mapped!.from, mapped!.to, "\n")).toBe("aa");
  });

  it("branche Gras de la barre Écrire sur TipTap", async () => {
    document.body.innerHTML = `${renderComposeToolbar(toolbarProps)}<div id="compose-body"></div>`;
    mountComposeBodyEditor(document.querySelector<HTMLElement>("#compose-body")!);
    const editor = getComposeBodyEditor();
    editor?.commands.setContent("<p>bonjour</p>", false);
    const end = editor!.state.doc.content.size;
    editor?.commands.setTextSelection({ from: 1, to: Math.max(1, end - 1) });
    const bold = document.querySelector<HTMLButtonElement>('[data-md="bold"]');
    bold?.addEventListener("mousedown", (event) => event.preventDefault());
    bold?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await applyMarkdownAction("bold");
    expect(readComposeEditorHtml()).toMatch(/<(strong|b)>bonjour<\/(strong|b)>/);
    expect(document.querySelector('[data-compose-cmd="ai:grammar"]')).toBeTruthy();
    expect(document.querySelector('[data-compose-cmd="ai:rewrite"]')).toBeTruthy();
    expect(document.querySelector('[data-compose-cmd="ai:shorten"]')).toBeTruthy();
    expect(document.querySelector('[data-compose-cmd="dictate"]')).toBeTruthy();
  });

  it("marque le niveau de titre actif et le rebascule au paragraphe", async () => {
    document.body.innerHTML = `${renderComposeToolbar(toolbarProps)}<div id="compose-body"></div>`;
    mountComposeBodyEditor(document.querySelector<HTMLElement>("#compose-body")!);
    const editor = getComposeBodyEditor();
    editor?.commands.setContent("<p>bonjour</p>", false);
    editor?.commands.setTextSelection(2);
    const h1 = document.querySelector<HTMLButtonElement>('[data-md="h1"]');
    const h2 = document.querySelector<HTMLButtonElement>('[data-md="h2"]');
    expect(h1?.closest(".compose-heading-group")).toBe(h2?.closest(".compose-heading-group"));
    await applyMarkdownAction("h1");
    expect(readComposeEditorHtml()).toMatch(/<h1>bonjour<\/h1>/);
    expect(h1?.classList.contains("is-active")).toBe(true);
    expect(h1?.getAttribute("aria-pressed")).toBe("true");
    expect(h2?.getAttribute("aria-pressed")).toBe("false");
    await applyMarkdownAction("h2");
    expect(readComposeEditorHtml()).toMatch(/<h2>bonjour<\/h2>/);
    expect(h1?.classList.contains("is-active")).toBe(false);
    expect(h2?.getAttribute("aria-pressed")).toBe("true");
    await applyMarkdownAction("h2");
    expect(readComposeEditorHtml()).toMatch(/<p>bonjour<\/p>/);
    expect(h2?.classList.contains("is-active")).toBe(false);
    expect(h2?.getAttribute("aria-pressed")).toBe("false");
  });

  it("applique la première correction dans le document", () => {
    mount("aa puis aa");
    state.composeGrammarSuggestions = [{ reason: "x", original: "aa", replacement: "bb" }];
    applyComposeGrammarSuggestionAtIndex(0);
    expect(readComposePlainText()).toBe("bb puis aa");
    expect(state.composeGrammarSuggestions).toHaveLength(1);
    expect(state.draft?.markdownBody).toContain("bb puis aa");
  });
});
