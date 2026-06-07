/** Télémétrie activité locale (100 % on-device) — queue + flush IPC. */

import { invoke } from "@tauri-apps/api/core";

function isTauriRuntime(): boolean {
  return "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
}

export type ActivityEventType =
  | "thread_opened"
  | "thread_closed"
  | "message_sent"
  | "search_committed"
  | "saved_view_created"
  | "saved_view_applied"
  | "saved_view_seen"
  | "bulk_mark_read"
  | "bulk_archive"
  | "affiner_applied"
  | "contact_opened"
  | "suggestion_shown"
  | "suggestion_clicked";

export type ActivityEventPayload = {
  eventType: ActivityEventType;
  threadId?: string | null;
  senderEmail?: string | null;
  mailbox?: string | null;
  durationMs?: number | null;
  metaJson?: string | null;
};

export type SuggestedSavedView = {
  senderEmail: string;
  displayName: string;
  score: number;
  rationaleFr: string;
  suggestedName: string;
  query: {
    text?: string | null;
    senders?: string[];
    sender?: string | null;
    accountId?: string | null;
    mailbox?: string | null;
    mode?: string;
    tags?: unknown[];
  };
};

export type SuggestionDecision = "dismiss" | "snooze" | "accepted";

let queue: ActivityEventPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let boundAccountId: string | null = null;
let recordingEnabled = true;

const FLUSH_MS = 2000;

export function setActivityRecordingEnabled(enabled: boolean): void {
  recordingEnabled = enabled;
  if (!enabled) {
    queue = [];
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
  }
}

export function setActivityAccountId(accountId: string | null): void {
  boundAccountId = accountId?.trim() || null;
}

export function recordActivity(payload: ActivityEventPayload): void {
  if (!isTauriRuntime() || !recordingEnabled || !boundAccountId) return;
  queue.push(payload);
  scheduleFlush();
}

export function recordActivityImmediate(payload: ActivityEventPayload): void {
  if (!isTauriRuntime() || !recordingEnabled || !boundAccountId) return;
  queue.push(payload);
  void flushActivityQueue(true);
}

export function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flushActivityQueue(false);
  }, FLUSH_MS);
}

export async function flushActivityQueue(force = false): Promise<void> {
  if (!isTauriRuntime() || !recordingEnabled || !boundAccountId) {
    queue = [];
    return;
  }
  if (!queue.length) return;
  const batch = queue.splice(0, 64);
  if (!force && queue.length) scheduleFlush();
  try {
    await invoke<number>("record_activity_events_cmd", {
      payload: {
        accountId: boundAccountId,
        events: batch.map((e) => ({
          eventType: e.eventType,
          threadId: e.threadId ?? null,
          senderEmail: e.senderEmail ?? null,
          mailbox: e.mailbox ?? null,
          durationMs: e.durationMs ?? null,
          metaJson: e.metaJson ?? null,
        })),
      },
    });
  } catch (e) {
    console.warn("record_activity_events_cmd", e);
    queue.unshift(...batch);
  }
}

export async function listSuggestedSavedViewsCmd(
  accountId: string,
): Promise<SuggestedSavedView[]> {
  if (!isTauriRuntime()) return [];
  return invoke<SuggestedSavedView[]>("list_suggested_saved_views_cmd", {
    payload: { accountId },
  });
}

export async function dismissViewSuggestionCmd(
  accountId: string,
  senderEmail: string,
  decision: SuggestionDecision,
): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("dismiss_view_suggestion_cmd", {
    payload: { accountId, senderEmail, decision },
  });
}

const suggestionShownKeys = new Set<string>();

export function markSuggestionShownOnce(key: string, record: () => void): void {
  if (suggestionShownKeys.has(key)) return;
  suggestionShownKeys.add(key);
  record();
}

export function clearSuggestionShownKeys(): void {
  suggestionShownKeys.clear();
}
