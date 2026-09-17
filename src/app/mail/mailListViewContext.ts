import { mergeServerThreadPage } from "../../mailListPage";
import type { ThreadListItem } from "../types";
import { state } from "../state";

export type MailListDeps = {
  isSearchActive: () => boolean;
  searchQueryUsesThreadsApi: () => boolean;
  usesSearchContextLoader: () => boolean;
  searchThreads: () => Promise<void>;
};

let mailListDeps: MailListDeps = {
  isSearchActive: () => false,
  searchQueryUsesThreadsApi: () => false,
  usesSearchContextLoader: () => false,
  searchThreads: async () => {},
};

export function registerMailListDeps(next: Partial<MailListDeps>): void {
  mailListDeps = { ...mailListDeps, ...next };
}

export function requireMailListDeps(): MailListDeps {
  return mailListDeps;
}

export function applyServerThreadPage(page: ThreadListItem[], append: boolean): void {
  const { threads, threadOffsetReset } = mergeServerThreadPage(state.threads, page, append);
  state.threads = threads;
  if (threadOffsetReset) state.threadOffset = 0;
}

export function syncSelectionAfterThreadPage(pageLength: number): void {
  state.threadOffset = state.threads.length;
  state.hasMoreThreads = pageLength >= state.threadPageSize;
  if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
  }
}
