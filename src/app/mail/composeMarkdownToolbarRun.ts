import { applyMarkdownUndoRedo } from "./composeMarkdownEditorState";
import { applyMarkdownInlineToolbarAction } from "./composeMarkdownToolbarInlineRun";
import { applyMarkdownImageAction, applyMarkdownLinkAction } from "./composeMarkdownToolbarUrlPromptRun";

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
    applyMarkdownLinkAction(textarea);
    return;
  }
  if (action === "image") {
    applyMarkdownImageAction(textarea);
    return;
  }

  applyMarkdownInlineToolbarAction(textarea, action, start, end, selected);
}
