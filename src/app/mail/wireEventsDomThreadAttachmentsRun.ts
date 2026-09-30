// @ts-nocheck — DOM wiring; tighten types incrementally.
import { hydrateEmailHtml } from "./mailContentWireActions";
import { state } from "../state";
import { wireEventsDomThreadAttachmentButtons } from "./wireEventsDomThreadAttachmentButtonsRun";

export function wireEventsDomThreadAttachments(signal: AbortSignal): void {
  wireEventsDomThreadAttachmentButtons(signal);
  if (state.view === "thread") {
    hydrateEmailHtml();
  }
}
