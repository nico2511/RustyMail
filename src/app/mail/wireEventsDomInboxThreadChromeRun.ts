// @ts-nocheck — DOM wiring; tighten types incrementally.
import type { Tone } from "../types/appState";
import { composeRewriteStyleFromTone } from "../core/composeTone";
import { state } from "../state";
import { render } from "../dispatch";
import { composeAiRewrite } from "./composeAiWireActions";

/** Modal shells and tone picker shared across inbox / thread views. */
export function wireEventsDomInboxThreadChrome(signal: AbortSignal): void {
  document.querySelectorAll(".modal-shell-stop-prop").forEach((shell) => {
    shell.addEventListener("click", (e) => e.stopPropagation(), { signal });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-tone]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        state.tone = (button.dataset.tone as Tone) ?? state.tone;
        render();
        // Compose : un clic sur le ton réécrit tout de suite (pas de second « Réécrire »).
        if (state.view === "compose" && button.closest(".compose-toolbar")) {
          void composeAiRewrite(composeRewriteStyleFromTone());
        }
      },
      { signal },
    );
  });
}
