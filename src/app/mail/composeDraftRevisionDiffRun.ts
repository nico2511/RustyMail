import { invoke } from "@tauri-apps/api/core";
import type { Draft, DraftPreview } from "../types";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { escapeHtml } from "../../ui/sanitize";
import { myersDiffDraftLines, splitDraftDiffLines } from "./composeDraftRevisionDiffAlgoRun";
import { requireComposeDraftRevisionDiffDeps } from "./composeDraftRevisionDiffContext";

export async function computeDraftDiffAgainstRevision(revisionId: string): Promise<void> {
  const d = requireComposeDraftRevisionDiffDeps();
  const rid = revisionId.trim();
  const accountId = currentAccount()?.id?.trim() ?? "";
  if (!isTauriRuntime() || !rid || !accountId) return;
  if (!state.draft) return;
  d.persistDraft();

  state.draftDiffRevisionId = rid;
  state.draftDiffLoading = true;
  state.draftDiffLines = [];
  state.draftDiffOtherBody = "";
  state.draftRevisionPreview = null;
  render();

  try {
    const other = await withTimeout(
      invoke<Draft | null>("draft_revision_restore", { accountId, revisionId: rid }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    if (!other) {
      toast("Cette version n’existe plus.");
      state.draftDiffLoading = false;
      render();
      return;
    }
    const curBody = state.draft.markdownBody ?? "";
    const otherBody = other.markdownBody ?? "";
    state.draftDiffOtherBody = otherBody;
    state.draftRevisionPreview = await safeInvoke<DraftPreview>(
      "preview_draft",
      { markdownBody: otherBody },
      {
        textPlain: otherBody,
        html: `<p>${escapeHtml(otherBody).replace(/\n/g, "<br />")}</p>`,
      },
    );
    const a = splitDraftDiffLines(curBody);
    const b = splitDraftDiffLines(otherBody);
    if (a.length + b.length > 8000) {
      toast("Diff trop volumineux : affichez une version plus courte (limite lignes).");
      state.draftDiffLines = [];
    } else {
      state.draftDiffLines = myersDiffDraftLines(a, b);
    }
  } catch (error) {
    console.error("draft_revision_restore (diff)", error);
    toast(`Diff impossible: ${tauriErrorMessage(error)}`);
  } finally {
    state.draftDiffLoading = false;
    render();
  }
}
