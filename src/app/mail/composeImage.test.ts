// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));

import { NodeSelection } from "@tiptap/pm/state";
import { state } from "../state";
import type { Draft } from "../types";
import {
  COMPOSE_IMAGE_WIDTH_PRESETS,
  clampComposeImageWidth,
  composeImageDragStartWidth,
  composeImageSizeAttrs,
  nextComposeImageWidth,
  parseComposeImageWidth,
  selectComposeImageSrc,
  writeComposeImageWidth,
} from "./composeImage";
import {
  destroyComposeBodyEditor,
  getComposeBodyEditor,
  mountComposeBodyEditor,
  readComposeEditorHtml,
} from "./composeBodyEditor";
import { registerComposeDraftPreviewDeps } from "./composeDraftPreview";
import { persistDraft } from "./composePersistDraft";
import type { Editor } from "@tiptap/core";

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

function mount(source = ""): void {
  state.composeBody = source;
  state.composeCanonicalBody = source;
  state.draft = emptyDraft(source);
  document.body.innerHTML = `<div id="compose-body" class="compose-tiptap"></div>`;
  const host = document.querySelector<HTMLElement>("#compose-body");
  if (!host) throw new Error("host");
  mountComposeBodyEditor(host);
}

function imagePos(editor: Editor): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === "image") {
      found = pos;
      return false;
    }
    return undefined;
  });
  if (found < 0) throw new Error("image");
  return found;
}

const SRC = "https://cdn.example/photo.png";

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
  state.draft = emptyDraft("");
});

afterEach(() => {
  destroyComposeBodyEditor();
  document.body.innerHTML = "";
});

describe("taille libre d’une image du compositeur", () => {
  it("borne la largeur et décrit le HTML d’e-mail", () => {
    expect(clampComposeImageWidth(10)).toBe(48);
    expect(clampComposeImageWidth(320.4)).toBe(320);
    expect(clampComposeImageWidth(5000)).toBe(1200);
    expect(parseComposeImageWidth("320px")).toBe(320);
    expect(parseComposeImageWidth("nope")).toBeNull();
    expect(composeImageSizeAttrs(null)).toEqual({});
    expect(composeImageSizeAttrs(320)).toEqual({
      width: "320",
      style: "width: 320px; height: auto; max-width: 100%;",
    });
    expect(nextComposeImageWidth(200, 40, "se")).toBe(240);
    expect(nextComposeImageWidth(200, 40, "sw")).toBe(160);
    expect(composeImageDragStartWidth(0, 200)).toBe(200);
    expect(composeImageDragStartWidth(180, 200)).toBe(180);
  });

  it("insère une image sans largeur forcée", () => {
    mount("");
    const editor = getComposeBodyEditor();
    expect(editor).toBeTruthy();
    editor?.chain().focus().setImage({ src: SRC, alt: "photo" }).run();
    const html = readComposeEditorHtml();
    expect(html).toContain("<img");
    expect(html).toContain(SRC);
    expect(html).not.toContain('width="');
    expect(html).not.toContain("compose-image");
  });

  it("écrit la largeur du curseur dans le HTML et la retrouve au rechargement", () => {
    mount("");
    const editor = getComposeBodyEditor()!;
    editor.chain().focus().setImage({ src: SRC, alt: "photo" }).run();
    const pos = imagePos(editor);
    editor.commands.setNodeSelection(pos);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(document.querySelector(".compose-image.is-selected")).toBeTruthy();
    expect(document.querySelector('input.compose-image__slider[aria-label="Taille de l’image"]')).toBeTruthy();
    expect(document.querySelectorAll(".compose-image__handle")).toHaveLength(4);

    const slider = document.querySelector<HTMLInputElement>(".compose-image__slider");
    expect(slider).toBeTruthy();
    slider!.value = "275";
    slider!.dispatchEvent(new Event("input", { bubbles: true }));
    slider!.dispatchEvent(new Event("change", { bubbles: true }));

    const html = readComposeEditorHtml();
    expect(html).toContain('width="275"');
    expect(html).toContain("width: 275px; height: auto; max-width: 100%;");
    expect(state.composeCanonicalBody).toContain('width="275"');

    const stored = state.composeCanonicalBody;
    destroyComposeBodyEditor();
    mount(stored);
    const again = getComposeBodyEditor()!;
    let width: unknown = null;
    again.state.doc.descendants((node) => {
      if (node.type.name === "image") width = node.attrs.width;
    });
    expect(width).toBe(275);
    expect(readComposeEditorHtml()).toContain('width="275"');
  });

  it("applique un raccourci puis revient à la taille d’origine", () => {
    mount("");
    const editor = getComposeBodyEditor()!;
    editor.chain().focus().setImage({ src: SRC, alt: "photo" }).run();
    editor.commands.setNodeSelection(imagePos(editor));
    const preset = COMPOSE_IMAGE_WIDTH_PRESETS[1]!;
    const button = document.querySelector<HTMLButtonElement>(`[data-compose-image-width="${preset.px}"]`);
    expect(button?.textContent).toBe(preset.label);
    button?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    button?.click();
    expect(readComposeEditorHtml()).toContain(`width="${preset.px}"`);
    expect(button?.classList.contains("is-active")).toBe(true);

    document.querySelector<HTMLButtonElement>('[data-compose-image-width="auto"]')?.click();
    const html = readComposeEditorHtml();
    expect(html).not.toContain('width="');
    expect(html).not.toContain("width:");
  });

  it("sélectionne l’image qui vient d’être insérée", () => {
    mount("");
    const editor = getComposeBodyEditor()!;
    editor.chain().focus().setImage({ src: SRC, alt: "une" }).run();
    editor.chain().focus().insertContent(" puis ").setImage({ src: SRC, alt: "deux" }).run();
    selectComposeImageSrc(editor, SRC);
    const sel = editor.state.selection;
    expect(sel).toBeInstanceOf(NodeSelection);
    if (!(sel instanceof NodeSelection)) return;
    expect(sel.node.attrs.alt).toBe("deux");
    expect(document.querySelector(".compose-image.is-selected .compose-image__img")?.getAttribute("alt")).toBe("deux");
  });

  it("redimensionne en tirant un coin", () => {
    mount("");
    const editor = getComposeBodyEditor()!;
    editor.chain().focus().setImage({ src: SRC, alt: "photo" }).run();
    const pos = imagePos(editor);
    writeComposeImageWidth(editor, pos, 200);
    editor.commands.setNodeSelection(pos);
    const handle = document.querySelector<HTMLElement>(".compose-image__handle--se");
    const img = document.querySelector("img");
    expect(handle).toBeTruthy();
    expect(img).toBeTruthy();
    const start = composeImageDragStartWidth(img!.getBoundingClientRect().width, 200);
    handle!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 10, clientY: 4 }));
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 70, clientY: 4 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 70, clientY: 8 }));
    const expected = nextComposeImageWidth(start, 60, "se");
    expect(expected).toBeGreaterThan(start);
    expect(readComposeEditorHtml()).toContain(`width="${expected}"`);
  });
});
