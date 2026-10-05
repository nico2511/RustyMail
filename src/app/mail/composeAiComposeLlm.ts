import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { COMPOSE_GRAMMAR_JOB, composeRewriteJobLabel } from "../core/composeAiJobs";
import { rewriteStyleLabelFr } from "../core/composeTone";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  hasComposeTextSelection,
  readComposePlainText,
  readComposeSelectionPlainText,
  replaceComposeSelectionWithText,
  replaceComposeWithModelText,
} from "./composeBodyEditor";
import {
  applyGrammarReplacement,
  grammarOccurrenceCount,
  grammarOriginalTooLong,
  grammarSuggestionTooAmbiguous,
  replacementDropsCriticalPunct,
  replacementDropsWords,
} from "./composeGrammarReplace";
import { computePreview } from "./composeComposerBridge";
import {
  containsLlmMeta,
  introducesLlmMeta,
  LLM_META_GRAMMAR_TOAST,
  LLM_META_REWRITE_TOAST,
} from "./llmMetaGuard";
import { withLlmQueue } from "./llmJobQueue";
import { setPendingDraftRevisionEventKind } from "./composeDraftRevisionEventKind";
import { scheduleDraftRevisionSave } from "./composeDraftRevisionAutosave";
import { refreshComposeGrammarHighlights } from "./composeGrammarHighlights";

export type ComposeAiScope = "document" | "selection";

type GrammarSuggestion = {
  reason: string;
  replacement: string;
  original: string;
  offset?: number;
  length?: number;
};

function composeAiStillOnSameDraft(sessionId: string | null, sourcePlain: string): boolean {
  return state.view === "compose" && state.draftSessionId === sessionId && readComposePlainText() === sourcePlain;
}

function resolveComposeScope(scope?: ComposeAiScope): { scope: ComposeAiScope; text: string } | null {
  if (scope === "selection" || (scope !== "document" && hasComposeTextSelection())) {
    const selected = readComposeSelectionPlainText();
    if (!selected.trim()) {
      toast.warning("Sélectionnez d’abord du texte.");
      return null;
    }
    return { scope: "selection", text: selected };
  }
  const full = readComposePlainText();
  if (!full.trim()) {
    toast.warning("Le message est vide.");
    return null;
  }
  return { scope: "document", text: full };
}

function filterUsableSuggestions(incoming: GrammarSuggestion[], haystack: string): GrammarSuggestion[] {
  return incoming.filter((g) => {
    const original = g.original?.trim() ?? "";
    const replacement = g.replacement?.trim() ?? "";
    if (!original || !replacement || original.replace(/\s+/g, " ") === replacement.replace(/\s+/g, " ")) {
      return false;
    }
    if (containsLlmMeta(original) || containsLlmMeta(replacement) || containsLlmMeta(g.reason ?? "")) {
      return false;
    }
    if (grammarSuggestionTooAmbiguous(original, replacement)) return false;
    if (grammarOriginalTooLong(original)) return false;
    if (replacementDropsWords(original, replacement) || replacementDropsCriticalPunct(original, replacement)) {
      return false;
    }
    return grammarOccurrenceCount(haystack, haystack, g) > 0;
  });
}

