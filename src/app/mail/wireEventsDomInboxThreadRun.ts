// @ts-nocheck — DOM wiring; tighten types incrementally.
import type { Tone } from "../types/appState";
import { wireEventsDomInboxList } from "./wireEventsDomInboxListRun";
import { wireEventsDomOrgConfirmModals, wireEventsDomOrgMailboxInline } from "./wireEventsDomOrgMailboxRun";
import { wireEventsDomThreadAttachments } from "./wireEventsDomThreadAttachmentsRun";
import { state } from "../state";
import { render } from "../dispatch";

export function wireEventsDomInboxThread(signal: AbortSignal): void {
  wireEventsDomInboxList(signal);
  wireEventsDomOrgMailboxInline(signal);
  wireEventsDomThreadAttachments(signal);
  document.querySelectorAll(".modal-shell-stop-prop").forEach((shell) => {
    shell.addEventListener("click", (e) => e.stopPropagation());
  });
  wireEventsDomOrgConfirmModals(signal);
  document.querySelectorAll<HTMLButtonElement>("[data-tone]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tone = (button.dataset.tone as Tone) ?? state.tone;
      render();
    });
  });
}
