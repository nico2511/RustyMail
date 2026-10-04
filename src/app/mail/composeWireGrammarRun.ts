import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { state } from "../state";
import {
  flushComposeEditorToState,
  getComposeBodyEditor,
  mapComposePlainSpanToDoc,
  readComposePlainText,
  replaceComposeWithModelText,
  syncComposeEditorFromState,
} from "./composeBodyEditor";
import { computePreview } from "./composeComposerBridge";
import { markComposeDraftEdited } from "./composeDraftContentKey";
import { fallbackDraftPreview } from "./composeDraftPreview";
import { scheduleDraftRevisionSave } from "./composeDraftRevisionAutosave";
import {
  applyGrammarReplacement,
  countGrammarOccurrences,
  findGrammarSpans,
  grammarTextsMatch,
  grammarOriginalTooLong,
  replacementDropsCriticalPunct,
  replacementDropsWords,
  type GrammarReplaceInput,
} from "./composeGrammarReplace";

/** Aligné sur `composeBodyEditor` (`getText` / map plain → doc). */
const BLOCK_SEPARATOR = "\n\n";

const TOAST_APPLIED = "Remplacement appliqué.";
const TOAST_APPLIED_FIRST = "Remplacement appliqué (première occurrence).";
const TOAST_APPLIED_ALL = "Remplacements appliqués.";
const TOAST_MISSING = "Occurrence introuvable — le texte n’a pas été modifié.";
const TOAST_BAD_INDEX = "Suggestion introuvable — rouvrez Correction.";

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

function remainingOccurrences(suggestion: GrammarReplaceInput): number {
  return countGrammarOccurrences(readComposePlainText(), suggestion);
}

function forgetSuggestionIfExhausted(index: number, suggestion: GrammarReplaceInput): void {
  if (remainingOccurrences(suggestion) > 0) return;
  const list = state.composeGrammarSuggestions;
  if (!list) return;
  const next = list.filter((_, i) => i !== index);
  state.composeGrammarSuggestions = next.length ? next : null;
}

function finishApplied(
  index: number,
  suggestion: GrammarReplaceInput,
  occurrences: number,
  opts?: { appliedAll?: boolean },
): void {
  flushComposeEditorToState();
  forgetSuggestionIfExhausted(index, suggestion);
  markComposeDraftEdited();
  try {
    scheduleDraftRevisionSave();
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("registerComposeDraftRevisionAutosaveDeps")) {
      throw err;
    }
  }
  if (opts?.appliedAll) toast.success(TOAST_APPLIED_ALL);
  else toast.success(occurrences > 1 ? TOAST_APPLIED_FIRST : TOAST_APPLIED);
  paintComposeEditor();
  void computePreview();
}

function suggestionGuards(suggestion: GrammarReplaceInput): boolean {
  const original = suggestion.original;
  const replacement = suggestion.replacement ?? "";
  if (
    grammarOriginalTooLong(original) ||
    replacementDropsWords(original, replacement) ||
    replacementDropsCriticalPunct(original, replacement)
  ) {
    toast.warning("Cette suggestion retirerait du texte — elle n’a pas été appliquée.");
    return false;
  }
  return true;
}

type PlainSpan = { start: number; end: number };

function pickSpan(spans: PlainSpan[], preferred?: PlainSpan): PlainSpan | null {
  if (!spans.length) return null;
  if (
    preferred &&
    spans.some((s) => s.start === preferred.start && s.end === preferred.end)
  ) {
    return preferred;
  }
  return spans[0]!;
}

/** Remplace une occurrence via TipTap ; retourne le nombre d’occurrences avant remplacement. */
function applyOneViaTipTap(suggestion: GrammarReplaceInput, preferred?: PlainSpan): number {
  const editor = getComposeBodyEditor();
  if (!editor) return 0;
  const plain = readComposePlainText();
  const spans = findGrammarSpans(plain, suggestion);
  const target = pickSpan(spans, preferred);
  if (!target) return 0;
  const applied = editor
    .chain()
    .focus()
    .command(({ tr, state: docState }) => {
      const mapped = mapComposePlainSpanToDoc(docState.doc, target);
      if (!mapped) return false;
      const slice = docState.doc.textBetween(mapped.from, mapped.to, BLOCK_SEPARATOR);
      if (!grammarTextsMatch(slice, suggestion.original)) return false;
      tr.insertText(suggestion.replacement ?? "", mapped.from, mapped.to);
      return true;
    })
    .run();
  return applied ? spans.length : 0;
}

/** Fallback : remplacer sur le texte plain visible, jamais sur le HTML stocké. */
function applyOneViaPlainFallback(suggestion: GrammarReplaceInput): number {
  const plain = readComposePlainText();
  const result = applyGrammarReplacement(plain, suggestion);
  if (result.replaced <= 0 || result.text === plain) return 0;
  replaceComposeWithModelText(result.text);
  return result.occurrences;
}

/**
 * Applique la suggestion `index` sur le corps du compositeur.
 * Une seule occurrence est remplacée (`preferred` = span cliqué dans TipTap, sinon la première).
 */
export function applyComposeGrammarSuggestionAtIndex(
  index: number,
  preferred?: PlainSpan,
): void {
  const suggestion = suggestionAt(index);
  if (!suggestion) {
    toast.warning(TOAST_BAD_INDEX);
    return;
  }
  if (!suggestionGuards(suggestion)) return;

  let occurrences = applyOneViaTipTap(suggestion, preferred);
  if (occurrences <= 0) occurrences = applyOneViaPlainFallback(suggestion);
  if (occurrences <= 0) {
    toast(TOAST_MISSING);
    return;
  }

  finishApplied(index, suggestion, occurrences);
}

/**
 * Remplace toutes les occurrences de la suggestion `index` dans le texte visible.
 */
export function applyComposeGrammarSuggestionAllAtIndex(index: number): void {
  const suggestion = suggestionAt(index);
  if (!suggestion) {
    toast.warning(TOAST_BAD_INDEX);
    return;
  }
  if (!suggestionGuards(suggestion)) return;

  let totalBefore = remainingOccurrences(suggestion);
  if (totalBefore <= 0) {
    toast(TOAST_MISSING);
    return;
  }

  let guard = 0;
  while (remainingOccurrences(suggestion) > 0 && guard < 64) {
    guard += 1;
    const viaTipTap = applyOneViaTipTap(suggestion);
    if (viaTipTap > 0) continue;
    const viaPlain = applyOneViaPlainFallback(suggestion);
    if (viaPlain <= 0) break;
  }

  const left = remainingOccurrences(suggestion);
  if (left >= totalBefore) {
    toast(TOAST_MISSING);
    return;
  }

  finishApplied(index, suggestion, totalBefore, { appliedAll: true });
}
