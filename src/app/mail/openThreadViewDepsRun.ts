import type { DiscussionThreadView } from "../types";

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

export function requireOpenThreadDeps(): OpenThreadDeps {
  if (!openThreadDeps) throw new Error("registerOpenThreadDeps not called");
  return openThreadDeps;
}
