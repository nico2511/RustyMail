import { invoke } from "@tauri-apps/api/core";
import type { AppPrefsAi } from "../../prefs_defaults";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { isInboxLikeMailbox, savedDraftIdFromThreadId } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { loadMailboxUnread } from "./mailListView";
import { state } from "../state";
import type { OpenThreadDeps } from "./openThreadViewDepsRun";

function applyThreadReadLocal(threadId: string, mailbox: string): void {
  if (state.selectedThread && String(state.selectedThread.id) === String(threadId)) {
    state.selectedThread = { ...state.selectedThread, unread: false };
  }
  const ti = state.threads.findIndex((t) => String(t.id) === String(threadId));
  if (ti >= 0) {
    state.threads[ti] = { ...state.threads[ti], unread: false };
  }
  // Compteurs locaux avant IMAP : le Retour BAL peint déjà les bons badges
  // sans attendre loadMailboxUnread + un 2ᵉ render() complet.
  const cur = state.mailboxUnread[mailbox];
  if (typeof cur === "number" && cur > 0) {
    state.mailboxUnread = { ...state.mailboxUnread, [mailbox]: cur - 1 };
  }
  if (state.inboxFilterCounts && state.inboxFilterCounts.unread > 0) {
    state.inboxFilterCounts = {
      ...state.inboxFilterCounts,
      unread: state.inboxFilterCounts.unread - 1,
    };
  }
  if (isInboxLikeMailbox(mailbox)) {
    const accountId = currentAccount()?.id?.trim();
    if (accountId) {
      const n = state.accountInboxUnread[accountId];
      if (typeof n === "number" && n > 0) {
        state.accountInboxUnread = { ...state.accountInboxUnread, [accountId]: n - 1 };
      }
    }
  }
}

/** Marque lu en local immédiatement, puis IMAP + compteurs en arrière-plan. */
export async function markOpenedThreadReadIfUnread(
  threadId: string,
  deps: OpenThreadDeps,
): Promise<void> {
  if (savedDraftIdFromThreadId(threadId)) return;
  if (!isTauriRuntime()) return;
  const unread = Boolean(state.selectedThread?.unread);
  if (!unread) return;
  const account = currentAccount();
  const accountId = account?.id?.trim();
  if (!accountId) return;
  const mailbox = deps.sourceMailboxForThread(threadId);
  applyThreadReadLocal(threadId, mailbox);
  try {
    await withTimeout(invoke<string>("thread_mark_read", { accountId, mailbox, threadId }), MAIL_ACTION_TIMEOUT_MS);
    // Met à jour state seulement — pas de render() : le fil a déjà le unread local,
    // et un paint BAL après Retour (ou un 2ᵉ rebuild liste) gelait l’UI.
    await loadMailboxUnread();
  } catch (e) {
    console.warn("thread_mark_read (ouverture)", e);
  }
}

export async function maybeAutoSummarizeThreadOnOpen(
  threadId: string,
  thread: { messages?: Array<{ messageId?: string }> },
  deps: OpenThreadDeps,
): Promise<void> {
  const ai = state.appPrefs.ai as AppPrefsAi & {
    featureAutoThreadSummaryEnabled?: boolean;
    autoThreadSummaryMinMessages?: number;
  };
  if (!ai.featureAutoThreadSummaryEnabled) return;
  if (deps.isSenderBatchSummarizeActive()) return;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) return;
  const min = ai.autoThreadSummaryMinMessages ?? 6;
  if ((thread.messages?.length ?? 0) < min) return;
  if (deps.getAutoThreadSummaryDoneFor() === threadId) return;
  deps.setAutoThreadSummaryDoneFor(threadId);
  await deps.summarizeThread();
}
