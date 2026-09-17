import { invokeAiCacheGet } from "../../ipc_bridge";
import { extractPartialJsonStringField, isLlmCancelledError, runLlmStreamJob } from "../../llmStream";
import { AI_CACHE_PROMPT_REVISION, BOOT_INVOKE_TIMEOUT_MS, LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { LlmTranslationResult } from "../types";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { applyThreadAiOutputIfLive, paintThreadAiSummaryDom } from "./threadAiStreamDom";
import { repairUtf8Mojibake } from "./threadViewUiHelpers";

export async function translateThreadCore(
  threadId: string,
  signal: AbortSignal,
  opts?: { prefetchOnly?: boolean },
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
      LLM_INVOKE_TIMEOUT_MS,
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
