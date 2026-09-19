// @ts-nocheck — DOM wiring; tighten types incrementally.
import { state } from "../state";
import {
  loadComposeMarkdownIntoEditor,
  schedulePreviewUpdate,
} from "./composeComposerBridge";

export function wireEventsDomComposeBodyPaste(signal: AbortSignal): void {
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "paste",
    (event) => {
      const e = event as ClipboardEvent;
      const textarea = e.currentTarget as HTMLTextAreaElement | null;
      if (!textarea) return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find((it) => it.kind === "file" && (it.type || "").startsWith("image/"));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl.startsWith("data:image/")) return;
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        const nlBefore = start > 0 && textarea.value[start - 1] !== "\n" ? "\n" : "";
        const nlAfter = end < textarea.value.length && textarea.value[end] !== "\n" ? "\n" : "";
        const stamp = new Date().toLocaleString();
        const snippet = `${nlBefore}![Capture ${stamp}](${dataUrl})${nlAfter}\n`;
        textarea.setRangeText(snippet, start, end, "end");
        loadComposeMarkdownIntoEditor(textarea.value);
        textarea.value = state.composeBody;
        schedulePreviewUpdate(0);
        textarea.focus();
      };
      reader.readAsDataURL(file);
    },
    { signal },
  );
}
