/** Fils retirés optimistiquement (trash/archive/move) — masqués un moment malgré un resync. */

export const RECENTLY_REMOVED_THREAD_TTL_MS = 60_000;

const recentlyRemovedThreadIds = new Map<string, number>();

export function markThreadsRecentlyRemoved(ids: Iterable<string>): void {
  const exp = Date.now() + RECENTLY_REMOVED_THREAD_TTL_MS;
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (id) recentlyRemovedThreadIds.set(id, exp);
  }
}

export function clearThreadsRecentlyRemoved(ids: Iterable<string>): void {
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (id) recentlyRemovedThreadIds.delete(id);
  }
}

export function pruneRecentlyRemovedThreads(): void {
  const now = Date.now();
  for (const [id, exp] of recentlyRemovedThreadIds) {
    if (exp <= now) recentlyRemovedThreadIds.delete(id);
  }
}

export function filterRecentlyRemovedThreads<T extends { id: string | number }>(
  list: T[],
): T[] {
  pruneRecentlyRemovedThreads();
  if (recentlyRemovedThreadIds.size === 0) return list;
  const now = Date.now();
  return list.filter((t) => {
    const exp = recentlyRemovedThreadIds.get(String(t.id));
    return exp === undefined || exp <= now;
  });
}

export function isThreadRecentlyRemoved(threadId: string): boolean {
  pruneRecentlyRemovedThreads();
  const exp = recentlyRemovedThreadIds.get(String(threadId));
  return exp !== undefined && exp > Date.now();
}
