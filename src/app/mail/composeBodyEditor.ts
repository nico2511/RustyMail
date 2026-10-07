import { Editor, Extension } from "@tiptap/core";
import { ComposeImage, selectComposeImageSrc } from "./composeImage";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import type { Node as PMNode } from "@tiptap/pm/model";
import { escapeHtml } from "../../ui/sanitize";
import { openTextPromptModal } from "../modals/promptConfirm";
import { state } from "../state";
import {
  COMPOSE_HTML_MARK,
  composeSourcePlainText,
  composeSourceToEditorHtml,
  isComposeHtmlSource,
  markComposeHtml,
  unwrapComposeHtml,
} from "./composeHtmlBody";
import { syncStaleComposeGrammarSuggestions } from "./composeGrammarPanelSync";
import { draftBodyIdentity, markComposeDraftEdited } from "./composeDraftContentKey";
import { ComposeGrammarHighlights } from "./composeGrammarHighlights";
import { schedulePreviewUpdate } from "./composeDraftPreview";
import { scheduleDraftRevisionSave } from "./composeDraftRevisionAutosave";
import { prepareInlineImageFromFile } from "./composeInlineImageLimits";
import {
  ComposeTable,
  ComposeTableCell,
  ComposeTableHeader,
  ComposeTableRow,
  promptComposeTableSize,
} from "./composeTable";
import { toast } from "../lib/toast";

const BLOCK_SEPARATOR = "\n\n";

type PlainSpan = { start: number; end: number };

const plainTextOptions = {
  blockSeparator: BLOCK_SEPARATOR,
  textSerializers: {
    hardBreak: () => "\n",
  },
};

let editor: Editor | null = null;
let hostEl: HTMLElement | null = null;
let ignore = 0;
let dirty = false;
let loadedSource = "";

function editorPlain(ed: Editor): string {
  return ed.getText(plainTextOptions);
}

export function getComposeBodyEditor(): Editor | null {
  if (!editor || editor.isDestroyed) return null;
  return editor;
}

export function readComposePlainText(): string {
  const ed = getComposeBodyEditor();
  if (ed) return editorPlain(ed);
  return composeSourcePlainText(state.composeCanonicalBody || state.composeBody || "");
}

export function readComposeEditorHtml(): string {
  const ed = getComposeBodyEditor();
  if (!ed) return composeSourceToEditorHtml(state.composeCanonicalBody || state.composeBody || "");
  return ed.getHTML();
}

function storedFromEditor(ed: Editor): string {
  const html = ed.getHTML();
  const plain = editorPlain(ed).replace(/\u00a0/g, " ").trim();
  const hasImage = /<img\b/i.test(html);
  if (!plain && !hasImage) return "";
  return `${COMPOSE_HTML_MARK}${html}`;
}

function persistFromEditor(ed: Editor): void {
  const stored = storedFromEditor(ed);
  loadedSource = stored;
  state.composeBody = stored;
  state.composeCanonicalBody = stored;
  if (state.draft) state.draft.markdownBody = stored;
  syncStaleComposeGrammarSuggestions(editorPlain(ed).replace(/\u00a0/g, " "));
}

function scheduleAfterEdit(): void {
  markComposeDraftEdited();
  schedulePreviewUpdate();
  try {
    scheduleDraftRevisionSave();
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("registerComposeDraftRevisionAutosaveDeps")) {
      throw err;
    }
  }
}

