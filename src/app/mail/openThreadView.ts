import { invoke } from "@tauri-apps/api/core";
import type { AppPrefsAi } from "../../prefs_defaults";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { isUnifiedInboxMailbox, savedDraftIdFromThreadId } from "../../mailboxKinds";
import type { DiscussionThreadView } from "../types";
import { currentAccount } from "../core/accountContext";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { loadMailboxUnread } from "./mailListView";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { invalidateIdleAiCachePrefetch } from "./idleAiCachePrefetch";
import { startThreadActivityOpen } from "./threadActivityTracking";
import { beginNavigation } from "./appNavigationStack";
import { render } from "../dispatch";
import { state } from "../state";

export type OpenThreadOptions = { preserveAi?: boolean; skipHistory?: boolean };

export type OpenThreadDeps = {
  openSavedDraftById: (savedId: string) => Promise<void>;
  navPop: () => unknown;
  threadAiSummaryScoped: () => boolean;
  clearThreadAiSummaryState: () => void;
  threadIsAutoMail: (thread: DiscussionThreadView | undefined, tid: string) => boolean;
  stopAgentTelemetry: () => Promise<void>;
  loadNewsletterRules: () => Promise<void>;
  hydrateMessageTranslationsFromCacheForThread: (messages: DiscussionThreadView["messages"]) => void;
  scheduleSecurityLlmAugment: (message: DiscussionThreadView["messages"][number]) => void;
  summarizeThread: () => Promise<void>;
  sourceMailboxForThread: (threadId: string) => string;
  isSenderBatchSummarizeActive: () => boolean;
  getAutoThreadSummaryDoneFor: () => string | null;
  setAutoThreadSummaryDoneFor: (threadId: string | null) => void;
};

let openThreadDeps: OpenThreadDeps | null = null;

export function registerOpenThreadDeps(deps: OpenThreadDeps): void {
  openThreadDeps = deps;
}

async function markOpenedThreadReadIfUnread(threadId: string): Promise<void> {
  if (!openThreadDeps) return;
  if (savedDraftIdFromThreadId(threadId)) return;
  if (!isTauriRuntime()) return;
  const unread = Boolean(state.selectedThread?.unread);
  if (!unread) return;
  const account = currentAccount();
  const accountId = account?.id?.trim();
  if (!accountId) return;
  try {
    const mailbox = openThreadDeps.sourceMailboxForThread(threadId);
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

async function maybeAutoSummarizeThreadOnOpen(
  threadId: string,
  thread: { messages?: Array<{ messageId?: string }> },
): Promise<void> {
  if (!openThreadDeps) return;
  const ai = state.appPrefs.ai as AppPrefsAi & {
    featureAutoThreadSummaryEnabled?: boolean;
    autoThreadSummaryMinMessages?: number;
  };
  if (!ai.featureAutoThreadSummaryEnabled) return;
  if (openThreadDeps.isSenderBatchSummarizeActive()) return;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) return;
  const min = ai.autoThreadSummaryMinMessages ?? 6;
  if ((thread.messages?.length ?? 0) < min) return;
  if (openThreadDeps.getAutoThreadSummaryDoneFor() === threadId) return;
  openThreadDeps.setAutoThreadSummaryDoneFor(threadId);
  await openThreadDeps.summarizeThread();
}

export async function openThread(threadId: string, opts?: OpenThreadOptions): Promise<void> {
  if (!openThreadDeps) return;
  invalidateIdleAiCachePrefetch();
  const savedId = savedDraftIdFromThreadId(threadId);
  if (savedId) {
    await openThreadDeps.openSavedDraftById(savedId);
    return;
  }
  const tid = threadId.trim();
  if (isUnifiedInboxMailbox(state.selectedMailbox)) {
    const row = state.threads.find((t) => String(t.id) === tid);
    const aid = row?.accountId?.trim();
    if (aid && state.accounts.some((a) => a.id === aid) && state.selectedAccountId !== aid) {
      state.selectedAccountId = aid;
    }
  }
  if (!opts?.skipHistory) beginNavigation("thread");
  const prev = state.selectedThreadId;
  const keepAi =
    opts?.preserveAi && openThreadDeps.threadAiSummaryScoped() && threadIdsMatch(state.aiThreadScope, tid);
  if (String(prev) !== String(tid)) {
    state.threadQuickReplyOpen = false;
    state.threadTagsModalOpen = false;
    if (!keepAi) {
      openThreadDeps.clearThreadAiSummaryState();
      state.messageTranslations = {};
      state.messageTranslationBusy = {};
    }
  }
  state.selectedThreadId = tid;
  const opened = await fetchOpenThreadOrNotify(tid);
  if (!opened) {
    if (!opts?.skipHistory) openThreadDeps.navPop();
    state.selectedThread = undefined;
    state.view = "list";
    render();
    return;
  }
  state.selectedThread = opened;
  if (openThreadDeps.threadIsAutoMail(opened, tid)) {
    state.quickReplySuggestions = [];
    if (state.agentSession?.threadId === tid) {
      void openThreadDeps.stopAgentTelemetry();
      state.agentSession = null;
    }
  }
  if (state.aiOutput?.trim() && threadIdsMatch(state.aiThreadScope, tid)) {
    state.aiThreadScope = String(tid);
  }
  await markOpenedThreadReadIfUnread(tid);
  await openThreadDeps.loadNewsletterRules();
  state.view = "thread";
  startThreadActivityOpen(tid);
  if (isTauriRuntime()) void invoke("ai_user_activity_ping").catch(() => {});
  const hyd = state.selectedThread?.messages ?? [];
  if (isTauriRuntime() && hyd.length) void openThreadDeps.hydrateMessageTranslationsFromCacheForThread(hyd);
  for (const m of hyd) openThreadDeps.scheduleSecurityLlmAugment(m);
  void maybeAutoSummarizeThreadOnOpen(tid, opened);
  render();
}
