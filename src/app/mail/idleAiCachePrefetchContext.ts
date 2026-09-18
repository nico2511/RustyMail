import type { Tag } from "../types";

export type IdleAiCachePrefetchDeps = {
  withTimeout: <T>(promise: Promise<T>, timeoutMs: number) => Promise<T>;
  currentAccount: () => { id?: string } | undefined;
  aiCacheKeySegment: () => Promise<string>;
  refreshLlmRuntimeStatus: (forceHardwareRescan?: boolean) => Promise<void>;
  threadIsAutoMail: (thread?: { isNewsletterThread?: boolean } | null, threadId?: string | null) => boolean;
  langFromKindTags: (tags: Tag[]) => string | null;
  normalizeIso639Primary: (langRaw: string) => string;
  summarizeThreadCore: (
    threadId: string,
    signal: AbortSignal,
    opts: { prefetchOnly: boolean; toastOnDone: boolean; toastOnCache: boolean },
  ) => Promise<{ status: string }>;
  translateThreadCore: (
    threadId: string,
    signal: AbortSignal,
    opts: { prefetchOnly: boolean },
  ) => Promise<{ status: string }>;
};

let deps: IdleAiCachePrefetchDeps | null = null;

export function initIdleAiCachePrefetch(moduleDeps: IdleAiCachePrefetchDeps): void {
  deps = moduleDeps;
}

export function requireIdleAiCachePrefetchDeps(): IdleAiCachePrefetchDeps {
  if (!deps) throw new Error("idleAiCachePrefetch: initIdleAiCachePrefetch() not called");
  return deps;
}

export let idleAiCachePrefetchGen = 0;

export function bumpIdleAiCachePrefetchGen(): number {
  return ++idleAiCachePrefetchGen;
}

export function getIdleAiCachePrefetchGen(): number {
  return idleAiCachePrefetchGen;
}

export function isIdleAiCachePrefetchGenCurrent(gen: number): boolean {
  return gen === idleAiCachePrefetchGen;
}

let idlePrefetchAbort: AbortController | null = null;

export function getIdlePrefetchAbort(): AbortController | null {
  return idlePrefetchAbort;
}

export function setIdlePrefetchAbort(ac: AbortController | null): void {
  idlePrefetchAbort = ac;
}
