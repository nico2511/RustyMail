import { SAVED_DRAFT_THREAD_PREFIX } from "../../mailboxKinds";
import { markThreadsRecentlyRemoved } from "../../recentlyRemovedThreads";
import { state } from "../state";

export function savedDraftThreadId(savedDraftId: string): string {
  const id = savedDraftId.trim();
  return id ? `${SAVED_DRAFT_THREAD_PREFIX}${id}` : "";
}

/**
 * Retire tout de suite une ligne « Sauvés » de la liste affichée et décrémente
 * la pastille. Un rechargement SQLite ultérieur ne doit pas la réafficher
 * tant que le filet « recently removed » tient (voir `visibleSavedDraftThreads`).
 */
export function forgetSavedDraftLocally(savedDraftId: string): void {
  const tid = savedDraftThreadId(savedDraftId);
  if (!tid) return;
  markThreadsRecentlyRemoved([tid]);
  state.threads = state.threads.filter((t) => String(t.id) !== tid);
  state.savedDraftsMailboxCount = Math.max(0, Math.floor(state.savedDraftsMailboxCount) - 1);
  if (state.selectedThreadId === tid) {
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
  }
}
