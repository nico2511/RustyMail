import type { SearchCriteriaSnapshot } from "../../searchQueryState";
import { filterRecentlyRemovedThreads } from "../../recentlyRemovedThreads";
import { recordSearchHistory } from "../../searchHistory";
import { hasCommittedSearchCriteria } from "../../searchQueryState";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import type { ThreadListItem } from "../types";
import { render } from "../dispatch";
import { safeInvoke } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { loadMailView } from "./mailListView";
import { buildSearchQueryFromCurrentState, searchAccountIdForQuery } from "./searchQueryContext";
import { state } from "../state";

let searchThreadsGeneration = 0;

export function getSearchThreadsGeneration(): number {
  return searchThreadsGeneration;
}

export type SearchThreadsRunDeps = {
  committedSearchCriteriaSnapshot: () => SearchCriteriaSnapshot;
};

let searchRunDeps: SearchThreadsRunDeps | null = null;

export function registerSearchThreadsRunDeps(deps: SearchThreadsRunDeps): void {
  searchRunDeps = deps;
}

function restoreSearchInputSelection(selStart: number, selEnd: number, genAtCapture: number) {
  const apply = () => {
    if (genAtCapture !== searchThreadsGeneration) return;
    const inp = document.querySelector<HTMLInputElement>("#search-input");
    if (!inp) return;
    inp.focus();
    const len = inp.value.length;
    try {
      inp.setSelectionRange(Math.min(selStart, len), Math.min(selEnd, len));
    } catch {
      /* type=search */
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

export async function searchThreads(): Promise<void> {
  const gen = ++searchThreadsGeneration;

  const inputBefore = document.querySelector<HTMLInputElement>("#search-input");
  const searchHadFocus = document.activeElement === inputBefore;
  let selStart = state.searchDraft.length;
  let selEnd = selStart;
  if (searchHadFocus && inputBefore) {
    try {
      const a = inputBefore.selectionStart;
      const b = inputBefore.selectionEnd;
      if (typeof a === "number" && a >= 0) selStart = a;
      if (typeof b === "number" && b >= 0) selEnd = b;
    } catch {
      /* Safari / certains navigateurs avec type=search */
    }
  }

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
    if (gen !== searchThreadsGeneration) return;
    render();
    if (!searchHadFocus) return;
    restoreSearchInputSelection(selStart, selEnd, gen);
    return;
  }

  const accountId = searchAccountIdForQuery();
  if (!accountId) {
    state.threads = [];
    if (gen !== searchThreadsGeneration) return;
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

  if (gen !== searchThreadsGeneration) {
    return;
  }

  if (isTauriRuntime() && searchRunDeps && hasCommittedSearchCriteria(searchRunDeps.committedSearchCriteriaSnapshot())) {
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
