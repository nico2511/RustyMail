import {
  collapseLargeDataImageMarkdown,
  expandInlineImagePlaceholders,
} from "../../composeMarkdownImages";
import { openTextPromptModal } from "../modals/promptConfirm";
import { state } from "../state";
import { schedulePreviewUpdate } from "./composeDraftPreview";

const markdownUndoStack: string[] = [];
const markdownRedoStack: string[] = [];

function composeDisplayToCanonical(display: string): string {
  return expandInlineImagePlaceholders(display, state.composeCanonicalBody || state.draft?.markdownBody || display);
}

export function setComposeFromTextareaValue(textareaValue: string) {
  state.composeBody = textareaValue;
  const canonical = composeDisplayToCanonical(textareaValue);
  state.composeCanonicalBody = canonical;
  if (state.draft) state.draft.markdownBody = canonical;
}

export function loadComposeMarkdownIntoEditor(markdown: string) {
  state.composeCanonicalBody = markdown;
  state.composeBody = collapseLargeDataImageMarkdown(markdown);
  if (state.draft) state.draft.markdownBody = markdown;
}

export function resetMarkdownEditorHistory() {
  markdownUndoStack.length = 0;
  markdownRedoStack.length = 0;
}

function markdownPushToolbarUndoSnapshot(value: string) {
  markdownUndoStack.push(value);
  if (markdownUndoStack.length > 42) markdownUndoStack.shift();
  markdownRedoStack.length = 0;
}

function markdownPopPendingToolbarSnapshot() {
  markdownUndoStack.pop();
}

function applyMarkdownUndoRedo(which: "undo" | "redo") {
  const textarea = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (!textarea) return;
  if (which === "undo") {
    if (!markdownUndoStack.length) return;
    markdownRedoStack.push(textarea.value);
    const prev = markdownUndoStack.pop()!;
    textarea.value = prev;
  } else if (!markdownRedoStack.length) {
    return;
  } else {
    markdownUndoStack.push(textarea.value);
    const next = markdownRedoStack.pop()!;
    textarea.value = next;
  }
  setComposeFromTextareaValue(textarea.value);
  schedulePreviewUpdate();
  textarea.focus();
}

function finalizeMarkdownToolbarEdit(textarea: HTMLTextAreaElement) {
  setComposeFromTextareaValue(textarea.value);
  schedulePreviewUpdate();
}

function markdownExpandSelectedLines(textarea: HTMLTextAreaElement) {
  const value = textarea.value;
  const selA = textarea.selectionStart ?? 0;
  const selB = textarea.selectionEnd ?? 0;
  const lo = Math.min(selA, selB);
  const hi = Math.max(selA, selB);
  const ls = value.lastIndexOf("\n", lo - 1) + 1;
  let le = value.indexOf("\n", hi);
  if (le === -1) le = value.length;
  return { value, ls, le };
}

function markdownToggleBulletLines(textarea: HTMLTextAreaElement, prefix = "- ") {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const allPrefixed =
    lines.length > 0 && lines.every((line) => line.trim() === "" || line.startsWith(prefix));
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    if (allPrefixed && line.startsWith(prefix)) return line.slice(prefix.length);
    return `${prefix}${line}`;
  });
  const replacement = nextLines.join("\n");
  textarea.setRangeText(replacement, ls, le, "end");
}

function markdownToggleNumberedLines(textarea: HTMLTextAreaElement) {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const allPrefixed =
    lines.length > 0 && lines.every((line) => line.trim() === "" || /^\s*\d+\.\s/.test(line));
  const nextLines =
    lines.length && allPrefixed
      ? lines.map((line) => (line.trim() === "" ? line : line.replace(/^\s*\d+\.\s*/, "").trimStart()))
      : lines.map((line, idx) =>
          line.trim() === ""
            ? line
            : `${idx + 1}. ${line.replace(/^\s*\d+\.\s*/, "").trimStart()}`,
        );
  textarea.setRangeText(nextLines.join("\n"), ls, le, "end");
}

function markdownToggleBlockquoteLines(textarea: HTMLTextAreaElement) {
  markdownToggleBulletLines(textarea, "> ");
}

function markdownToggleHeadingLines(textarea: HTMLTextAreaElement, level: 1 | 2 | 3 = 2) {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const prefix = `${"#".repeat(level)} `;
  const stripRe = /^(#{1,6})\s+/;
  const allAreSameHeading = lines.length > 0 && lines.every((line) => line.trim() === "" || line.startsWith(prefix));
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    const noHeading = line.replace(stripRe, "");
    return allAreSameHeading ? noHeading : `${prefix}${noHeading}`;
  });
  textarea.setRangeText(nextLines.join("\n"), ls, le, "end");
}

function markdownInsertCodeOrFence(textarea: HTMLTextAreaElement, start: number, end: number, selected: string) {
  if (selected && selected.includes("\n")) {
    const replacement = `\`\`\`\n${selected}\n\`\`\``;
    textarea.setRangeText(replacement, start, end, "end");
  } else {
    wrapSelection(textarea, start, end, "`", "`", selected || "code", { selectInnerWhenEmpty: true });
  }
}

