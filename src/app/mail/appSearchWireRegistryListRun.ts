import { registerBulkTrashListDeps } from "./bulkTrashList";
import {
  loadMailView,
  loadMailboxUnread,
  loadThreadsForSearchContext,
  registerMailListDeps,
} from "./mailListView";
import { threadsVisibleInList } from "./mailListThreadFilter";
import { withLlmQueue } from "./llmJobQueue";
import { registerSearchCommitDeps } from "./searchCommitQuery";
import {
  isSearchActive,
  searchQueryUsesThreadsApi,
  usesSearchContextLoader,
} from "./searchQueryContext";
import { searchThreads } from "./searchThreadsRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { sourceMailboxForThread } from "./threadListActions";

export function registerAppSearchWireListDeps(): void {
  registerMailListDeps({
    isSearchActive,
    searchQueryUsesThreadsApi,
    usesSearchContextLoader,
    searchThreads,
  });

  registerSearchCommitDeps({
    loadMailView,
    loadThreadsForSearchContext,
    threadsVisibleInList,
    clearThreadAiSummaryState,
    withLlmQueue,
  });

  registerBulkTrashListDeps({
    threadsVisibleInList,
    sourceMailboxForThread,
    loadMailboxUnread,
    loadMailView,
  });
}
