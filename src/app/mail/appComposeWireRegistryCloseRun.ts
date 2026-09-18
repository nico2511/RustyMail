import { state } from "../state";
import { registerComposeAttachmentsActionDeps } from "./composeAttachmentsAction";
import { clearDraftRevisionDebounceTimer, flushDraftRevisionPending as flushDraftRevisionPendingNow } from "./composeDraftRevisionAutosave";
import { composeDraftHasMeaningfulContent } from "./composeDraftSession";
import { registerComposeCloseFlowDeps } from "./composeCloseFlow";
import { computePreview, scheduleDraftRevisionSave } from "./composeComposerBridge";
import { registerComposeSendDraftRunDeps } from "./composeSendDraftRun";
import { clearDraftSession } from "./composeCloseFlow";
import { registerCycleComposeLayoutDeps } from "./cycleComposeLayout";
import { persistDraft } from "./composePersistDraft";
import { syncPreviewOpenFromComposeLayout } from "./composeLayoutState";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { loadMailView, loadMailboxUnread } from "./mailListView";
import { threadReadingIsSimpleLayout } from "./threadShellLayout";

export async function flushDraftRevisionPendingForCompose(): Promise<void> {
  await flushDraftRevisionPendingNow(
    () => state.view === "compose" && Boolean(state.draft && state.draftSessionId),
  );
}

export function registerAppComposeWireCloseDeps(): void {
  registerComposeCloseFlowDeps({
    persistDraft,
    flushDraftRevisionPending: flushDraftRevisionPendingForCompose,
    composeDraftHasMeaningfulContent,
    clearDraftRevisionDebounce: clearDraftRevisionDebounceTimer,
    refreshSavedDraftsMailboxCount,
    threadReadingIsSimpleLayout,
  });

  registerComposeAttachmentsActionDeps({ scheduleDraftRevisionSave });

  registerCycleComposeLayoutDeps({
    persistDraft,
    syncPreviewOpenFromComposeLayout,
    refreshDraftRevisions,
    computePreview,
  });

  registerComposeSendDraftRunDeps({
    loadMailView,
    loadMailboxUnread,
    clearDraftSession,
  });
}
