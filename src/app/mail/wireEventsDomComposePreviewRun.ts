// @ts-nocheck — DOM wiring; tighten types incrementally.
import { onComposePreviewClick } from "./wireEventsDomComposePreviewClickRun";

export function wireEventsDomComposePreview(signal: AbortSignal): void {
  document.querySelector<HTMLElement>(".composer-body .preview")?.addEventListener(
    "click",
    onComposePreviewClick,
    { signal },
  );
}
