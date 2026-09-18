export type ComposeCloseFlowDeps = {
  persistDraft: () => void;
  flushDraftRevisionPending: () => Promise<void>;
  composeDraftHasMeaningfulContent: () => boolean;
  clearDraftRevisionDebounce: () => void;
  refreshSavedDraftsMailboxCount: () => void | Promise<void>;
  threadReadingIsSimpleLayout: () => boolean;
};

let composeCloseFlowDeps: ComposeCloseFlowDeps | null = null;

export function registerComposeCloseFlowDeps(deps: ComposeCloseFlowDeps): void {
  composeCloseFlowDeps = deps;
}

export function requireComposeCloseFlowDeps(): ComposeCloseFlowDeps {
  if (!composeCloseFlowDeps) throw new Error("registerComposeCloseFlowDeps not called");
  return composeCloseFlowDeps;
}
