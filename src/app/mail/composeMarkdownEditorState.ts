import {
  collapseLargeDataImageMarkdown,
  expandInlineImagePlaceholders,
} from "../../composeMarkdownImages";
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

export function markdownPushToolbarUndoSnapshot(value: string) {
  markdownUndoStack.push(value);
  if (markdownUndoStack.length > 42) markdownUndoStack.shift();
  markdownRedoStack.length = 0;
}

export function markdownPopPendingToolbarSnapshot() {
  markdownUndoStack.pop();
}

export function applyMarkdownUndoRedo(which: "undo" | "redo") {
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

export function finalizeMarkdownToolbarEdit(textarea: HTMLTextAreaElement) {
  setComposeFromTextareaValue(textarea.value);
  schedulePreviewUpdate();
}
