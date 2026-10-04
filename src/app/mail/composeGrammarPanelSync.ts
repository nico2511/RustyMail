import { state } from "../state";
import { grammarOccurrenceCount, retainGrammarSuggestionsInText } from "./composeGrammarReplace";

function refreshHighlights(): void {
  // Import dynamique : évite le cycle panelSync ↔ bodyEditor ↔ highlights.
  void import("./composeGrammarHighlights").then((m) => m.refreshComposeGrammarHighlights());
}

/** Enlève le panneau ou les lignes dont l’extrait n’est plus dans le corps, sans rerendre l’éditeur. */
export function syncStaleComposeGrammarSuggestions(plain: string): void {
  const all = state.composeGrammarSuggestions;
  if (!all?.length) {
    document.querySelector(".compose-correction-panel")?.remove();
    refreshHighlights();
    return;
  }
  const live = retainGrammarSuggestionsInText(all, plain);
  if (live.length === all.length) return;
  state.composeGrammarSuggestions = live.length ? live : null;
  refreshHighlights();
  const panel = document.querySelector(".compose-correction-panel");
  if (!panel) return;
  if (!live.length) {
    panel.remove();
    return;
  }
  const items = [...panel.querySelectorAll<HTMLElement>(".compose-correction-item")];
  let kept = 0;
  for (const item of items) {
    const button = item.querySelector<HTMLElement>("[data-grammar-i]");
    const index = Number(button?.dataset.grammarI ?? "");
    const suggestion = all[index];
    if (!suggestion || grammarOccurrenceCount(plain, plain, suggestion) <= 0) {
      item.remove();
      continue;
    }
    if (button) button.dataset.grammarI = String(kept);
    kept += 1;
  }
}

export function clearComposeGrammarUi(): void {
  state.composeGrammarSuggestions = null;
  refreshHighlights();
}
