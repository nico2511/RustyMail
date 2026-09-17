import {
  recordActivity,
  setActivityAccountId,
  setActivityRecordingEnabled,
} from "../../activity";
import { currentAccount } from "../core/accountContext";
import { state } from "../state";

let threadActivityOpen: {
  threadId: string;
  startedAt: number;
  sender?: string;
  mailbox?: string;
} | null = null;

export function activityTrackingEnabled(): boolean {
  return state.appPrefs.general.activitySuggestionsEnabled !== false;
}

export function syncActivityRecordingPrefs(): void {
  const acc = currentAccount()?.id?.trim() ?? null;
  setActivityAccountId(acc);
  setActivityRecordingEnabled(activityTrackingEnabled() && Boolean(acc));
}

export function flushThreadActivityClosed(): void {
  if (!threadActivityOpen || !activityTrackingEnabled()) {
    threadActivityOpen = null;
    return;
  }
  const durationMs = Math.max(0, Date.now() - threadActivityOpen.startedAt);
  recordActivity({
    eventType: "thread_closed",
    threadId: threadActivityOpen.threadId,
    senderEmail: threadActivityOpen.sender ?? null,
    mailbox: threadActivityOpen.mailbox ?? null,
    durationMs,
  });
  threadActivityOpen = null;
}

export function startThreadActivityOpen(threadId: string): void {
  if (!activityTrackingEnabled()) return;
  flushThreadActivityClosed();
  const row = state.threads.find((t) => String(t.id) === String(threadId));
  const sender = row?.participants[0]?.trim() || "";
  threadActivityOpen = {
    threadId: String(threadId),
    startedAt: Date.now(),
    sender: sender || undefined,
    mailbox: row?.mailbox,
  };
  recordActivity({
    eventType: "thread_opened",
    threadId: String(threadId),
    senderEmail: sender || null,
    mailbox: row?.mailbox ?? null,
  });
}

export function recordSearchCommittedActivity(): void {
  if (!activityTrackingEnabled()) return;
  recordActivity({
    eventType: "search_committed",
    senderEmail: state.searchSenders[0] ?? null,
    metaJson: JSON.stringify({
      text: state.search.trim().slice(0, 120),
      senders: state.searchSenders,
    }),
  });
}
