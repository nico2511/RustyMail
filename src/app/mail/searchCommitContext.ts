import type { ThreadListItem } from "../types";

export type SearchCommitDeps = {
  loadMailView: (append: boolean) => Promise<void>;
  loadThreadsForSearchContext: (append?: boolean) => Promise<void>;
  threadsVisibleInList: () => ThreadListItem[];
  clearThreadAiSummaryState: () => void;
  withLlmQueue: <T>(label: string, fn: (signal: AbortSignal) => Promise<T>) => Promise<T | null>;
};

let searchCommitDeps: SearchCommitDeps | null = null;

export function registerSearchCommitDeps(deps: SearchCommitDeps): void {
  searchCommitDeps = deps;
}

export function requireSearchCommitDeps(): SearchCommitDeps {
  if (!searchCommitDeps) throw new Error("registerSearchCommitDeps not called");
  return searchCommitDeps;
}