function syncToolbarPressed(ed: Editor): void {
  const flags: Record<string, boolean> = {
    bold: ed.isActive("bold"),
    italic: ed.isActive("italic"),
    underline: ed.isActive("underline"),
    h1: ed.isActive("heading", { level: 1 }),
    h2: ed.isActive("heading", { level: 2 }),
    h3: ed.isActive("heading", { level: 3 }),
    ul: ed.isActive("bulletList"),
    ol: ed.isActive("orderedList"),
    link: ed.isActive("link"),
    quote: ed.isActive("blockquote"),
    code: ed.isActive("code") || ed.isActive("codeBlock"),
  };
  for (const [id, on] of Object.entries(flags)) {
    document.querySelectorAll<HTMLButtonElement>(`[data-md="${id}"]`).forEach((button) => {
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
}

/**
 * Aligne un intervalle du texte visible (`getText`) sur les positions ProseMirror.
 * Les images ne contribuent pas au texte : un remplacement ne les englobe pas.
 */
export function mapComposePlainSpanToDoc(doc: PMNode, span: PlainSpan, blockSeparator = BLOCK_SEPARATOR): { from: number; to: number } | null {
  if (span.end <= span.start) return null;
  let text = "";
  let from: number | null = null;
  let to: number | null = null;

  const cover = (plainStart: number, plainEnd: number, docStart: number, docEnd: number) => {
    const lo = Math.max(span.start, plainStart);
    const hi = Math.min(span.end, plainEnd);
    if (hi <= lo) return;
    if (docEnd === docStart) {
      if (from == null) from = docStart;
      to = Math.max(to ?? docStart, docStart);
      return;
    }
    const mappedFrom = docStart + (lo - plainStart);
    const mappedTo = docStart + (hi - plainStart);
    if (from == null) from = mappedFrom;
    to = mappedTo;
  };

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.isBlock && pos > 0) {
      const plainStart = text.length;
      text += blockSeparator;
      cover(plainStart, text.length, pos, pos);
    }
    if (node.type.name === "hardBreak") {
      const plainStart = text.length;
      text += "\n";
      cover(plainStart, text.length, pos, pos + node.nodeSize);
      return false;
    }
    if (node.isText) {
      const nodeText = node.text ?? "";
      const plainStart = text.length;
      text += nodeText;
      cover(plainStart, text.length, pos, pos + nodeText.length);
    }
    return undefined;
  });

  if (from == null || to == null || to < from) return null;
  return { from, to };
}

const ComposeLinkKeys = Extension.create({
  name: "composeLinkKeys",
  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        const { from, to } = this.editor.state.selection;
        queueMicrotask(() => {
          void promptLink(from, to);
        });
        return true;
      },
    };
  },
});

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href)) return null;
  return href;
}

function safeImageSrc(raw: string): string | null {
  const src = raw.trim();
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (/^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(src)) return src;
  return null;
}

async function promptLink(from: number, to: number): Promise<void> {
  const ed = getComposeBodyEditor();
  const selected = ed ? ed.state.doc.textBetween(from, to, "") : "";
  const url = await openTextPromptModal({
    title: "Insérer un lien",
    label: "URL",
    defaultValue: "https://",
  });
  if (url == null) return;
  const href = safeHref(url);
  if (!href) return;
  const next = getComposeBodyEditor();
  if (!next) return;
  const max = next.state.doc.content.size;
  const start = Math.max(0, Math.min(from, max));
  const end = Math.max(start, Math.min(to, max));
  if (start === end) {
    const label = selected.trim() || "lien";
    next
      .chain()
      .focus()
      .insertContentAt(start, {
        type: "text",
        text: label,
        marks: [{ type: "link", attrs: { href } }],
      })
      .run();
    return;
  }
  next.chain().focus().setTextSelection({ from: start, to: end }).setLink({ href }).run();
}

function placeImageInEditor(src: string, alt: string, from: number, to: number): void {
  const next = getComposeBodyEditor();
  if (!next) return;
  const max = next.state.doc.content.size;
  const start = Math.max(0, Math.min(from, max));
  const end = Math.max(start, Math.min(to, max));
  const chain = next.chain().focus();
  if (start !== end) chain.deleteRange({ from: start, to: end });
  chain.setImage({ src, alt }).run();
}

