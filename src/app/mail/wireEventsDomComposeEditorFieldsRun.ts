// @ts-nocheck — DOM wiring; tighten types incrementally.
import { sendQuickReply } from "./composeSendQuickReply";
import { markComposeDraftEdited } from "./composeDraftContentKey";
import { scheduleDraftRevisionSave, bindComposerDropzone } from "./composeComposerBridge";

export function wireEventsDomComposeEditorFields(signal: AbortSignal): void {
  document.querySelector<HTMLInputElement>("#compose-subject")?.addEventListener(
    "input",
    () => {
      markComposeDraftEdited();
      scheduleDraftRevisionSave();
    },
    { signal },
  );
  bindComposerDropzone();
  document.querySelector<HTMLInputElement>("[data-quick-reply]")?.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void sendQuickReply("reply");
      }
    },
    { signal },
  );
}
