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
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
        return;
      }
      const group = button.closest("[role='radiogroup']");
      if (!group) return;
      const radios = [...group.querySelectorAll<HTMLButtonElement>("[data-tone]")];
      const index = radios.indexOf(button);
      if (index < 0 || radios.length === 0) return;
      let nextIndex = index;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % radios.length;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + radios.length) % radios.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = radios.length - 1;
      event.preventDefault();
      const tone = radios[nextIndex]?.dataset.tone;
      radios[nextIndex]?.click();
      if (!tone) return;
      document.querySelector<HTMLButtonElement>(`[role="radiogroup"] [data-tone="${tone}"]`)?.focus();
    });
  });
}
