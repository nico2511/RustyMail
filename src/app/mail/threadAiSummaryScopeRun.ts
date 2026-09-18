import { threadIdsMatch } from "../lib/threadIdsMatch";
import { state } from "../state";

export function threadAiSummaryLiveFor(threadId: string): boolean {
  const tid = String(threadId).trim();
  return (
    state.view === "thread" &&
    Boolean(tid) &&
    threadIdsMatch(state.selectedThreadId, tid) &&
    threadIdsMatch(state.aiThreadScope, tid)
  );
}

export function applyThreadAiOutputIfLive(threadId: string, text: string): boolean {
  if (!threadAiSummaryLiveFor(threadId)) return false;
  state.aiOutput = text;
  return true;
}

export function threadAiSummaryScoped(): boolean {
  return Boolean(state.aiOutput?.trim() && state.aiThreadScope);
}

export function threadAiSummaryForCurrentThread(): boolean {
  return threadAiSummaryScoped() && threadAiSummaryLiveFor(String(state.aiThreadScope));
}

export function threadAiSummaryShownInZen(): boolean {
  return state.view === "thread" && Boolean(state.selectedThread) && threadAiSummaryForCurrentThread();
}
