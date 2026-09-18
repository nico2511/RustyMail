import { openTextPromptModal } from "../modals/promptConfirm";
import {
  applyMarkdownUndoRedo,
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
