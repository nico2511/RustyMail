import {
  filterRecentlyRemovedThreads,
  isThreadRecentlyRemoved,
} from "./recentlyRemovedThreads";

/** Applique une page serveur en respectant le filet « recently removed ». */
export function mergeServerThreadPage<T extends { id: string | number }>(
  current: T[],
  page: T[],
  append: boolean,
): { threads: T[]; threadOffsetReset: boolean } {
  const filtered = filterRecentlyRemovedThreads(page);
  if (append) {
    const seen = new Set(current.map((t) => String(t.id)));
    const threads = [
      ...current.filter((t) => !isThreadRecentlyRemoved(String(t.id))),
      ...filtered.filter((t) => !seen.has(String(t.id))),
    ];
    return { threads, threadOffsetReset: false };
  }
  return { threads: filtered, threadOffsetReset: true };
}
