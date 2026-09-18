import { invoke } from "@tauri-apps/api/core";
import type { Draft } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { openConfirmModal } from "../modals/promptConfirm";
import { currentAccount } from "../core/accountContext";
import { state } from "../state";
import {
  computePreview,
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  scheduleDraftRevisionSave,
} from "./composeComposerBridge";
import { computeDraftDiffAgainstRevision } from "./composeDraftRevisionDiff";
import { refreshDraftRevisions } from "./composeDraftRevisions";
import { enterComposeView, syncPreviewOpenFromComposeLayout } from "./composeViewWireActions";

export async function restoreDraftRevisionFromWire(revisionId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  const rid = revisionId.trim();
  const accountId = currentAccount()?.id?.trim() ?? "";
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
      toast("Cette version n’existe plus.");
      return;
    }
    state.draft = restored;
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
    scheduleDraftRevisionSave(450);
  } catch (error) {
    console.error("draft_revision_restore", error);
    toast(`Restauration impossible: ${tauriErrorMessage(error)}`);
  }
}
