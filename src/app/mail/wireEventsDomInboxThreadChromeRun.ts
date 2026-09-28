// @ts-nocheck — DOM wiring; tighten types incrementally.
import type { Tone } from "../types/appState";
import { state } from "../state";
import { render } from "../dispatch";

/** Modal shells and tone picker shared across inbox / thread views. */
export function wireEventsDomInboxThreadChrome(): void {
  document.querySelectorAll(".modal-shell-stop-prop").forEach((shell) => {
    shell.addEventListener("click", (e) => e.stopPropagation());
  });
  document.querySelectorAll<HTMLButtonElement>("[data-tone]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tone = (button.dataset.tone as Tone) ?? state.tone;
      render();
    });
  });
}
