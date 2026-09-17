import { invoke } from "@tauri-apps/api/core";
import type { SemanticEmbeddingCountsSnapshot } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout } from "../lib/tauriCommand";
import { render } from "../dispatch";
import { state } from "../state";

export async function refreshSemanticEmbeddingCounts(): Promise<void> {
  if (!isTauriRuntime()) {
    state.semanticEmbeddingCounts = null;
    return;
  }
  const account = currentAccount();
  const aid = account?.id?.trim();
  const mailbox = state.selectedMailbox || "INBOX";
  if (!aid || !mailbox) {
    state.semanticEmbeddingCounts = null;
    return;
  }
  try {
    state.semanticEmbeddingCounts = await withTimeout(
      invoke<SemanticEmbeddingCountsSnapshot>("semantic_embedding_counts", { accountId: aid, mailbox }),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch {
    state.semanticEmbeddingCounts = null;
  }
  if (state.view === "settings" && state.settingsTab === "ai") {
    render();
  }
}
