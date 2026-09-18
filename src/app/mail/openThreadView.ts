import { invoke } from "@tauri-apps/api/core";
import { isUnifiedInboxMailbox, savedDraftIdFromThreadId } from "../../mailboxKinds";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { invalidateIdleAiCachePrefetch } from "./idleAiCachePrefetch";
import { startThreadActivityOpen } from "./threadActivityTracking";
import { beginNavigation } from "./appNavigationStack";
import { render } from "../dispatch";
import { state } from "../state";
import { requireOpenThreadDeps, type OpenThreadOptions } from "./openThreadViewDepsRun";
import {
  markOpenedThreadReadIfUnread,
  maybeAutoSummarizeThreadOnOpen,
} from "./openThreadViewEffectsRun";

export type { OpenThreadOptions, OpenThreadDeps } from "./openThreadViewDepsRun";
export { registerOpenThreadDeps } from "./openThreadViewDepsRun";

export async function openThread(threadId: string, opts?: OpenThreadOptions): Promise<void> {
  const openThreadDeps = requireOpenThreadDeps();
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
  await markOpenedThreadReadIfUnread(tid, openThreadDeps);
  await openThreadDeps.loadNewsletterRules();
  state.view = "thread";
  startThreadActivityOpen(tid);
  if (isTauriRuntime()) void invoke("ai_user_activity_ping").catch(() => {});
  const hyd = state.selectedThread?.messages ?? [];
  if (isTauriRuntime() && hyd.length) void openThreadDeps.hydrateMessageTranslationsFromCacheForThread(hyd);
  for (const m of hyd) openThreadDeps.scheduleSecurityLlmAugment(m);
  void maybeAutoSummarizeThreadOnOpen(tid, opened, openThreadDeps);
  render();
}