function wrapSelection(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  fallbackText: string,
  options?: { selectInnerWhenEmpty?: boolean },
) {
  const selected = textarea.value.slice(start, end);
  const inner = selected || fallbackText;
  const replacement = `${prefix}${inner}${suffix}`;
  textarea.setRangeText(replacement, start, end, "end");
  if (!selected && options?.selectInnerWhenEmpty) {
    const innerStart = start + prefix.length;
    const innerEnd = innerStart + inner.length;
    textarea.setSelectionRange(innerStart, innerEnd);
  }
  textarea.focus();
}

export async function applyMarkdownAction(action: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (!textarea) return;

  if (action === "undo") {
    applyMarkdownUndoRedo("undo");
    return;
  }
  if (action === "redo") {
    applyMarkdownUndoRedo("redo");
    return;
  }

  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = textarea.value.slice(start, end);

  if (action === "link") {
    markdownPushToolbarUndoSnapshot(textarea.value);
    const linkStart = textarea.selectionStart ?? 0;
    const linkEnd = textarea.selectionEnd ?? 0;
    const linkSelected = textarea.value.slice(linkStart, linkEnd);
    void (async () => {
      const url = await openTextPromptModal({
        title: "Insérer un lien",
        label: "URL",
        defaultValue: "https://",
      });
      if (url == null) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const trimmed = url.trim();
      if (!trimmed) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
      if (!ta) return;
      const label = linkSelected || "lien";
      const replacement = `[${label}](${trimmed})`;
      ta.setRangeText(replacement, linkStart, linkEnd, "end");
      if (!linkSelected) {
        const labelStart = linkStart + 1;
        const labelEnd = labelStart + label.length;
        ta.setSelectionRange(labelStart, labelEnd);
      }
      ta.focus();
      finalizeMarkdownToolbarEdit(ta);
    })();
    return;
  }

  if (action === "image") {
    markdownPushToolbarUndoSnapshot(textarea.value);
    const imgStart = textarea.selectionStart ?? 0;
    const imgEnd = textarea.selectionEnd ?? 0;
    const imgSelected = textarea.value.slice(imgStart, imgEnd);
    void (async () => {
      const url = await openTextPromptModal({
        title: "Insérer une image",
        label: "URL de l’image",
        defaultValue: "https://",
      });
      if (url == null) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const trimmed = url.trim();
      if (!trimmed) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
      if (!ta) return;
      const alt = imgSelected || "image";
      const replacement = `![${alt}](${trimmed})`;
      ta.setRangeText(replacement, imgStart, imgEnd, "end");
      if (!imgSelected) {
        const altStart = imgStart + 2;
        const altEnd = altStart + alt.length;
        ta.setSelectionRange(altStart, altEnd);
      }
      ta.focus();
      finalizeMarkdownToolbarEdit(ta);
    })();
    return;
  }

  if (action === "table") {
    markdownPushToolbarUndoSnapshot(textarea.value);
    const hdr = "| En-tête 1 ";
    const stub = `\n\n${hdr}| En-tête 2 |\n| --- | --- |\n|  |  |\n\n`;
    textarea.setRangeText(stub, start, end, "end");
    const sliceFrom = Math.min(start, textarea.value.length);
    const hdrPos = textarea.value.indexOf(hdr, sliceFrom);
    if (hdrPos >= 0) {
      const innerStart = hdrPos + 2;
      textarea.setSelectionRange(innerStart, innerStart + "En-tête 1".length);
    }
    textarea.focus();
    finalizeMarkdownToolbarEdit(textarea);
    return;
  }

  markdownPushToolbarUndoSnapshot(textarea.value);

  if (action === "bold") {
    wrapSelection(textarea, start, end, "**", "**", selected || "texte", { selectInnerWhenEmpty: true });
  } else if (action === "italic") {
    wrapSelection(textarea, start, end, "*", "*", selected || "texte", { selectInnerWhenEmpty: true });
  } else if (action === "underline") {
    wrapSelection(textarea, start, end, "<u>", "</u>", selected || "texte", { selectInnerWhenEmpty: true });
  } else if (action === "h1") {
    markdownToggleHeadingLines(textarea, 1);
  } else if (action === "h2") {
    markdownToggleHeadingLines(textarea, 2);
  } else if (action === "h3") {
    markdownToggleHeadingLines(textarea, 3);
  } else if (action === "ul") {
    markdownToggleBulletLines(textarea, "- ");
  } else if (action === "ol") {
    markdownToggleNumberedLines(textarea);
  } else if (action === "quote") {
    markdownToggleBlockquoteLines(textarea);
  } else if (action === "code") {
    markdownInsertCodeOrFence(textarea, start, end, selected);
  } else {
    markdownPopPendingToolbarSnapshot();
    return;
  }

  finalizeMarkdownToolbarEdit(textarea);
}
