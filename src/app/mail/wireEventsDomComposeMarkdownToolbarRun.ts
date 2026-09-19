// @ts-nocheck — DOM wiring; tighten types incrementally.
import { applyMarkdownAction } from "./composeComposerBridge";

export function wireEventsDomComposeMarkdownToolbar(signal: AbortSignal): void {
  document.querySelectorAll<HTMLButtonElement>("[data-md]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        void applyMarkdownAction(button.dataset.md ?? "");
      },
      { signal },
    );
  });
}
