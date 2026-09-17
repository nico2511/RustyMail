import type { SearchViewBatchJob, ThreadListItem } from "../types";
import { SAVED_VIEW_BATCH_MAX } from "../lib/savedViewBatch";
import { render } from "../dispatch";
import { state } from "../state";
import { scheduleStatusBarProgressPaint } from "./statusBarProgressJobs";

export function searchViewBatchJobStatusText(): string {
  const j = state.searchViewBatchJob;
  if (!j) return "";
  const target = j.target.trim() || "dossier";
  if (j.phase === "create") return `Création « ${target} »…`;
  return `Déplacement ${j.done}/${j.total} → ${target}…`;
}

export function setSearchViewBatchJob(job: SearchViewBatchJob | null, renderNow = true): void {
  state.searchViewBatchJob = job;
  if (renderNow) render();
  else scheduleStatusBarProgressPaint();
}

export type SearchViewBatchDeps = {
  threadsVisibleInList: () => ThreadListItem[];
  sourceMailboxForThread: (threadId: string) => string;
  activeSavedSearchItem: () => { name?: string } | undefined;
  refreshMailboxesAfterImapChange: () => Promise<void>;
};

let searchViewBatchDeps: SearchViewBatchDeps | null = null;

export function registerSearchViewBatchDeps(deps: SearchViewBatchDeps): void {
  searchViewBatchDeps = deps;
}

export function requireSearchViewBatchDeps(): SearchViewBatchDeps {
  if (!searchViewBatchDeps) throw new Error("registerSearchViewBatchDeps not called");
  return searchViewBatchDeps;
}

export function searchViewBatchThreads(): ThreadListItem[] {
  return requireSearchViewBatchDeps().threadsVisibleInList().slice(0, SAVED_VIEW_BATCH_MAX);
}
