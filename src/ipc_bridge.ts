import { invoke } from "@tauri-apps/api/core";

const lastIpcThrottle = new Map<string, number>();

/** Anti double-clics / storms sur commandes très lourdes (complète le garde Rust). */
export function ipcThrottleMs(key: string, minMs: number): boolean {
  const now = Date.now();
  const last = lastIpcThrottle.get(key) ?? 0;
  if (now - last < minMs) {
    return false;
  }
  lastIpcThrottle.set(key, now);
  return true;
}

/** Latence IPC en console (vite dev uniquement). */
export async function ipcTimedInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const t = typeof performance !== "undefined" ? performance.now() : 0;
  const out = await invoke<T>(cmd, args ?? {});
  if (import.meta.env.DEV && typeof performance !== "undefined") {
    console.debug(`[ipc] ${cmd}: ${(performance.now() - t).toFixed(1)} ms`);
  }
  return out;
}

/** Borne une promesse (ex. `withTimeout` local à `main.ts`). */
export type WithTimeoutFn = <T>(promise: Promise<T>, timeoutMs: number) => Promise<T>;

const aiCacheGetInFlight = new Map<string, Promise<string | null>>();

/**
 * Lecture `ai_cache_get` : `ipcTimedInvoke` (logs dev) + fusion des appels concurrents même clé.
 * Les erreurs / timeout → `null` (même comportement qu’un try/catch autour de `invoke`).
 */
export function invokeAiCacheGet(
  key: string,
  options: { timeoutMs: number; withTimeout: WithTimeoutFn },
): Promise<string | null> {
  const k = key.trim();
  const { timeoutMs, withTimeout } = options;
  let existing = aiCacheGetInFlight.get(k);
  if (existing) return existing;
  const p = (async (): Promise<string | null> => {
    try {
      return await withTimeout(
        ipcTimedInvoke<string | null>("ai_cache_get", { key: k }),
        timeoutMs,
      );
    } catch {
      return null;
    } finally {
      aiCacheGetInFlight.delete(k);
    }
  })();
  aiCacheGetInFlight.set(k, p);
  return p;
}
