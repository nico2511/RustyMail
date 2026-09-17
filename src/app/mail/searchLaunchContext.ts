export type SearchLaunchDeps = {
  clearThreadAiSummaryState: () => void;
  refreshSearchTagCatalog: () => Promise<void>;
};

let searchLaunchDeps: SearchLaunchDeps | null = null;

export function registerSearchLaunchDeps(deps: SearchLaunchDeps): void {
  searchLaunchDeps = deps;
}

export function requireSearchLaunchDeps(): SearchLaunchDeps {
  if (!searchLaunchDeps) throw new Error("registerSearchLaunchDeps not called");
  return searchLaunchDeps;
}
