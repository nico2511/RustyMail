/** Search + list loader wire deps — extracted from appModuleRegistry.ts */
import { composeChipsHandle } from "./composeRecipientChipsWire";
import { scheduleDraftRevisionSave } from "./composeComposerBridge";
import { registerBulkTrashListDeps } from "./bulkTrashList";
import {
  loadMailView,
  loadMailboxUnread,
  loadThreadsForSearchContext,
  registerMailListDeps,
} from "./mailListView";
import { threadsVisibleInList } from "./mailListThreadFilter";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";
import { withLlmQueue } from "./llmJobQueue";
import { refreshSearchTagCatalog } from "./searchTagCatalog";
import { registerSearchCommitDeps, searchDraftDiffersFromCommitted } from "./searchCommitQuery";
import {
  isSearchActive,
  searchQueryUsesThreadsApi,
  usesSearchContextLoader,
} from "./searchQueryContext";
import { registerSearchAtAutocompleteWireDeps } from "./searchAtAutocompleteWire";
import { registerSearchBarUiDeps } from "./searchBarUi";
import { registerSearchLaunchDeps } from "./searchLaunchQueries";
import { registerSearchViewBatchDeps } from "./searchViewBatch";
import { activeSavedSearchItem, registerSearchViewContextDeps } from "./searchViewContext";
import { searchThreads } from "./searchThreadsRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { sourceMailboxForThread } from "./threadListActions";

export function registerAppSearchWireDeps(): void {
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

  registerSearchBarUiDeps({
    refreshSearchTagCatalog,
    searchDraftDiffersFromCommitted,
  });

  registerSearchViewContextDeps({
    threadsVisibleInList,
  });

  registerSearchViewBatchDeps({
    threadsVisibleInList,
    sourceMailboxForThread,
    activeSavedSearchItem,
    refreshMailboxesAfterImapChange,
  });

  registerSearchLaunchDeps({
    clearThreadAiSummaryState,
    refreshSearchTagCatalog,
  });

  registerBulkTrashListDeps({
    threadsVisibleInList,
    sourceMailboxForThread,
    loadMailboxUnread,
    loadMailView,
  });

  registerSearchAtAutocompleteWireDeps({
    composeChipsHandle,
    scheduleDraftRevisionSave,
  });
}
