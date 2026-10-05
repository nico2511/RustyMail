import { invoke } from "@tauri-apps/api/core";
import type { Draft } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { openConfirmModal } from "../modals/promptConfirm";
import { composeSendAccount } from "../core/composeSendAccount";
import { state } from "../state";
import {
  computePreview,
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  scheduleDraftRevisionSave,
} from "./composeComposerBridge";
import { markComposeDraftEdited } from "./composeDraftContentKey";
import { setPendingDraftRevisionEventKind } from "./composeDraftRevisionEventKind";
import { computeDraftDiffAgainstRevision } from "./composeDraftRevisionDiff";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import { enterComposeView, syncPreviewOpenFromComposeLayout } from "./composeViewWireActions";
import { syncComposeAttachmentsHiddenField } from "./composeAttachmentPaths";

export async function restoreDraftRevisionFromWire(revisionId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  const rid = revisionId.trim();
  const accountId = composeSendAccount()?.id?.trim() ?? "";
  if (!rid || !accountId) return;
  const ok = await openConfirmModal({
    title: "Restaurer cette version ?",
    body: "Le contenu actuel du compositeur sera remplacé par cette révision.",
    confirmLabel: "Restaurer",
  });
  if (!ok) return;
  try {
    const wasHistoriqueLayout = state.composeLayout === "historique";
    const restored = await withTimeout(
      invoke<Draft | null>("draft_revision_restore", { accountId, revisionId: rid }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    if (!restored) {
      toast.warning("Cette version n’existe plus.");
      return;
    }
    state.draft = restored;
    state.draft.attachmentPaths = [...(restored.attachmentPaths ?? [])];
    syncComposeAttachmentsHiddenField(state.draft.attachmentPaths);
    loadComposeMarkdownIntoEditor(restored.markdownBody);
    enterComposeView({ skipHistory: true });
    state.composeLayout = wasHistoriqueLayout ? "historique" : "split";
    syncPreviewOpenFromComposeLayout();
    resetMarkdownEditorHistory();
    render();
    if (wasHistoriqueLayout) {
      void refreshDraftRevisions(60);
      void computeDraftDiffAgainstRevision(rid);
    } else {
      window.setTimeout(() => void computePreview(), 0);
    }
    markComposeDraftEdited();
    setPendingDraftRevisionEventKind("restore");
    scheduleDraftRevisionSave(450);
  } catch (error) {
    console.error("draft_revision_restore", error);
    toast.error(`Restauration impossible: ${tauriErrorMessage(error)}`);
  }
}
