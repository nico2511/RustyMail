import { invoke } from "@tauri-apps/api/core";
import type { DraftRevisionListItem } from "../types";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";

export async function refreshDraftRevisions(limit = 50): Promise<void> {
  const accountId = currentAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  if (!isTauriRuntime() || !accountId || !sessionId) return;
  state.draftRevisionsLoading = true;
  render();
  try {
    state.draftRevisions = await withTimeout(
      invoke<DraftRevisionListItem[]>("draft_revision_list", { accountId, sessionId, limit }),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("draft_revision_list", error);
    toast(`Impossible de charger l’historique: ${tauriErrorMessage(error)}`);
  } finally {
    state.draftRevisionsLoading = false;
    render();
  }
}
