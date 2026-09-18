import { optimisticOrgRemoveThreads } from "../../organizationView";
import { clearThreadsRecentlyRemoved, markThreadsRecentlyRemoved } from "../../recentlyRemovedThreads";
import { render } from "../dispatch";
import { state } from "../state";
import type { ThreadListItem } from "../types";

export type BulkTrashOptimisticSnapshot = {
  threads: ThreadListItem[];
  selectedThreadId: string | undefined;
  view: typeof state.view;
  organizationReport: typeof state.organization.report;
};

export function applyBulkTrashOptimistic(ids: string[]): BulkTrashOptimisticSnapshot {
  const snap: BulkTrashOptimisticSnapshot = {
    threads: state.threads,
    selectedThreadId: state.selectedThreadId,
    view: state.view,
    organizationReport: state.organization.report,
  };
  markThreadsRecentlyRemoved(ids);
  state.threads = state.threads.filter((t) => !ids.includes(String(t.id)));
  if (state.view === "thread" && state.selectedThreadId && ids.includes(String(state.selectedThreadId))) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, ids);
  }
  render();
  return snap;
}

export function rollbackBulkTrashOptimistic(snap: BulkTrashOptimisticSnapshot, ids: string[]): void {
  clearThreadsRecentlyRemoved(ids);
  state.threads = snap.threads;
  state.selectedThreadId = snap.selectedThreadId;
  state.view = snap.view;
  state.organization.report = snap.organizationReport;
  render();
}
