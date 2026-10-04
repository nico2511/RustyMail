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
import { readComposePlainText, replaceComposeWithModelText } from "./composeBodyEditor";
import {
  grammarOccurrenceCount,
  grammarOriginalTooLong,
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

function composeAiStillOnSameDraft(sessionId: string | null, sourcePlain: string): boolean {
  return state.view === "compose" && state.draftSessionId === sessionId && readComposePlainText() === sourcePlain;
}

export async function composeAiRewrite(styleRaw: string): Promise<void> {
  if (state.view !== "compose") {
    toast.warning("Ouvre le compositeur pour réécrire.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled")) {
    toast.warning("Réécriture IA désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  const src = readComposePlainText();
  if (!src.trim()) {
    toast.warning("Le message est vide.");
    return;
  }
  const style = styleRaw.trim() || "Neutral";
  const styleLabel = rewriteStyleLabelFr(style);
  if (!isTauriRuntime()) return void toast.warning("Réécriture IA : Tauri requis.");
  const sessionId = state.draftSessionId;
  const ran = await withLlmQueue(composeRewriteJobLabel(style), async (signal) => {
    if (signal.aborted || !composeAiStillOnSameDraft(sessionId, src)) return;
    try {
      const res = await withTimeout(
        invoke<{ text: string }>("llm_rewrite_compose", { text: src, style }),
        LLM_INVOKE_TIMEOUT_MS,
      );
      if (signal.aborted || !composeAiStillOnSameDraft(sessionId, src)) return;
      const rewritten = (res.text ?? "").trim();
      if (!rewritten || introducesLlmMeta(src, rewritten)) {
        toast.error(LLM_META_REWRITE_TOAST);
        return;
      }
      replaceComposeWithModelText(rewritten);
      toast.success(`Texte réécrit (${styleLabel}).`);
      render();
      void computePreview();
    } catch (e) {
      if (signal.aborted) return;
      toast.error(tauriErrorMessage(e));
    }
  });
  if (ran === null) return;
}

export async function composeAiGrammar(): Promise<void> {
  if (state.view !== "compose") {
    toast.warning("Ouvre le compositeur.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeGrammarEnabled")) {
    toast.warning("Correction grammaticale désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  const src = readComposePlainText();
  if (!src.trim()) {
    toast.warning("Le message est vide.");
    return;
  }
  if (!isTauriRuntime()) return void toast.warning("Correction (LLM) : Tauri requis.");
  const sessionId = state.draftSessionId;
  const ran = await withLlmQueue(COMPOSE_GRAMMAR_JOB, async (signal) => {
    if (signal.aborted || state.view !== "compose" || state.draftSessionId !== sessionId) return;
    try {
      const res = await withTimeout(
        invoke<{
          suggestions: Array<{
            reason: string;
            replacement: string;
            original: string;
            offset?: number;
            length?: number;
          }>;
        }>(
          "llm_grammar_compose",
          { text: src },
        ),
        LLM_INVOKE_TIMEOUT_MS,
      );
      if (signal.aborted || state.view !== "compose" || state.draftSessionId !== sessionId) return;
      const current = readComposePlainText();
      const incoming = res.suggestions ?? [];
      const sawMeta = incoming.some(
        (g) => containsLlmMeta(g.original) || containsLlmMeta(g.replacement) || containsLlmMeta(g.reason),
      );
      const usable = incoming.filter((g) => {
        const original = g.original?.trim() ?? "";
        const replacement = g.replacement?.trim() ?? "";
        if (!original || !replacement || original.replace(/\s+/g, " ") === replacement.replace(/\s+/g, " ")) {
          return false;
        }
        if (containsLlmMeta(original) || containsLlmMeta(replacement) || containsLlmMeta(g.reason ?? "")) {
          return false;
        }
        if (grammarOriginalTooLong(original)) return false;
        if (replacementDropsWords(original, replacement) || replacementDropsCriticalPunct(original, replacement)) {
          return false;
        }
        return grammarOccurrenceCount(current, current, g) > 0;
      });
      if (sawMeta && usable.length === 0) {
        state.composeGrammarSuggestions = null;
        toast.error(LLM_META_GRAMMAR_TOAST);
      } else {
        const n = usable.length;
        state.composeGrammarSuggestions = usable;
        toast(
          n
            ? `${n} suggestion(s) — surlignées dans le texte (clic pour corriger) et panneau Correction.`
            : "Aucune suggestion.",
        );
      }
    } catch (e) {
      if (signal.aborted || !composeAiStillOnSameDraft(sessionId, src)) return;
      state.composeGrammarSuggestions = null;
      toast.error(tauriErrorMessage(e));
    }
    if (signal.aborted || !composeAiStillOnSameDraft(sessionId, src)) return;
    render();
  });
  if (ran === null) return;
}
