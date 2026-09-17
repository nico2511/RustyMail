import { invokeAiCacheGet } from "../../ipc_bridge";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { extractPartialJsonStringField, isLlmCancelledError, runLlmStreamJob } from "../../llmStream";
import { AI_CACHE_PROMPT_REVISION, BOOT_INVOKE_TIMEOUT_MS, LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { LlmTranslationResult, SummaryResult } from "../types";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { withLlmQueue } from "./llmJobQueue";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import {
  applyThreadAiOutputIfLive,
  paintThreadAiSummaryDom,
  threadAiSummaryScoped,
} from "./threadAiStreamDom";
import {
  repairSummaryResultStrings,
  repairUtf8Mojibake,
  summaryResultToZenText,
} from "./threadViewUiHelpers";

let senderBatchSummarizeAbort: AbortController | null = null;
let senderBatchSummarizeActive = false;

export function isSenderBatchSummarizeActive(): boolean {
  return senderBatchSummarizeActive;
}

export async function summarizeThreadCore(
  threadId: string,
  signal: AbortSignal,
  opts?: { toastOnDone?: boolean; toastOnCache?: boolean; prefetchOnly?: boolean }
): Promise<{ status: "done" | "cancelled" | "error"; errorMessage?: string }> {
  const prefetchOnly = opts?.prefetchOnly === true;
  const toastOnDone = !prefetchOnly && opts?.toastOnDone !== false;
  const toastOnCache = !prefetchOnly && opts?.toastOnCache !== false;
  const fail = (message: string) => ({ status: "error" as const, errorMessage: message });
  if (!prefetchOnly) {
    state.aiOpen = true;
    state.quickReplySuggestions = [];
    state.aiOutput = "Aperçu synthétique du fil…";
    state.aiThreadScope = String(threadId);
    render();
  }
  const seg = await aiCacheKeySegment();
  const cacheKey = `summary:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:${threadId}`;
  const cached = await invokeAiCacheGet(cacheKey, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  if (cached && !signal.aborted) {
    try {
      const o = repairSummaryResultStrings(JSON.parse(cached) as SummaryResult);
      if (applyThreadAiOutputIfLive(threadId, summaryResultToZenText(o))) {
        if (toastOnCache) toast("Synthèse (cache locale).");
        if (!prefetchOnly) render();
        return { status: "done" };
      }
      return { status: "done" };
    } catch {
      /* invalide : recalcul */
    }
  }
  let done: Awaited<ReturnType<typeof runLlmStreamJob>>;
  try {
    done = await withTimeout(
      runLlmStreamJob({
        command: "llm_stream_summarize_thread",
        args: { threadId },
        signal,
        onChunk: (acc) => {
          if (applyThreadAiOutputIfLive(threadId, acc)) paintThreadAiSummaryDom(acc);
        },
      }),
      LLM_INVOKE_TIMEOUT_MS
    );
  } catch (error) {
    if (signal.aborted || isLlmCancelledError(error)) {
      if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
      if (toastOnDone) toast("Synthèse annulée.");
      if (!prefetchOnly) render();
      return { status: "cancelled" };
    }
    const msg = tauriErrorMessage(error);
    console.error("summarizeThreadCore", error);
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast(`Synthèse échouée : ${msg}`);
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (done === "cancelled") {
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast("Synthèse annulée.");
    if (!prefetchOnly) render();
    return { status: "cancelled" };
  }
  if (done.summary) {
    const summary = repairSummaryResultStrings(done.summary as SummaryResult);
    applyThreadAiOutputIfLive(
      threadId,
      done.displayText?.trim() || summaryResultToZenText(summary)
    );
  } else if (done.displayText?.trim()) {
    applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(done.displayText));
  } else {
    const msg = "réponse vide du modèle";
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast("Synthèse terminée sans contenu exploitable.");
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (toastOnDone) toast("Synthèse terminée.");
  if (!prefetchOnly) render();
  return { status: "done" };
}

export async function translateThreadCore(
  threadId: string,
  signal: AbortSignal,
  opts?: { prefetchOnly?: boolean }
): Promise<{ status: "done" | "cancelled" | "error"; errorMessage?: string }> {
  const prefetchOnly = opts?.prefetchOnly === true;
  const fail = (message: string) => ({ status: "error" as const, errorMessage: message });
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  if (!prefetchOnly) {
    state.aiOpen = true;
    state.quickReplySuggestions = [];
    state.aiOutput = `Traduction → ${targetLang}…`;
    state.aiThreadScope = String(threadId);
    render();
  }
  const seg = await aiCacheKeySegment();
  const cacheKey = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:thread:${threadId}:${targetLang}`;
  const cached = await invokeAiCacheGet(cacheKey, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  if (cached && !signal.aborted) {
    try {
      const o = JSON.parse(cached) as LlmTranslationResult;
      if (o.translatedText) {
        if (applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(o.translatedText))) {
          if (!prefetchOnly) {
            toast("Traduction (cache locale).");
            render();
          }
        }
        return { status: "done" };
      }
    } catch {
      /* recalcul */
    }
  }
  let done: Awaited<ReturnType<typeof runLlmStreamJob>>;
  try {
    done = await withTimeout(
      runLlmStreamJob({
        command: "llm_stream_translate_thread",
        args: { threadId, targetLang },
        signal,
        onChunk: (acc) => {
          const preview = extractPartialJsonStringField(acc, "translatedText");
          if (!preview) return;
          if (applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(preview))) {
            paintThreadAiSummaryDom(repairUtf8Mojibake(preview));
          }
        },
      }),
      LLM_INVOKE_TIMEOUT_MS
    );
  } catch (error) {
    if (signal.aborted || isLlmCancelledError(error)) {
      if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
      if (!prefetchOnly) toast("Traduction annulée.");
      if (!prefetchOnly) render();
      return { status: "cancelled" };
    }
    const msg = tauriErrorMessage(error);
    if (!prefetchOnly) toast(`Traduction échouée : ${msg}`);
    console.warn("translateThreadCore", error);
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (done === "cancelled") {
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (!prefetchOnly) toast("Traduction annulée.");
    if (!prefetchOnly) render();
    return { status: "cancelled" };
  }
  const tx =
    done.translation?.translatedText?.trim() ||
    done.displayText?.trim() ||
    "";
  if (tx) applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(tx));
  if (!prefetchOnly) toast("Traduction terminée.");
  if (!prefetchOnly) render();
  return { status: "done" };
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
            detail
              ? `Synthèse échouée : ${label} — ${detail}`
              : `Synthèse échouée : ${label}`
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
          `${okCount}/${topK.length} synthèse${okCount === 1 ? "" : "s"} — résultat du dernier fil dans le panneau IA (liste inchangée).`
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
