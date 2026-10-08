import { filterRecentlyRemovedThreads } from "../../recentlyRemovedThreads";
import { recordSearchHistory } from "../../searchHistory";
import { hasCommittedSearchCriteria } from "../../searchQueryState";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import type { ThreadListItem } from "../types";
import { render } from "../dispatch";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
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

const SEARCH_PAGE = 200;

export async function searchThreads(opts?: { append?: boolean }): Promise<void> {
  const append = opts?.append === true;
  const gen = bumpSearchThreadsGeneration();
  const { searchHadFocus, selStart, selEnd } = captureSearchInputFocusState();

  if (isTauriRuntime() && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    await loadMailView(false);
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
  if (!append) state.searchResultOffset = 0;
  const query = {
    ...buildSearchQueryFromCurrentState(),
    offset: append ? state.searchResultOffset : 0,
    limit: SEARCH_PAGE,
  };
  let rows: ThreadListItem[] = [];
  if (!isTauriRuntime()) {
    state.mailListError = "";
    state.searchHasMore = false;
    if (!append) state.threads = [];
  } else {
    try {
      rows = await withTimeout(
        invoke<ThreadListItem[]>("search_threads", { query }),
        DEFAULT_INVOKE_TIMEOUT_MS,
      );
      state.mailListError = "";
    } catch (error) {
      state.mailListError = tauriErrorMessage(error);
      state.searchHasMore = false;
      if (!append) state.threads = [];
      if (gen !== getSearchThreadsGeneration()) return;
      render();
      if (!searchHadFocus) return;
      restoreSearchInputSelection(selStart, selEnd, gen);
      return;
    }
  }
  const visible = filterRecentlyRemovedThreads(rows);
  state.threads = append ? [...state.threads, ...visible] : visible;
  state.searchHasMore = rows.length >= SEARCH_PAGE;
  state.searchResultOffset = (append ? state.searchResultOffset : 0) + rows.length;

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
