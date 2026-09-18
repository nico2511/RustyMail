// @ts-nocheck — DOM wiring; tighten types incrementally.
import { sendQuickReply } from "./composeSendQuickReply";
import { scheduleDraftRevisionSave, bindComposerDropzone } from "./composeComposerBridge";
import { wireEventsDomComposePreview } from "./wireEventsDomComposePreviewRun";
import {
  wireEventsDomComposeBodyTextarea,
  wireEventsDomComposeMarkdownToolbar,
} from "./wireEventsDomComposeBodyRun";

export function wireEventsDomComposeEditor(signal: AbortSignal): void {
  wireEventsDomComposePreview(signal);
  wireEventsDomComposeBodyTextarea(signal);
  document.querySelector<HTMLInputElement>("#compose-subject")?.addEventListener(
    "input",
    () => {
      scheduleDraftRevisionSave();
    },
    { signal },
  );
  wireEventsDomComposeMarkdownToolbar(signal);
  bindComposerDropzone();
  document.querySelector<HTMLInputElement>("[data-quick-reply]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void sendQuickReply("reply");
    }
  });
}
