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
import { LLM_META_TRANSLATION_TOAST, translationVisibleText } from "./llmMetaGuard";

function threadSourceText(): string {
  return (state.selectedThread?.messages ?? []).map((message) => message.cleanedText || "").join("\n");
}

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
      const cachedText = o.translatedText
        ? translationVisibleText(threadSourceText(), o.translatedText)
        : null;
      if (cachedText) {
        if (applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(cachedText))) {
          if (!prefetchOnly) {
            toast.info("Traduction (cache locale).");
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
          const visible = preview ? translationVisibleText(threadSourceText(), preview) : null;
          if (!visible) return;
          if (applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(visible))) {
            paintThreadAiSummaryDom(repairUtf8Mojibake(visible));
          }
        },
      }),
      LLM_INVOKE_TIMEOUT_MS,
    );
  } catch (error) {
    if (signal.aborted || isLlmCancelledError(error)) {
      if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
      if (!prefetchOnly) toast.warning("Traduction annulée.");
      if (!prefetchOnly) render();
      return { status: "cancelled" };
    }
    const msg = tauriErrorMessage(error);
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (!prefetchOnly) toast.error(`Traduction échouée : ${msg}`);
    console.warn("translateThreadCore", error);
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (done === "cancelled") {
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (!prefetchOnly) toast.warning("Traduction annulée.");
    if (!prefetchOnly) render();
    return { status: "cancelled" };
  }
  const tx =
    done.translation?.translatedText?.trim() ||
    done.displayText?.trim() ||
    "";
  const visible = tx ? translationVisibleText(threadSourceText(), tx) : null;
  if (tx && !visible) {
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (!prefetchOnly) toast.error(LLM_META_TRANSLATION_TOAST);
    if (!prefetchOnly) render();
    return fail(LLM_META_TRANSLATION_TOAST);
  }
  if (visible) applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(visible));
  if (!prefetchOnly) toast.success("Traduction terminée.");
  if (!prefetchOnly) render();
  return { status: "done" };
}
