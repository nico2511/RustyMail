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
import { computePreview } from "./composeComposerBridge";
import { withLlmQueue } from "./llmJobQueue";

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
  const ran = await withLlmQueue(composeRewriteJobLabel(style), async (signal) => {
    if (signal.aborted) return;
    try {
      const res = await withTimeout(
        invoke<{ text: string }>("llm_rewrite_compose", { text: src, style }),
        LLM_INVOKE_TIMEOUT_MS,
      );
      if (signal.aborted) return;
      replaceComposeWithModelText(res.text ?? src);
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
  const ran = await withLlmQueue(COMPOSE_GRAMMAR_JOB, async (signal) => {
    if (signal.aborted) return;
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
      if (signal.aborted) return;
      const n = res.suggestions?.length ?? 0;
      state.composeGrammarSuggestions = res.suggestions ?? [];
      toast(
        n
          ? `${n} suggestion(s) — voir le panneau Correction entre la barre d’outils et le texte.`
          : "Aucune suggestion.",
      );
    } catch (e) {
      state.composeGrammarSuggestions = null;
      toast.error(tauriErrorMessage(e));
    }
    render();
  });
  if (ran === null) return;
}
