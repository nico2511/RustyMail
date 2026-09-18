import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { IDLE_AI_CACHE_PREFETCH_MAX_THREADS } from "../core/timeouts";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import {
  getIdlePrefetchAbort,
  isIdleAiCachePrefetchGenCurrent,
  requireIdleAiCachePrefetchDeps,
  setIdlePrefetchAbort,
} from "./idleAiCachePrefetchContext";
import {
  pickThreadIdsForIdleAiCachePrefetch,
  threadSummaryCacheMissingForPrefetch,
  threadTranslateCacheMissingForPrefetch,
} from "./idleAiCachePrefetchPickRun";

export async function runIdleAiCachePrefetchPass(startGen: number): Promise<void> {
  const {
    currentAccount,
    aiCacheKeySegment,
    refreshLlmRuntimeStatus,
    langFromKindTags,
    normalizeIso639Primary,
    summarizeThreadCore,
    translateThreadCore,
  } = requireIdleAiCachePrefetchDeps();
  if (!isIdleAiCachePrefetchGenCurrent(startGen)) return;
  if (!state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) return;
  if (!isTauriRuntime()) return;
  if (state.view !== "list") return;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return;
  if (!currentAccount()?.id?.trim()) return;
  if (state.llmJobLabel) return;
  if (state.mailboxDigestRefreshing) return;
  if (state.syncInProgress) return;
  if (state.micState !== "idle") return;
  if (state.idleAiCachePrefetchBusy) return;
  await refreshLlmRuntimeStatus();
  if (!isIdleAiCachePrefetchGenCurrent(startGen)) return;
  if (!state.llmRuntimeStatus?.llmGateOpen) return;
  const seg = await aiCacheKeySegment();
  if (!isIdleAiCachePrefetchGenCurrent(startGen)) return;
  const candidates = await pickThreadIdsForIdleAiCachePrefetch(IDLE_AI_CACHE_PREFETCH_MAX_THREADS);
  if (!candidates.length) return;
  const ac = new AbortController();
  setIdlePrefetchAbort(ac);
  state.idleAiCachePrefetchBusy = true;
  render();
  try {
    for (const tid of candidates) {
      if (!isIdleAiCachePrefetchGenCurrent(startGen)) {
        ac.abort();
        break;
      }
      if (state.llmJobLabel || state.view !== "list") break;
      if (state.mailboxDigestRefreshing || state.syncInProgress) break;
      if (await threadSummaryCacheMissingForPrefetch(tid, seg)) {
        const sum = await summarizeThreadCore(tid, ac.signal, {
          prefetchOnly: true,
          toastOnDone: false,
          toastOnCache: false,
        });
        if (sum.status === "cancelled" || !isIdleAiCachePrefetchGenCurrent(startGen)) break;
      }
      if (!isIdleAiCachePrefetchGenCurrent(startGen)) {
        ac.abort();
        break;
      }
      if (state.llmJobLabel || state.view !== "list") break;
      const listRow = state.threads.find((row) => String(row.id) === tid);
      const mother = normalizeIso639Primary(state.appPrefs.general.motherLanguage?.trim() || "fr");
      const threadLang = listRow ? langFromKindTags(listRow.tags ?? []) : null;
      const skipTranslatePrefetch = Boolean(threadLang && threadLang === mother);
      if (!skipTranslatePrefetch && (await threadTranslateCacheMissingForPrefetch(tid, seg))) {
        const tr = await translateThreadCore(tid, ac.signal, { prefetchOnly: true });
        if (tr.status === "cancelled" || !isIdleAiCachePrefetchGenCurrent(startGen)) break;
      }
    }
  } catch (e) {
    console.warn("idle_ai_cache_prefetch", e);
  } finally {
    if (getIdlePrefetchAbort() === ac) setIdlePrefetchAbort(null);
    state.idleAiCachePrefetchBusy = false;
    render();
  }
}
