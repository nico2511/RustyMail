import { state } from "../state";
import { flushDraftRevisionPending as flushDraftRevisionPendingCore } from "./composeDraftRevisionAutosave";

async function flushDraftRevisionPending(): Promise<void> {
  await flushDraftRevisionPendingCore(
    () => state.view === "compose" && Boolean(state.draft && state.draftSessionId),
  );
}

export function bindDraftPersistenceFlush(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushDraftRevisionPending();
    }
  });
  window.addEventListener("pagehide", () => {
    void flushDraftRevisionPending();
  });
}
