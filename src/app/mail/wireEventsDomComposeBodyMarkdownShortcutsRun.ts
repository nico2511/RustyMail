// @ts-nocheck — DOM wiring; tighten types incrementally.
import { applyMarkdownAction } from "./composeComposerBridge";

export function wireEventsDomComposeBodyMarkdownShortcuts(signal: AbortSignal): void {
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "keydown",
    (event) => {
      const evk = event as KeyboardEvent;
      if (!(evk.ctrlKey || evk.metaKey)) return;
      const key = evk.key.toLowerCase();
      if (key === "b") {
        evk.preventDefault();
        void applyMarkdownAction("bold");
      } else if (key === "i") {
        evk.preventDefault();
        void applyMarkdownAction("italic");
      } else if (key === "k") {
        evk.preventDefault();
        void applyMarkdownAction("link");
      } else if (key === "u") {
        evk.preventDefault();
        void applyMarkdownAction("underline");
      }
    },
    { signal },
  );
}
