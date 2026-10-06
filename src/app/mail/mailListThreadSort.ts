import type { ThreadListItem } from "../types";
import { parseMaybeDate } from "./threadMessageSort";

/** Trie les fils par `lastActivity` (date d’activité). */
export function sortThreadsByLastActivity(
  threads: ThreadListItem[],
  direction: "asc" | "desc",
): ThreadListItem[] {
  const cmp = direction === "asc" ? 1 : -1;
  const indexed = threads.map((t, index) => ({
    t,
    index,
    ms: parseMaybeDate(t.lastActivity)?.getTime() ?? Number.NaN,
  }));
  indexed.sort((a, b) => {
    const aOk = Number.isFinite(a.ms);
    const bOk = Number.isFinite(b.ms);
    if (aOk && bOk && a.ms !== b.ms) return cmp * (a.ms - b.ms);
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    const idCmp = a.t.id.localeCompare(b.t.id);
    if (idCmp !== 0) return direction === "asc" ? idCmp : -idCmp;
    return a.index - b.index;
  });
  return indexed.map((x) => x.t);
}
