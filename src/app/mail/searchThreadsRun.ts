import { filterRecentlyRemovedThreads } from "../../recentlyRemovedThreads";
import { recordSearchHistory } from "../../searchHistory";
import { hasCommittedSearchCriteria } from "../../searchQueryState";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import type { ThreadListItem } from "../types";
import { render } from "../dispatch";
import { safeInvoke } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { loadMailView } from "./mailListView";
import {
  buildSearchQueryFromCurrentState,
  committedSearchCriteriaSnapshot,
  searchAccountIdForQuery,
} from "./searchQueryContext";
import { state } from "../state";
import {
  bumpSearchThreadsGeneration,
  captureSearchInputFocusState,
  getSearchThreadsGeneration,
  restoreSearchInputSelection,
} from "./searchThreadsFocusRun";

export { getSearchThreadsGeneration } from "./searchThreadsFocusRun";

export async function searchThreads(): Promise<void> {
  const gen = bumpSearchThreadsGeneration();
  const { searchHadFocus, selStart, selEnd } = captureSearchInputFocusState();

  if (isTauriRuntime() && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    await loadMailView(false);
    const q = state.search.trim().toLowerCase();
    if (q) {
      state.threads = state.threads.filter((t) => {
        const subj = t.subject.toLowerCase();
        const who = (t.participants[0] ?? "").toLowerCase();
        return subj.includes(q) || who.includes(q);
      });
    }
    if (gen !== getSearchThreadsGeneration()) return;
    render();
    if (!searchHadFocus) return;
    restoreSearchInputSelection(selStart, selEnd, gen);
    return;
  }

  const accountId = searchAccountIdForQuery();
  if (!accountId) {
    state.threads = [];
    if (gen !== getSearchThreadsGeneration()) return;
    render();
    if (!searchHadFocus) return;
    restoreSearchInputSelection(selStart, selEnd, gen);
    return;
  }
  const query = buildSearchQueryFromCurrentState();
  state.threads = filterRecentlyRemovedThreads(
    await safeInvoke<ThreadListItem[]>(
      "search_threads",
      {
        query,
      },
      [],
    ),
  );

  if (gen !== getSearchThreadsGeneration()) {
    return;
  }

  if (isTauriRuntime() && hasCommittedSearchCriteria(committedSearchCriteriaSnapshot())) {
    void recordSearchHistory(
      accountId,
      state.searchDraft.trim() || state.search.trim(),
      JSON.stringify(query),
    ).catch((e) => {
      console.debug("record_search_history_cmd", e);
    });
  }

  render();

  if (!searchHadFocus) return;
  restoreSearchInputSelection(selStart, selEnd, gen);
}
