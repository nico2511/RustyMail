import { isAiFeatureEnabled } from "../../aiFeatures";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { state } from "../state";
import { withLlmQueue } from "./llmJobQueue";
import { translateThreadCore } from "./threadAiRun";
import { shouldOfferThreadTranslate } from "./threadLangGuess";

export async function llmTranslateThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast.warning("Ouvre un fil à traduire.");
    return;
  }
  const thread = state.selectedThread;
  const mother = state.appPrefs.general.motherLanguage?.trim() || "fr";
  if (thread && !shouldOfferThreadTranslate(thread, mother)) {
    toast.warning("Fil déjà dans la langue mère — traduction inutile.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadTranslateEnabled")) {
    toast.warning("Traduction de fil désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast.warning("Traduire LLM : lancez Tauri.");
    return;
  }
  const ran = await withLlmQueue("Traduction fil", async (signal) => {
    await translateThreadCore(threadId, signal, { prefetchOnly: false });
  });
  if (ran === null) return;
}
