export type AppNavigationStackDeps = {
  openThread: (threadId: string, opts?: { skipHistory?: boolean; preserveAi?: boolean }) => Promise<void>;
  openContactDetailView: (email: string, opts?: { skipHistory?: boolean }) => Promise<void>;
  fmSelectMailbox: (mailbox: string, opts?: { skipHistory?: boolean }) => Promise<void>;
  refreshFolderManagerTree: () => Promise<void>;
};

let navigationStackDeps: AppNavigationStackDeps | null = null;

export function registerAppNavigationStackDeps(deps: AppNavigationStackDeps): void {
  navigationStackDeps = deps;
}

export function requireAppNavigationStackDeps(): AppNavigationStackDeps {
  if (!navigationStackDeps) throw new Error("registerAppNavigationStackDeps not called");
  return navigationStackDeps;
}