export async function composeAiRewrite(styleRaw: string, scope: ComposeAiScope = "document"): Promise<void> {
  if (state.view !== "compose") {
    toast.warning("Ouvre le compositeur pour réécrire.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled")) {
    toast.warning("Réécriture IA désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  const resolved = resolveComposeScope(scope);
  if (!resolved) return;
  const style = styleRaw.trim() || "Neutral";
  const styleLabel = rewriteStyleLabelFr(style);
  if (!isTauriRuntime()) return void toast.warning("Réécriture IA : Tauri requis.");
  const sessionId = state.draftSessionId;
  const fullBefore = readComposePlainText();
  const ran = await withLlmQueue(composeRewriteJobLabel(style), async (signal) => {
    if (signal.aborted || state.view !== "compose" || state.draftSessionId !== sessionId) return;
    if (resolved.scope === "document" && readComposePlainText() !== fullBefore) return;
    try {
      const res = await withTimeout(
        invoke<{ text: string }>("llm_rewrite_compose", { text: resolved.text, style }),
        LLM_INVOKE_TIMEOUT_MS,
      );
      if (signal.aborted || state.view !== "compose" || state.draftSessionId !== sessionId) return;
      const rewritten = (res.text ?? "").trim();
      if (!rewritten || introducesLlmMeta(resolved.text, rewritten)) {
        toast.error(LLM_META_REWRITE_TOAST);
        return;
      }
      const kind =
        style.trim().toLowerCase() === "concise"
          ? "shorten"
          : ["formal", "casual", "assertive", "polite"].includes(style.trim().toLowerCase())
            ? "tone"
            : "rewrite";
      setPendingDraftRevisionEventKind(kind);
      if (resolved.scope === "selection") {
        if (!replaceComposeSelectionWithText(rewritten)) {
          toast.warning("La sélection n’est plus disponible.");
          return;
        }
        toast.success(`Sélection réécrite (${styleLabel}).`);
      } else {
        if (readComposePlainText() !== fullBefore) return;
        replaceComposeWithModelText(rewritten);
        toast.success(`Texte réécrit (${styleLabel}).`);
      }
      render();
      void computePreview();
      scheduleDraftRevisionSave(200);
    } catch (e) {
      if (signal.aborted) return;
      toast.error(tauriErrorMessage(e));
    }
  });
  if (ran === null) return;
}

export async function composeAiGrammar(scope: ComposeAiScope = "document"): Promise<void> {
  if (state.view !== "compose") {
    toast.warning("Ouvre le compositeur.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeGrammarEnabled")) {
    toast.warning("Correction grammaticale désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  const resolved = resolveComposeScope(scope);
  if (!resolved) return;
  if (!isTauriRuntime()) return void toast.warning("Correction (LLM) : Tauri requis.");
  const sessionId = state.draftSessionId;
  const fullBefore = readComposePlainText();
  const ran = await withLlmQueue(COMPOSE_GRAMMAR_JOB, async (signal) => {
    if (signal.aborted || state.view !== "compose" || state.draftSessionId !== sessionId) return;
    try {
      const res = await withTimeout(
        invoke<{ suggestions: GrammarSuggestion[] }>("llm_grammar_compose", { text: resolved.text }),
        LLM_INVOKE_TIMEOUT_MS,
      );
      if (signal.aborted || state.view !== "compose" || state.draftSessionId !== sessionId) return;
      const incoming = res.suggestions ?? [];
      const sawMeta = incoming.some(
        (g) => containsLlmMeta(g.original) || containsLlmMeta(g.replacement) || containsLlmMeta(g.reason),
      );
      const usable = filterUsableSuggestions(incoming, resolved.text);
      if (sawMeta && usable.length === 0) {
        state.composeGrammarSuggestions = null;
        toast.error(LLM_META_GRAMMAR_TOAST);
        render();
        return;
      }

      if (resolved.scope === "selection") {
        // Zone sélectionnée : appliquer tout de suite dans la sélection (sans panneau).
        let corrected = resolved.text;
        let applied = 0;
        for (const g of usable) {
          const result = applyGrammarReplacement(corrected, g);
          if (result.replaced > 0) {
            corrected = result.text;
            applied += 1;
          }
        }
        if (applied === 0 || corrected === resolved.text) {
          state.composeGrammarSuggestions = null;
          toast("Aucune correction sur la sélection.");
        } else if (!replaceComposeSelectionWithText(corrected)) {
          toast.warning("La sélection n’est plus disponible.");
        } else {
          state.composeGrammarSuggestions = null;
          toast.success(`${applied} correction(s) sur la sélection.`);
          void computePreview();
          scheduleDraftRevisionSave(200);
        }
        render();
        return;
      }

      if (readComposePlainText() !== fullBefore) return;
      // Document entier : surlignage live + clic pour appliquer (évite de casser le HTML).
      state.composeGrammarSuggestions = usable.length ? usable : null;
      refreshComposeGrammarHighlights();
      toast(
        usable.length
          ? `${usable.length} suggestion(s) — clic sur le surlignage pour corriger (ou Appliquer).`
          : "Aucune suggestion.",
      );
      void computePreview();
    } catch (e) {
      if (signal.aborted || !composeAiStillOnSameDraft(sessionId, fullBefore)) return;
      state.composeGrammarSuggestions = null;
      toast.error(tauriErrorMessage(e));
    }
    if (signal.aborted || state.view !== "compose" || state.draftSessionId !== sessionId) return;
    render();
  });
  if (ran === null) return;
}
