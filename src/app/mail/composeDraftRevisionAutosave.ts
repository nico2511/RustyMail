let draftRevisionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Pause après la dernière modification avant un snapshot d’historique.
 * 3000 ms (auparavant 1800) : une micro-pause ne crée plus une version,
 * et la fermeture / `pagehide` enregistre encore une frappe non vide.
 * Les corps vides et les contenus identiques au dernier snapshot sont ignorés
 * dans `saveDraftRevisionNow`.
 */
const DRAFT_REVISION_DEBOUNCE_MS = 3000;

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