function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      try {
        input.remove();
      } catch {
        /* déjà retiré */
      }
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
    // Fallback si l’événement `cancel` n’existe pas (focus retour après dialogue).
    window.setTimeout(() => {
      if (settled) return;
      window.addEventListener(
        "focus",
        () => {
          window.setTimeout(() => {
            if (!settled) finish(input.files?.[0] ?? null);
          }, 350);
        },
        { once: true },
      );
    }, 0);
  });
}

async function promptImage(from: number, to: number): Promise<void> {
  const ed = getComposeBodyEditor();
  const selected = ed ? ed.state.doc.textBetween(from, to, " ").trim() : "";
  const file = await pickImageFile();
  if (file) {
    const prepared = await prepareInlineImageFromFile(file);
    if (!prepared.ok) {
      toast.warning(prepared.error);
      return;
    }
    placeImageInEditor(prepared.dataUrl, selected || prepared.alt, from, to);
    return;
  }
  const url = await openTextPromptModal({
    title: "Insérer une image",
    label: "URL de l’image (ou annulez puis choisissez un fichier via le sélecteur)",
    defaultValue: "https://",
  });
  if (url == null) return;
  const src = safeImageSrc(url);
  if (!src) {
    toast.warning("URL d’image invalide.");
    return;
  }
  placeImageInEditor(src, selected || "image", from, to);
}

function insertImageFile(file: File): void {
  void (async () => {
    const prepared = await prepareInlineImageFromFile(file);
    if (!prepared.ok) {
      toast.warning(prepared.error);
      return;
    }
    const ed = getComposeBodyEditor();
    if (!ed) return;
    const stamp = new Date().toLocaleString();
    ed.chain().focus().setImage({ src: prepared.dataUrl, alt: prepared.alt || `Capture ${stamp}` }).run();
    selectComposeImageSrc(ed, prepared.dataUrl);
  })();
}

export function destroyComposeBodyEditor(): void {
  const current = editor;
  editor = null;
  hostEl = null;
  if (!current || current.isDestroyed) {
    dirty = false;
    return;
  }
  try {
    if (dirty) persistFromEditor(current);
  } catch {
    /* le document peut déjà être détaché */
  }
  dirty = false;
  try {
    current.destroy();
  } catch {
    /* le nœud a été retiré par le rendu */
  }
}

export function mountComposeBodyEditor(host: HTMLElement): void {
  if (editor && hostEl === host && host.isConnected && !editor.isDestroyed) return;
  destroyComposeBodyEditor();
  const source = state.composeCanonicalBody || state.composeBody || "";
  const offscreen = host.classList.contains("composer-source-offscreen");
  ignore += 1;
  try {
    editor = new Editor({
      element: host,
      editable: !offscreen,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: { rel: "noopener noreferrer" },
        }),
        ComposeImage.configure({ inline: true, allowBase64: true }),
        Placeholder.configure({ placeholder: "Écrire le message…" }),
        ComposeTable.configure({ resizable: false }),
        ComposeTableRow,
        ComposeTableHeader,
        ComposeTableCell,
        ComposeLinkKeys,
        ComposeGrammarHighlights,
      ],
      content: composeSourceToEditorHtml(source),
      editorProps: {
        attributes: {
          class: "compose-tiptap__surface",
          "aria-label": "Corps du message",
          spellcheck: "true",
        },
        handlePaste: (_view, event) => {
          const items = Array.from(event.clipboardData?.items ?? []);
          const imgItem = items.find((item) => item.kind === "file" && (item.type || "").startsWith("image/"));
          const file = imgItem?.getAsFile();
          if (!file) return false;
          event.preventDefault();
          insertImageFile(file);
          return true;
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (ignore > 0) return;
        const stored = storedFromEditor(ed);
        const prev = state.composeCanonicalBody || state.composeBody || "";
        if (draftBodyIdentity(stored) === draftBodyIdentity(prev)) return;
        dirty = true;
        persistFromEditor(ed);
        syncToolbarPressed(ed);
        scheduleAfterEdit();
      },
      onSelectionUpdate: ({ editor: ed }) => {
        syncToolbarPressed(ed);
      },
    });
    loadedSource = source;
    dirty = false;
    hostEl = host;
    syncToolbarPressed(editor);
  } finally {
    ignore -= 1;
  }
}

