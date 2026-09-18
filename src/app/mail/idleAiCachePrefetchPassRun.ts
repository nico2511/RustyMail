import { SAVED_DRAFT_THREAD_PREFIX, isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { invokeAiCacheGet } from "../../ipc_bridge";
import { isAiFeatureEnabled } from "../../aiFeatures";
import {
  AI_CACHE_PROMPT_REVISION,
  BOOT_INVOKE_TIMEOUT_MS,
  IDLE_AI_CACHE_PREFETCH_MAX_THREADS,
} from "../core/timeouts";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import {
  getIdlePrefetchAbort,
  isIdleAiCachePrefetchGenCurrent,
  requireIdleAiCachePrefetchDeps,
  setIdlePrefetchAbort,
} from "./idleAiCachePrefetchContext";

async function pickThreadIdsForIdleAiCachePrefetch(max: number): Promise<string[]> {
  const {
    withTimeout,
    aiCacheKeySegment,
    threadIsAutoMail,
    langFromKindTags,
    normalizeIso639Primary,
  } = requireIdleAiCachePrefetchDeps();
  const wantSum = isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled");
  const wantTr = isAiFeatureEnabled(state.appPrefs.ai, "featureThreadTranslateEnabled");
  if (!wantSum && !wantTr) return [];
  const seg = await aiCacheKeySegment();
  const lang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const sorted = [...state.threads].sort((a, b) => {
    const ua = a.unread ? 1 : 0;
    const ub = b.unread ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return String(b.lastActivity ?? "").localeCompare(String(a.lastActivity ?? ""));
  });
  const out: string[] = [];
  for (const t of sorted) {
    if (out.length >= max) break;
    const tid = String(t.id ?? "").trim();
    if (!tid || tid.startsWith(SAVED_DRAFT_THREAD_PREFIX)) continue;
    if (threadIsAutoMail(t, tid)) continue;
    let needs = false;
    if (wantSum) {
      const ck = `summary:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:${tid}`;
      const c = await invokeAiCacheGet(ck, {
        timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
        withTimeout,
      });
      if (!c?.trim()) needs = true;
    }
    if (!needs && wantTr) {
      const mother = normalizeIso639Primary(lang);
      const threadLang = langFromKindTags(t.tags ?? []);
      if (!(threadLang && threadLang === mother)) {
        const ck = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:thread:${tid}:${lang}`;
        const c = await invokeAiCacheGet(ck, {
          timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
          withTimeout,
        });
        if (!c?.trim()) needs = true;
      }
    }
    if (needs) out.push(tid);
  }
  return out;
}

async function threadSummaryCacheMissingForPrefetch(threadId: string, seg: string): Promise<boolean> {
  const { withTimeout } = requireIdleAiCachePrefetchDeps();
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) return false;
  const ck = `summary:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:${threadId}`;
  const c = await invokeAiCacheGet(ck, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  return !c?.trim();
}

async function threadTranslateCacheMissingForPrefetch(threadId: string, seg: string): Promise<boolean> {
  const { withTimeout } = requireIdleAiCachePrefetchDeps();
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadTranslateEnabled")) return false;
  const lang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const ck = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:thread:${threadId}:${lang}`;
  const c = await invokeAiCacheGet(ck, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  return !c?.trim();
}

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
