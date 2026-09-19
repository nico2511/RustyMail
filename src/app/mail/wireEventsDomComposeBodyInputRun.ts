// @ts-nocheck — DOM wiring; tighten types incrementally.
import {
  scheduleDraftRevisionSave,
  schedulePreviewUpdate,
  setComposeFromTextareaValue,
} from "./composeComposerBridge";

export function wireEventsDomComposeBodyInput(signal: AbortSignal): void {
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "input",
    (event) => {
      setComposeFromTextareaValue((event.currentTarget as HTMLTextAreaElement).value);
      schedulePreviewUpdate();
      scheduleDraftRevisionSave();
    },
    { signal },
  );
}
