import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { state } from "../state";
import {
  computePreview,
  loadComposeMarkdownIntoEditor,
  setComposeFromTextareaValue,
} from "./composeComposerBridge";
import { fallbackDraftPreview } from "./composeDraftPreview";
import {
  applyGrammarReplacement,
  countGrammarOccurrences,
  type GrammarReplaceInput,
} from "./composeGrammarReplace";
import { markdownPushToolbarUndoSnapshot } from "./composeMarkdownEditorState";

const TOAST_APPLIED = "Remplacement appliqué.";
const TOAST_APPLIED_FIRST = "Remplacement appliqué (première occurrence).";
const TOAST_MISSING = "Occurrence introuvable — le texte n’a pas été modifié.";

function suggestionAt(index: number): (GrammarReplaceInput & { reason?: string }) | null {
  const g = state.composeGrammarSuggestions?.[index];
  if (!g?.original?.trim()) return null;
  return g;
}

function syncComposeTextarea(): void {
  const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (ta && ta.value !== state.composeBody) ta.value = state.composeBody;
}

/**
 * Écrit l’éditeur puis le repeint.
 * `render()` recrée le textarea : on réassigne `.value` ensuite, y compris au frame
 * suivant, pour que la vue SPLIT ne reste pas sur l’ancien contenu.
 */
function paintComposeEditor(): void {
  const markdown = state.composeCanonicalBody || state.composeBody;
  state.preview = fallbackDraftPreview(markdown);
  const expected = state.composeBody;
  syncComposeTextarea();
  render();
  syncComposeTextarea();
  window.requestAnimationFrame(() => {
    if (state.composeBody !== expected) return;
    syncComposeTextarea();
  });
}

function forgetSuggestionIfExhausted(index: number, suggestion: GrammarReplaceInput): void {
  const inDisplay = countGrammarOccurrences(state.composeBody, suggestion);
  const inCanonical =
    state.composeCanonicalBody !== state.composeBody
      ? countGrammarOccurrences(state.composeCanonicalBody, suggestion)
      : 0;
  if (inDisplay + inCanonical > 0) return;
  const list = state.composeGrammarSuggestions;
  if (!list) return;
  const next = list.filter((_, i) => i !== index);
  state.composeGrammarSuggestions = next.length ? next : null;
}

/**
 * Applique la suggestion `index` sur le corps du compositeur.
 * Une seule occurrence (la première) est remplacée ; le toast le dit seulement si le texte a changé.
 */
export function applyComposeGrammarSuggestionAtIndex(index: number): void {
  const suggestion = suggestionAt(index);
  if (!suggestion) return;

  const textarea = document.querySelector<HTMLTextAreaElement>("#compose-body");
  const display = textarea?.value ?? state.composeBody;
  const canonical = state.composeCanonicalBody || state.draft?.markdownBody || display;

  const onDisplay = applyGrammarReplacement(display, suggestion);
  let occurrences = 0;
  if (onDisplay.replaced > 0 && onDisplay.text !== display) {
    markdownPushToolbarUndoSnapshot(display);
    setComposeFromTextareaValue(onDisplay.text);
    occurrences = onDisplay.occurrences;
  } else if (canonical !== display) {
    const onCanonical = applyGrammarReplacement(canonical, suggestion);
    if (onCanonical.replaced > 0 && onCanonical.text !== canonical) {
      markdownPushToolbarUndoSnapshot(display);
      loadComposeMarkdownIntoEditor(onCanonical.text);
      occurrences = onCanonical.occurrences;
    }
  }

  if (occurrences <= 0) {
    toast(TOAST_MISSING);
    return;
  }

  forgetSuggestionIfExhausted(index, suggestion);
  toast(occurrences > 1 ? TOAST_APPLIED_FIRST : TOAST_APPLIED);
  paintComposeEditor();
  void computePreview();
}
