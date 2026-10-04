import { state } from "../state";
import { composeMicButtonTitle, micAriaLabel, threadQaMicButtonTitle } from "./composeMicUiHints";

/** Met à jour les boutons micro sans `render()` (évite de détruire TipTap pendant l’enregistrement). */
export function patchMicButtonsDom(): void {
  const recording = state.micState === "recording";
  document.querySelectorAll<HTMLButtonElement>(".mic-button").forEach((btn) => {
    btn.classList.remove("idle", "recording", "processing");
    btn.classList.add(state.micState);
    btn.setAttribute("aria-pressed", recording ? "true" : "false");
    const isThreadQa = btn.dataset.action === "mic-thread-qa";
    btn.title = isThreadQa ? threadQaMicButtonTitle() : composeMicButtonTitle();
    btn.setAttribute("aria-label", micAriaLabel(isThreadQa ? "thread-qa" : "compose"));
  });
}
