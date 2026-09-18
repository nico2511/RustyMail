import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import { registerComposeDraftRevisionAutosaveDeps } from "./composeDraftRevisionAutosave";
import { registerComposeDraftPreviewDeps } from "./composeDraftPreview";
import { registerComposeDraftRevisionDiffDeps } from "./composeDraftRevisionDiff";
import { registerComposeDraftLocalSaveDeps, saveDraftRevisionNow } from "./composeDraftLocalSave";
import {
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  computePreview,
  scheduleDraftRevisionSave,
} from "./composeComposerBridge";
import { registerComposePickAttachmentsDeps } from "./composePickAttachments";
import { registerComposeThreadReplyDeps } from "./composeThreadReply";
import { persistDraft } from "./composePersistDraft";
import { syncPreviewOpenFromComposeLayout } from "./composeLayoutState";
import { enterComposeView } from "./composeViewWireActions";
import { startNewDraftSession } from "./composeDraftSession";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { sanitizeEmailHtml } from "./mailEmailHtmlSanitize";
import { formatThreadReadingWhen } from "./threadMessageSort";
import { loadMailView } from "./mailListView";

export function registerAppComposeWireDraftDeps(): void {
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
