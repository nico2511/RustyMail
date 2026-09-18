import {
  finalizeMarkdownToolbarEdit,
  markdownPopPendingToolbarSnapshot,
  markdownPushToolbarUndoSnapshot,
} from "./composeMarkdownEditorState";
import {
  markdownInsertCodeOrFence,
  markdownToggleBlockquoteLines,
  markdownToggleBulletLines,
  markdownToggleHeadingLines,
  markdownToggleNumberedLines,
  wrapSelection,
} from "./composeMarkdownLineEditsRun";

export function applyMarkdownInlineToolbarAction(
  textarea: HTMLTextAreaElement,
  action: string,
  start: number,
  end: number,
  selected: string,
): boolean {
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
    return true;
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
    return false;
  }

  finalizeMarkdownToolbarEdit(textarea);
  return true;
}
