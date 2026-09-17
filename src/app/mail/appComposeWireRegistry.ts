/** Compose + draft wire deps — extracted from appModuleRegistry.ts */
import { cancelActiveLlmStreamJob } from "../../llmStream";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import {
  clearDraftRevisionDebounceTimer,
  flushDraftRevisionPending as flushDraftRevisionPendingNow,
  registerComposeDraftRevisionAutosaveDeps,
} from "./composeDraftRevisionAutosave";
import { composeDraftHasMeaningfulContent, startNewDraftSession } from "./composeDraftSession";
import { registerComposeDraftPreviewDeps } from "./composeDraftPreview";
import { registerComposeDraftRevisionDiffDeps } from "./composeDraftRevisionDiff";
import {
  registerComposeDraftLocalSaveDeps,
  saveDraftRevisionNow,
} from "./composeDraftLocalSave";
import {
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  computePreview,
  scheduleDraftRevisionSave,
} from "./composeComposerBridge";
import { registerComposePickAttachmentsDeps } from "./composePickAttachments";
import { registerComposeSendDraftRunDeps } from "./composeSendDraftRun";
import { clearDraftSession, registerComposeCloseFlowDeps } from "./composeCloseFlow";
import { registerComposeAttachmentsActionDeps } from "./composeAttachmentsAction";
import { registerCycleComposeLayoutDeps } from "./cycleComposeLayout";
import { enterComposeView } from "./composeViewWireActions";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import { registerComposeThreadReplyDeps } from "./composeThreadReply";
import { persistDraft } from "./composePersistDraft";
import { syncPreviewOpenFromComposeLayout } from "./composeLayoutState";
import {
  loadMailView,
  loadMailboxUnread,
} from "./mailListView";
import { abortIdleAiCachePrefetchInFlight } from "./idleAiCachePrefetch";
import { abortLlmQueueJob } from "./llmJobQueue";
import { registerLlmQueueCancelDeps } from "./llmQueueCancel";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { sanitizeEmailHtml } from "./mailEmailHtmlSanitize";
import { formatThreadReadingWhen } from "./threadMessageSort";
import { threadReadingIsSimpleLayout } from "./threadShellLayout";

async function flushDraftRevisionPending(): Promise<void> {
  await flushDraftRevisionPendingNow(
    () => state.view === "compose" && Boolean(state.draft && state.draftSessionId),
  );
}

export function registerAppComposeWireDeps(): void {
  registerComposeCloseFlowDeps({
    persistDraft,
    flushDraftRevisionPending,
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

  registerLlmQueueCancelDeps({
    cancelActiveLlmStreamJob,
    abortIdleAiCachePrefetchInFlight,
    abortLlmQueue: abortLlmQueueJob,
  });

  registerComposeSendDraftRunDeps({
    loadMailView,
    loadMailboxUnread,
    clearDraftSession,
  });

  registerComposeDraftPreviewDeps({
    persistDraft,
    sanitizePreviewHtml: (htmlRaw) => sanitizeEmailHtml(htmlRaw, { relocateUnsubscribe: false }).html,
  });

  registerComposeDraftLocalSaveDeps({
    refreshSavedDraftsMailboxCount,
    loadMailView,
  });

  registerComposeDraftRevisionAutosaveDeps({
    canScheduleDraftRevisionSave: () =>
      isTauriRuntime() && Boolean(state.draft && state.draftSessionId),
    saveDraftRevisionNow: () => {
      void saveDraftRevisionNow();
    },
  });

  registerComposeDraftRevisionDiffDeps({ persistDraft });

  registerComposePickAttachmentsDeps({ scheduleDraftRevisionSave });

  registerComposeThreadReplyDeps({
    loadComposeMarkdownIntoEditor,
    resetMarkdownEditorHistory,
    computePreview,
    scheduleDraftRevisionSave,
    formatThreadReadingWhen,
    enterComposeView,
    startNewDraftSession,
    syncPreviewOpenFromComposeLayout,
  });
}
