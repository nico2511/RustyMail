import { composeChipsHandle } from "./composeRecipientChipsWire";
import { scheduleDraftRevisionSave } from "./composeComposerBridge";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";
import { refreshSearchTagCatalog } from "./searchTagCatalog";
import { searchDraftDiffersFromCommitted } from "./searchCommitQuery";
import { registerSearchAtAutocompleteWireDeps } from "./searchAtAutocompleteWire";
import { registerSearchBarUiDeps } from "./searchBarUi";
import { registerSearchLaunchDeps } from "./searchLaunchQueries";
import { registerSearchViewBatchDeps } from "./searchViewBatch";
import { activeSavedSearchItem, registerSearchViewContextDeps } from "./searchViewContext";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { sourceMailboxForThread } from "./threadListActions";
import { threadsVisibleInList } from "./mailListThreadFilter";

export function registerAppSearchWireUiDeps(): void {
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

  registerSearchAtAutocompleteWireDeps({
    composeChipsHandle,
    scheduleDraftRevisionSave,
  });
}
