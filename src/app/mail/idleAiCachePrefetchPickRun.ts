import { SAVED_DRAFT_THREAD_PREFIX } from "../../mailboxKinds";
import { invokeAiCacheGet } from "../../ipc_bridge";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { AI_CACHE_PROMPT_REVISION, BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { state } from "../state";
import { requireIdleAiCachePrefetchDeps } from "./idleAiCachePrefetchContext";

export async function pickThreadIdsForIdleAiCachePrefetch(max: number): Promise<string[]> {
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

export async function threadSummaryCacheMissingForPrefetch(threadId: string, seg: string): Promise<boolean> {
  const { withTimeout } = requireIdleAiCachePrefetchDeps();
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) return false;
  const ck = `summary:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:${threadId}`;
  const c = await invokeAiCacheGet(ck, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  return !c?.trim();
}

export async function threadTranslateCacheMissingForPrefetch(threadId: string, seg: string): Promise<boolean> {
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
