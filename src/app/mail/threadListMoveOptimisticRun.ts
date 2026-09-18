import { optimisticOrgRemoveThreads } from "../../organizationView";
import {
  clearThreadsRecentlyRemoved,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";
import { render } from "../dispatch";
import { state } from "../state";

export type ThreadListRollback = {
  threads: typeof state.threads;
  selectedThreadId: typeof state.selectedThreadId;
  view: typeof state.view;
  orgReport: typeof state.organization.report;
};

export function optimisticRemoveThreadFromList(threadId: string): ThreadListRollback {
  const prev: ThreadListRollback = {
    threads: state.threads,
    selectedThreadId: state.selectedThreadId,
    view: state.view,
    orgReport: state.organization.report,
  };
  markThreadsRecentlyRemoved([threadId]);
  state.threads = state.threads.filter((t) => t.id !== threadId);
  if (state.view === "thread" && state.selectedThreadId === threadId) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, [threadId]);
  }
  render();
  return prev;
}

export function rollbackThreadListChange(threadId: string, prev: ThreadListRollback): void {
  clearThreadsRecentlyRemoved([threadId]);
  state.threads = prev.threads;
  state.selectedThreadId = prev.selectedThreadId;
  state.view = prev.view;
  state.organization.report = prev.orgReport;
  render();
}
