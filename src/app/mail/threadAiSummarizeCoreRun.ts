import { invokeAiCacheGet } from "../../ipc_bridge";
import { extractPartialJsonStringField, isLlmCancelledError, runLlmStreamJob } from "../../llmStream";
import { AI_CACHE_PROMPT_REVISION, BOOT_INVOKE_TIMEOUT_MS, LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { SummaryResult } from "../types";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { applyThreadAiOutputIfLive, paintThreadAiSummaryDom } from "./threadAiStreamDom";
import { repairSummaryResultStrings, repairUtf8Mojibake, summaryResultToZenText } from "./threadViewUiHelpers";

export async function summarizeThreadCore(
  threadId: string,
  signal: AbortSignal,
  opts?: { toastOnDone?: boolean; toastOnCache?: boolean; prefetchOnly?: boolean },
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
      LLM_INVOKE_TIMEOUT_MS,
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
      done.displayText?.trim() || summaryResultToZenText(summary),
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
