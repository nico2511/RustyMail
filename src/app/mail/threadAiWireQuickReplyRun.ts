import { invoke } from "@tauri-apps/api/core";

import { isAiFeatureEnabled } from "../../aiFeatures";
import { COMPOSE_REPLIES_JOB } from "../core/composeAiJobs";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { prependComposePlainText } from "./composeBodyEditor";
import { computePreview } from "./composeComposerBridge";
import { withLlmQueue } from "./llmJobQueue";
import { threadIsAutoMail } from "./threadAutoMail";

export async function llmQuickRepliesThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast("Ouvre un fil.");
    return;
  }
  if (threadIsAutoMail(state.selectedThread, threadId)) {
    toast("Réponses rapides désactivées pour les messages automatiques / newsletters.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyThreadEnabled")) {
    toast("Réponses rapides (fil) désactivées — activez-les dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) return void toast("Réponses rapides : Tauri requis.");
  const ran = await withLlmQueue("Réponses rapides", async (signal) => {
    if (signal.aborted) return;
    state.aiOpen = true;
    state.aiOutput = "";
    state.quickReplySuggestions = [];
    render();
    const res = await withTimeout(
      invoke<{ suggestions: Array<{ text: string; tone: string; rationale?: string }> }>("llm_quick_reply_thread", {
        threadId,
      }),
      LLM_INVOKE_TIMEOUT_MS,
    );
    if (signal.aborted) return;
    state.quickReplySuggestions = res.suggestions ?? [];
    state.aiThreadScope = String(threadId);
    toast("Réponses rapides prêtes.");
    render();
  });
  if (ran === null) return;
}

export async function llmQuickRepliesComposeUi() {
  if (state.view !== "compose") {
    toast("Ouvre le compositeur pour les réponses rapides.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyComposeEnabled")) {
    toast("Réponses rapides (compositeur) désactivées — activez-les dans Paramètres IA.");
    return;
  }
  if (!isTauriRuntime()) return void toast("Réponses rapides : Tauri requis.");
  const ran = await withLlmQueue(COMPOSE_REPLIES_JOB, async (signal) => {
    if (signal.aborted) return;
    try {
      const res = await withTimeout(
        invoke<{ suggestions: Array<{ text: string; tone: string; rationale?: string }> }>("llm_quick_reply_compose", {}),
        LLM_INVOKE_TIMEOUT_MS,
      );
      if (signal.aborted) return;
      const first = res.suggestions?.[0]?.text?.trim();
      if (!first) {
        toast("Aucune suggestion.");
        return;
      }
      prependComposePlainText(first);
      void computePreview();
      toast("Suggestion insérée — modifiez avant envoi.");
      render();
    } catch (e) {
      if (signal.aborted) return;
      toast(tauriErrorMessage(e));
    }
  });
  if (ran === null) return;
}
