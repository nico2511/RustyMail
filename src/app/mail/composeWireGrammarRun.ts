import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { state } from "../state";
import { computePreview } from "./composeComposerBridge";

export function applyComposeGrammarSuggestionAtIndex(index: number): void {
  const g = state.composeGrammarSuggestions?.[index];
  if (!g) return;
  const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
  const src = ta?.value ?? state.composeBody;
  const o = g.original ?? "";
  const r = g.replacement ?? "";
  if (!o) return;
  const next = src.replace(o, r);
  state.composeBody = next;
  state.composeCanonicalBody = next;
  if (ta) ta.value = next;
  void computePreview();
  toast("Remplacement appliqué (première occurrence).");
  render();
}
