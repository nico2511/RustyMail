let draftRevisionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const DRAFT_REVISION_DEBOUNCE_MS = 1800;

export type ComposeDraftRevisionAutosaveDeps = {
  canScheduleDraftRevisionSave: () => boolean;
  saveDraftRevisionNow: () => void | Promise<void>;
};

let autosaveDeps: ComposeDraftRevisionAutosaveDeps | null = null;

export function registerComposeDraftRevisionAutosaveDeps(deps: ComposeDraftRevisionAutosaveDeps): void {
  autosaveDeps = deps;
}

function deps(): ComposeDraftRevisionAutosaveDeps {
  if (!autosaveDeps) throw new Error("registerComposeDraftRevisionAutosaveDeps not called");
  return autosaveDeps;
}

export function scheduleDraftRevisionSave(delayMs = DRAFT_REVISION_DEBOUNCE_MS): void {
  if (!deps().canScheduleDraftRevisionSave()) return;
  if (draftRevisionDebounceTimer !== null) {
    window.clearTimeout(draftRevisionDebounceTimer);
  }
  draftRevisionDebounceTimer = window.setTimeout(() => {
    draftRevisionDebounceTimer = null;
    void deps().saveDraftRevisionNow();
  }, Math.max(150, delayMs));
}

export function clearDraftRevisionDebounceTimer(): void {
  if (draftRevisionDebounceTimer !== null) {
    window.clearTimeout(draftRevisionDebounceTimer);
    draftRevisionDebounceTimer = null;
  }
}

export async function flushDraftRevisionPending(saveWhenCompose: () => boolean): Promise<void> {
  clearDraftRevisionDebounceTimer();
  if (saveWhenCompose()) {
    await deps().saveDraftRevisionNow();
  }
}
