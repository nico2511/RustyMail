import { invoke } from "@tauri-apps/api/core";
import type { AppPrefsAi } from "../../prefs_defaults";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { savedDraftIdFromThreadId } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { loadMailboxUnread } from "./mailListView";
import { state } from "../state";
import type { OpenThreadDeps } from "./openThreadViewDepsRun";

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
  try {
    const mailbox = deps.sourceMailboxForThread(threadId);
    await withTimeout(invoke<string>("thread_mark_read", { accountId, mailbox, threadId }), MAIL_ACTION_TIMEOUT_MS);
    if (state.selectedThread) state.selectedThread = { ...state.selectedThread, unread: false };
    const ti = state.threads.findIndex((t) => String(t.id) === String(threadId));
    if (ti >= 0) {
      state.threads[ti] = { ...state.threads[ti], unread: false };
    }
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