export function syncComposeEditorFromState(): void {
  const ed = getComposeBodyEditor();
  if (!ed) return;
  const source = state.composeCanonicalBody || state.composeBody || "";
  if (source === loadedSource) return;
  ignore += 1;
  try {
    ed.commands.setContent(composeSourceToEditorHtml(source), false);
    loadedSource = source;
    dirty = false;
  } finally {
    ignore -= 1;
  }
}

export function flushComposeEditorToState(): void {
  const ed = getComposeBodyEditor();
  if (!ed || !dirty) return;
  persistFromEditor(ed);
}

export async function applyComposeToolbarCommand(action: string): Promise<void> {
  const ed = getComposeBodyEditor();
  if (!ed) return;
  if (action === "undo") {
    ed.chain().focus().undo().run();
    return;
  }
  if (action === "redo") {
    ed.chain().focus().redo().run();
    return;
  }
  if (action === "link") {
    const { from, to } = ed.state.selection;
    await promptLink(from, to);
    return;
  }
  if (action === "image") {
    const { from, to } = ed.state.selection;
    await promptImage(from, to);
    return;
  }
  const chain = ed.chain().focus();
  switch (action) {
    case "bold":
      chain.toggleBold().run();
      break;
    case "italic":
      chain.toggleItalic().run();
      break;
    case "underline":
      chain.toggleUnderline().run();
      break;
    case "h1":
      chain.toggleHeading({ level: 1 }).run();
      break;
    case "h2":
      chain.toggleHeading({ level: 2 }).run();
      break;
    case "h3":
      chain.toggleHeading({ level: 3 }).run();
      break;
    case "ul":
      chain.toggleBulletList().run();
      break;
    case "ol":
      chain.toggleOrderedList().run();
      break;
    case "quote":
      chain.toggleBlockquote().run();
      break;
    case "code": {
      const { from, to } = ed.state.selection;
      const selected = ed.state.doc.textBetween(from, to, "\n");
      if (selected.includes("\n") || ed.isActive("codeBlock")) chain.toggleCodeBlock().run();
      else chain.toggleCode().run();
      break;
    }
    case "table": {
      const size = promptComposeTableSize();
      if (!size) break;
      chain.insertTable({ rows: size.rows, cols: size.cols, withHeaderRow: true }).run();
      break;
    }
    case "table-add-row":
      chain.addRowAfter().run();
      break;
    case "table-add-col":
      chain.addColumnAfter().run();
      break;
    case "table-del-row":
      chain.deleteRow().run();
      break;
    case "table-del-col":
      chain.deleteColumn().run();
      break;
    case "table-del":
      chain.deleteTable().run();
      break;
    default:
      break;
  }
}

export function prependComposePlainText(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const current = state.composeCanonicalBody || state.composeBody || "";
  if (isComposeHtmlSource(current)) {
    const html = `<p>${escapeHtml(trimmed)}</p>${unwrapComposeHtml(current)}`;
    assignComposeSource(markComposeHtml(html));
    return;
  }
  const base = current.replace(/^\uFEFF/, "");
  assignComposeSource(base.trim() ? `${trimmed}\n\n${base}` : trimmed);
}

export function appendComposePlainText(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const current = state.composeCanonicalBody || state.draft?.markdownBody || state.composeBody || "";
  if (isComposeHtmlSource(current)) {
    assignComposeSource(markComposeHtml(`${unwrapComposeHtml(current)}<p>${escapeHtml(trimmed)}</p>`));
    return;
  }
  const base = current.trimEnd();
  assignComposeSource(base ? `${base}\n\n${trimmed}` : trimmed);
}

