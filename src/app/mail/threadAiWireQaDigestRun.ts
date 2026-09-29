import { isAiFeatureEnabled } from "../../aiFeatures";
import { extractPartialJsonStringField, runLlmStreamJob } from "../../llmStream";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  isMailboxDigestFeatureEnabled,
  mailboxDigestPanelEligible,
  openMailboxDigestPanel,
} from "./mailboxDigest";
import { withLlmQueue } from "./llmJobQueue";
import { paintThreadQaStreamDom } from "./threadAiStreamDom";
import { repairUtf8Mojibake } from "./threadViewUiHelpers";

export async function llmQaThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast.warning("Ouvre un fil.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadQaEnabled")) {
    toast.warning("Q&A fil désactivé — activez-le dans Paramètres IA.");
    return;
  }
  if (!isTauriRuntime()) return void toast.warning("Q&A fil : Tauri requis.");
  const qaInput = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
  const question = (qaInput?.value ?? state.threadQaDraft).trim();
  if (!question) {
    toast.warning("Saisissez une question.");
    return;
  }
  state.threadQaDraft = question;
  const ran = await withLlmQueue("Q&A fil", async (signal) => {
    state.aiOpen = true;
    state.threadQaAnswer = null;
    state.threadQaStreamText = "Réponse en cours…";
    render();
    const done = await runLlmStreamJob({
      command: "llm_stream_qa_thread",
      args: { threadId, question },
      signal,
      onChunk: (acc) => {
        const preview = extractPartialJsonStringField(acc, "answer");
        state.threadQaStreamText = preview || "Réponse en cours…";
        if (preview) paintThreadQaStreamDom(preview);
      },
    });
    state.threadQaStreamText = "";
    if (done === "cancelled") {
      toast.warning("Question annulée.");
      render();
      return;
    }
    if (done.qa?.answer?.trim()) {
      state.threadQaAnswer = {
        answer: repairUtf8Mojibake(done.qa.answer),
        evidenceMessageIds: done.qa.evidenceMessageIds ?? [],
      };
      state.aiThreadScope = String(threadId);
      toast.success("Réponse prête.");
    } else {
      toast.warning("Réponse IA illisible — réessayez.");
    }
    render();
  });
  if (ran === null) return;
}

export async function llmInboxDigestUi() {
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!isTauriRuntime()) return void toast.warning("Brief d’action : Tauri requis.");
  if (!currentAccount()?.id?.trim()) return void toast.warning("Sélectionne un compte.");
  if (!mailboxDigestPanelEligible()) {
    toast.warning("Ouvre la liste d’un dossier IMAP pour le brief d’action.");
    return;
  }
  openMailboxDigestPanel(true);
}
