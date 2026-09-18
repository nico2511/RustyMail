export type ComposeDraftRevisionDiffDeps = {
  persistDraft: () => void;
};

let composeDraftRevisionDiffDeps: ComposeDraftRevisionDiffDeps | null = null;

export function registerComposeDraftRevisionDiffDeps(deps: ComposeDraftRevisionDiffDeps): void {
  composeDraftRevisionDiffDeps = deps;
}

export function requireComposeDraftRevisionDiffDeps(): ComposeDraftRevisionDiffDeps {
  if (!composeDraftRevisionDiffDeps) throw new Error("registerComposeDraftRevisionDiffDeps not called");
  return composeDraftRevisionDiffDeps;
}
