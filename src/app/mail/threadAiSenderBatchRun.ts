import { isAiFeatureEnabled } from "../../aiFeatures";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { withLlmQueue } from "./llmJobQueue";
import { summarizeThreadCore } from "./threadAiSummarizeCoreRun";
import { threadAiSummaryScoped } from "./threadAiStreamDom";

let senderBatchSummarizeAbort: AbortController | null = null;
let senderBatchSummarizeActive = false;

export function isSenderBatchSummarizeActive(): boolean {
  return senderBatchSummarizeActive;
}

export async function summarizeSenderThreadsLight() {
  if (state.searchSenders.length === 0) {
    toast("Filtrez d’abord par expéditeur (@ ou recherche NL).");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) {
    toast("Synthèse de fil désactivée dans les préférences IA.");
    return;
  }
  if (!state.threads.length) {
    toast("Aucun fil dans la liste filtrée — lancez une recherche.");
    return;
  }
  const topK = state.threads.slice(0, 5);
  const priorView = state.view;
  const priorThreadId = state.selectedThreadId;
  const priorThread = state.selectedThread;
  senderBatchSummarizeAbort?.abort();
  senderBatchSummarizeAbort = new AbortController();
  const signal = senderBatchSummarizeAbort.signal;
  senderBatchSummarizeActive = true;
  state.aiOpen = true;
  let okCount = 0;
  try {
    const ran = await withLlmQueue(`Synthèse fils (${topK.length})`, async (queueSignal) => {
      for (let i = 0; i < topK.length; i++) {
        if (signal.aborted || queueSignal.aborted) return "cancelled" as const;
        const item = topK[i];
        const tid = String(item?.id ?? "");
        if (!tid) continue;
        const label = (item?.subject ?? "").trim() || `Fil ${i + 1}`;
        state.aiOutput = `Synthèse ${i + 1}/${topK.length} — ${label}…`;
        render();
        const exists = await fetchOpenThreadOrNotify(tid, { quiet: true });
        if (!exists) {
          toast(`Fil ignoré (non disponible en local) : ${label}`);
          continue;
        }
        if (signal.aborted || queueSignal.aborted) return "cancelled" as const;
        const outcome = await summarizeThreadCore(tid, queueSignal, {
          toastOnDone: false,
          toastOnCache: false,
        });
        if (outcome.status === "cancelled") return "cancelled" as const;
        if (outcome.status === "error") {
          const detail = outcome.errorMessage?.trim();
          toast(
            detail ?
              `Synthèse échouée : ${label} — ${detail}`
            : `Synthèse échouée : ${label}`,
          );
          continue;
        }
        okCount += 1;
      }
      return "done" as const;
    });
    if (ran === "cancelled") toast("Synthèse batch annulée.");
    else if (ran) {
      if (okCount === 0) toast("Aucune synthèse n’a abouti — vérifiez le moteur IA et la sync des fils.");
      else
        toast(
          `${okCount}/${topK.length} synthèse${okCount === 1 ? "" : "s"} — résultat du dernier fil dans le panneau IA (liste inchangée).`,
        );
    }
  } finally {
    senderBatchSummarizeAbort = null;
    senderBatchSummarizeActive = false;
    state.view = priorView;
    state.selectedThreadId = priorThreadId;
    state.selectedThread = priorThread;
    if (okCount > 0 && threadAiSummaryScoped()) {
      state.aiOpen = true;
    }
    render();
  }
}
