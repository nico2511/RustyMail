export type ComposeDraftLocalSaveDeps = {
  refreshSavedDraftsMailboxCount: () => void | Promise<void>;
  loadMailView: (append: boolean) => Promise<void>;
};

let localSaveDeps: ComposeDraftLocalSaveDeps | null = null;

export function registerComposeDraftLocalSaveDeps(deps: ComposeDraftLocalSaveDeps): void {
  localSaveDeps = deps;
}

export function requireComposeDraftLocalSaveDeps(): ComposeDraftLocalSaveDeps {
  if (!localSaveDeps) throw new Error("registerComposeDraftLocalSaveDeps not called");
  return localSaveDeps;
}
