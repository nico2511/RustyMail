import { openTextPromptModal } from "../modals/promptConfirm";
import {
  finalizeMarkdownToolbarEdit,
  markdownPopPendingToolbarSnapshot,
  markdownPushToolbarUndoSnapshot,
} from "./composeMarkdownEditorState";

function composeBodyTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>("#compose-body");
}

export function applyMarkdownLinkAction(textarea: HTMLTextAreaElement): void {
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
    const ta = composeBodyTextarea();
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
}

export function applyMarkdownImageAction(textarea: HTMLTextAreaElement): void {
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
    const ta = composeBodyTextarea();
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
}
