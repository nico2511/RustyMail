import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { computePreview } from "./composeComposerBridge";
import { withLlmQueue } from "./llmJobQueue";

export async function composeAiRewrite(styleRaw: string): Promise<void> {
  if (state.view !== "compose") {
    toast("Ouvre le compositeur pour réécrire.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled")) {
    toast("Réécriture IA désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
  const src = ta?.value ?? state.composeBody;
  const style = styleRaw.trim() || "Neutral";
  if (!isTauriRuntime()) return void toast("Réécriture IA : Tauri requis.");
  const ran = await withLlmQueue(`Réécriture ${style}`, async (signal) => {
    if (signal.aborted) return;
    toast(`Réécriture « ${style} »…`);
    const res = await withTimeout(
      invoke<{ text: string }>("llm_rewrite_compose", { text: src, style }),
      LLM_INVOKE_TIMEOUT_MS,
    );
    if (signal.aborted) return;
    state.composeCanonicalBody = res.text ?? src;
    state.composeBody = res.text ?? src;
    if (ta) ta.value = res.text ?? src;
    toast("Texte réécrit.");
    render();
    void computePreview();
  });
  if (ran === null) return;
}

export async function composeAiGrammar(): Promise<void> {
  if (state.view !== "compose") {
    toast("Ouvre le compositeur.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeGrammarEnabled")) {
    toast("Correction grammaticale désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
  const src = ta?.value ?? state.composeBody;
  if (!isTauriRuntime()) return void toast("Correction (LLM) : Tauri requis.");
  const ran = await withLlmQueue("Orthographe", async (signal) => {
    if (signal.aborted) return;
    try {
      const res = await withTimeout(
        invoke<{ suggestions: Array<{ reason: string; replacement: string; original: string }> }>(
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
      toast(tauriErrorMessage(e));
    }
    render();
  });
  if (ran === null) return;
}
