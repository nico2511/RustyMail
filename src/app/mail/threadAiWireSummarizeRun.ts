import { isAiFeatureEnabled } from "../../aiFeatures";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { currentThreadIdForReply } from "./composeThreadReply";
import { withLlmQueue } from "./llmJobQueue";
import { summarizeThreadCore } from "./threadAiRun";

export async function summarizeThread() {
  const threadId =
    state.view === "thread" && state.selectedThreadId?.trim() ?
      state.selectedThreadId.trim()
    : currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) {
    toast("Synthèse de fil désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Résumé du fil : lancez l’application RustyMail (Tauri), pas le navigateur seul.");
    state.aiOpen = true;
    state.aiOutput =
      "La synthèse utilise la base locale et les commandes Tauri ; elle n’est pas disponible en prévisualisation web seule.";
    render();
    return;
  }
  const ran = await withLlmQueue("Synthèse fil", (signal) => summarizeThreadCore(threadId, signal));
  if (ran === null) return;
}
