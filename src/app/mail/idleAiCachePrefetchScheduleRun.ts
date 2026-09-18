import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import {
  IDLE_AI_CACHE_IDLE_CALLBACK_TIMEOUT_MS,
  IDLE_AI_CACHE_PREFETCH_DEBOUNCE_MS,
} from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import {
  bumpIdleAiCachePrefetchGen,
  getIdleAiCachePrefetchGen,
  getIdlePrefetchAbort,
  isIdleAiCachePrefetchGenCurrent,
  requireIdleAiCachePrefetchDeps,
  setIdlePrefetchAbort,
} from "./idleAiCachePrefetchContext";
import { runIdleAiCachePrefetchPass } from "./idleAiCachePrefetchPassRun";

let idleAiCachePrefetchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let idleAiCachePrefetchIdleHandle: number | null = null;

function cancelIdleAiCachePrefetchTimersOnly(): void {
  if (idleAiCachePrefetchDebounceTimer !== null) {
    window.clearTimeout(idleAiCachePrefetchDebounceTimer);
    idleAiCachePrefetchDebounceTimer = null;
  }
  if (idleAiCachePrefetchIdleHandle !== null) {
    if (typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleAiCachePrefetchIdleHandle);
    } else {
      window.clearTimeout(idleAiCachePrefetchIdleHandle);
    }
    idleAiCachePrefetchIdleHandle = null;
  }
}

export function abortIdleAiCachePrefetchInFlight(): void {
  getIdlePrefetchAbort()?.abort();
}

export function invalidateIdleAiCachePrefetch(): void {
  getIdlePrefetchAbort()?.abort();
  setIdlePrefetchAbort(null);
  bumpIdleAiCachePrefetchGen();
  cancelIdleAiCachePrefetchTimersOnly();
}

export function scheduleIdleAiCachePrefetch(): void {
  if (!isTauriRuntime()) return;
  if (!state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) return;
  if (state.view !== "list") return;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return;
  if (!requireIdleAiCachePrefetchDeps().currentAccount()?.id?.trim()) return;
  cancelIdleAiCachePrefetchTimersOnly();
  const gen = getIdleAiCachePrefetchGen();
  idleAiCachePrefetchDebounceTimer = window.setTimeout(() => {
    idleAiCachePrefetchDebounceTimer = null;
    if (!isIdleAiCachePrefetchGenCurrent(gen)) return;
    const run = () => {
      idleAiCachePrefetchIdleHandle = null;
      if (!isIdleAiCachePrefetchGenCurrent(gen)) return;
      void runIdleAiCachePrefetchPass(gen);
    };
    if (typeof window.requestIdleCallback === "function") {
      idleAiCachePrefetchIdleHandle = window.requestIdleCallback(run, {
        timeout: IDLE_AI_CACHE_IDLE_CALLBACK_TIMEOUT_MS,
      });
    } else {
      idleAiCachePrefetchIdleHandle = window.setTimeout(run, 400) as unknown as number;
    }
  }, IDLE_AI_CACHE_PREFETCH_DEBOUNCE_MS);
}