/** Remplace la dernière occurrence d’un segment texte brut appendu (dictée → réécriture). */
export function replaceLastComposePlainSegment(oldText: string, newText: string): boolean {
  const oldT = oldText.trim();
  const newT = newText.trim();
  if (!oldT || !newT || oldT === newT) return false;
  const current = state.composeCanonicalBody || state.draft?.markdownBody || state.composeBody || "";
  if (isComposeHtmlSource(current)) {
    const html = unwrapComposeHtml(current);
    const needle = `<p>${escapeHtml(oldT)}</p>`;
    const idx = html.lastIndexOf(needle);
    if (idx < 0) return false;
    const next =
      html.slice(0, idx) + `<p>${escapeHtml(newT)}</p>` + html.slice(idx + needle.length);
    assignComposeSource(markComposeHtml(next));
    return true;
  }
  const idx = current.lastIndexOf(oldT);
  if (idx < 0) return false;
  assignComposeSource(current.slice(0, idx) + newT + current.slice(idx + oldT.length));
  return true;
}

export function replaceComposeWithModelText(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    assignComposeSource("");
    return;
  }
  assignComposeSource(markComposeHtml(composeSourceToEditorHtml(trimmed)));
}

/** Sélection non vide dans le corps TipTap (texte brut). */
export function readComposeSelectionPlainText(): string {
  const ed = getComposeBodyEditor();
  if (!ed) return "";
  const { from, to } = ed.state.selection;
  if (to <= from) return "";
  return ed.state.doc.textBetween(from, to, BLOCK_SEPARATOR, "\n");
}

export function hasComposeTextSelection(): boolean {
  return readComposeSelectionPlainText().trim().length > 0;
}

/** Instantané de sélection (survît au clic menu / perte de focus / attente LLM). */
export type ComposeSelectionSnapshot = {
  from: number;
  to: number;
  text: string;
};

export function captureComposeSelectionSnapshot(): ComposeSelectionSnapshot | null {
  const ed = getComposeBodyEditor();
  if (!ed) return null;
  const { from, to } = ed.state.selection;
  if (to <= from) return null;
  const text = ed.state.doc.textBetween(from, to, BLOCK_SEPARATOR, "\n");
  if (!text.trim()) return null;
  return { from, to, text };
}

/** Remplace la sélection (courante ou instantané capturé) par du texte. */
export function replaceComposeSelectionWithText(
  text: string,
  snap?: ComposeSelectionSnapshot | null,
): boolean {
  const ed = getComposeBodyEditor();
  if (!ed) return false;
  let from: number;
  let to: number;
  if (snap) {
    from = snap.from;
    to = snap.to;
    if (from < 0 || to <= from || to > ed.state.doc.content.size) return false;
    const current = ed.state.doc.textBetween(from, to, BLOCK_SEPARATOR, "\n");
    if (current !== snap.text) return false;
  } else {
    ({ from, to } = ed.state.selection);
    if (to <= from) return false;
  }
  const insert = text.replace(/\u00a0/g, " ");
  ignore += 1;
  try {
    ed.chain().focus().insertContentAt({ from, to }, insert).run();
    persistFromEditor(ed);
    dirty = true;
    scheduleAfterEdit();
  } finally {
    ignore -= 1;
  }
  return true;
}

function assignComposeSource(source: string): void {
  const prev = state.composeCanonicalBody || state.composeBody || "";
  state.composeCanonicalBody = source;
  state.composeBody = source;
  if (state.draft) state.draft.markdownBody = source;
  loadedSource = "";
  syncComposeEditorFromState();
  syncStaleComposeGrammarSuggestions(composeSourcePlainText(source));
  if (draftBodyIdentity(source) !== draftBodyIdentity(prev)) scheduleAfterEdit();
}
