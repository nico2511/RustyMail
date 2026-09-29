// @ts-nocheck — DOM wiring; tighten types incrementally.
import { applyMarkdownAction } from "./composeComposerBridge";

export function wireEventsDomComposeMarkdownToolbar(signal: AbortSignal): void {
  document.querySelectorAll<HTMLButtonElement>("[data-md]").forEach((button) => {
    button.addEventListener(
      "mousedown",
      (event) => {
        event.preventDefault();
      },
      { signal },
    );
    button.addEventListener(
      "click",
      () => {
        void applyMarkdownAction(button.dataset.md ?? "");
      },
      { signal },
    );
  });
  document.querySelectorAll<HTMLButtonElement>(".compose-toolbar [data-tone]").forEach((button) => {
    button.addEventListener(
      "keydown",
      (event) => {
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
        document.querySelector<HTMLButtonElement>(`.compose-toolbar [data-tone="${tone}"]`)?.focus();
      },
      { signal },
    );
  });
}
