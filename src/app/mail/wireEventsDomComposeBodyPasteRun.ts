// @ts-nocheck — DOM wiring; tighten types incrementally.
import { state } from "../state";
import { toast } from "../lib/toast";
import {
  loadComposeMarkdownIntoEditor,
  schedulePreviewUpdate,
} from "./composeComposerBridge";
import { prepareInlineImageFromFile } from "./composeInlineImageLimits";

export function wireEventsDomComposeBodyPaste(signal: AbortSignal): void {
  const host = document.querySelector("#compose-body");
  if (!(host instanceof HTMLTextAreaElement)) return;
  host.addEventListener(
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
      void (async () => {
        const prepared = await prepareInlineImageFromFile(file);
        if (!prepared.ok) {
          toast.warning(prepared.error);
          return;
        }
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        const nlBefore = start > 0 && textarea.value[start - 1] !== "\n" ? "\n" : "";
        const nlAfter = end < textarea.value.length && textarea.value[end] !== "\n" ? "\n" : "";
        const stamp = new Date().toLocaleString();
        const snippet = `${nlBefore}![${prepared.alt || `Capture ${stamp}`}](${prepared.dataUrl})${nlAfter}\n`;
        textarea.setRangeText(snippet, start, end, "end");
        loadComposeMarkdownIntoEditor(textarea.value);
        textarea.value = state.composeBody;
        schedulePreviewUpdate(0);
        textarea.focus();
      })();
    },
    { signal },
  );
}
