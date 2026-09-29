import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { state } from "../state";
import {
  getComposeBodyEditor,
  mapComposePlainSpanToDoc,
  readComposePlainText,
  syncComposeEditorFromState,
} from "./composeBodyEditor";
import {
  computePreview,
  loadComposeMarkdownIntoEditor,
  setComposeFromTextareaValue,
} from "./composeComposerBridge";
import { fallbackDraftPreview } from "./composeDraftPreview";
import {
  applyGrammarReplacement,
  countGrammarOccurrences,
  findGrammarSpans,
  grammarTextsMatch,
  replacementDropsWords,
  type GrammarReplaceInput,
} from "./composeGrammarReplace";

const TOAST_APPLIED = "Remplacement appliqué.";
const TOAST_APPLIED_FIRST = "Remplacement appliqué (première occurrence).";
const TOAST_MISSING = "Occurrence introuvable — le texte n’a pas été modifié.";

function suggestionAt(index: number): (GrammarReplaceInput & { reason?: string }) | null {
  const g = state.composeGrammarSuggestions?.[index];
  if (!g?.original?.trim()) return null;
  return g;
}

/**
 * Met à jour l’aperçu puis repeint.
 * `render()` recrée le point de montage TipTap : le contenu vient de l’état,
 * y compris au frame suivant, pour que les deux volets SPLIT restent alignés.
 */
function paintComposeEditor(): void {
  const markdown = state.composeCanonicalBody || state.composeBody;
  state.preview = fallbackDraftPreview(markdown);
  const expected = state.composeCanonicalBody;
  syncComposeEditorFromState();
  render();
  syncComposeEditorFromState();
  window.requestAnimationFrame(() => {
    if (state.composeCanonicalBody !== expected) return;
    syncComposeEditorFromState();
  });
}

function forgetSuggestionIfExhausted(index: number, suggestion: GrammarReplaceInput): void {
  const editor = getComposeBodyEditor();
  const remaining = editor
    ? countGrammarOccurrences(readComposePlainText(), suggestion)
    : countGrammarOccurrences(state.composeBody, suggestion) +
      (state.composeCanonicalBody !== state.composeBody
        ? countGrammarOccurrences(state.composeCanonicalBody, suggestion)
        : 0);
  if (remaining > 0) return;
  const list = state.composeGrammarSuggestions;
  if (!list) return;
  const next = list.filter((_, i) => i !== index);
  state.composeGrammarSuggestions = next.length ? next : null;
}

function finishApplied(index: number, suggestion: GrammarReplaceInput, occurrences: number): void {
  forgetSuggestionIfExhausted(index, suggestion);
  toast.success(occurrences > 1 ? TOAST_APPLIED_FIRST : TOAST_APPLIED);
  paintComposeEditor();
  void computePreview();
}

/**
 * Applique la suggestion `index` sur le corps du compositeur.
 * Une seule occurrence (la première du texte visible) est remplacée.
 */
export function applyComposeGrammarSuggestionAtIndex(index: number): void {
  const suggestion = suggestionAt(index);
  if (!suggestion) return;
  if (replacementDropsWords(suggestion.original, suggestion.replacement ?? "")) {
    toast.warning("Cette suggestion retirerait du texte — elle n’a pas été appliquée.");
    return;
  }

  const editor = getComposeBodyEditor();
  if (editor) {
    const plain = readComposePlainText();
    const spans = findGrammarSpans(plain, suggestion);
    if (spans.length) {
      const first = spans[0]!;
      const applied = editor
        .chain()
        .focus()
        .command(({ tr, state: docState }) => {
          const mapped = mapComposePlainSpanToDoc(docState.doc, first);
          if (!mapped) return false;
          const slice = docState.doc.textBetween(mapped.from, mapped.to, "\n");
          if (!grammarTextsMatch(slice, suggestion.original)) return false;
          tr.insertText(suggestion.replacement ?? "", mapped.from, mapped.to);
          return true;
        })
        .run();
      if (applied) {
        finishApplied(index, suggestion, spans.length);
        return;
      }
    }
  }

  const display = state.composeBody;
  const canonical = state.composeCanonicalBody || state.draft?.markdownBody || display;
  const onDisplay = applyGrammarReplacement(display, suggestion);
  let occurrences = 0;
  if (onDisplay.replaced > 0 && onDisplay.text !== display) {
    setComposeFromTextareaValue(onDisplay.text);
    occurrences = onDisplay.occurrences;
  } else if (canonical !== display) {
    const onCanonical = applyGrammarReplacement(canonical, suggestion);
    if (onCanonical.replaced > 0 && onCanonical.text !== canonical) {
      loadComposeMarkdownIntoEditor(onCanonical.text);
      occurrences = onCanonical.occurrences;
    }
  }

  if (occurrences <= 0) {
    toast(TOAST_MISSING);
    return;
  }

  finishApplied(index, suggestion, occurrences);
}
