import { parseSearchBarDraft } from "../../searchBarParse";
import {
  resetSearchStructuralState,
  searchCriteriaSnapshotsEqual,
  snapshotFromStructuralState,
  type SearchCriteriaSnapshot,
  type SearchStructuralState,
} from "../../searchQueryState";
import type { Tag } from "../types";
import { state } from "../state";
import { committedSearchCriteriaSnapshot } from "./searchQueryContext";
import { applyParsedSearchBarToStructural } from "./searchStructuralBarApplyRun";

export function draftSearchCriteriaSnapshot(draft = state.searchDraft): SearchCriteriaSnapshot {
  const scratch: SearchStructuralState & { searchTags: Tag[] } = {
    search: "",
    searchSenders: [],
    searchTags: [],
    searchMailboxPath: null,
    searchAccountOverrideId: null,
    searchNewsletterRule: null,
    searchScope: "account",
    listFilter: "all",
    searchNlMode: null,
    searchLanguageFilter: null,
    searchRelativeDays: null,
    searchHasAttachment: null,
    searchMinSecurityScore: null,
    searchMailboxPrefix: null,
  };
  resetSearchStructuralState(scratch);
  const parsed = parseSearchBarDraft(draft.trim(), state.newsletterRules);
  applyParsedSearchBarToStructural(scratch, parsed);
  return snapshotFromStructuralState(scratch);
}

export function searchDraftDiffersFromCommitted(): boolean {
  return !searchCriteriaSnapshotsEqual(
    draftSearchCriteriaSnapshot(),
    committedSearchCriteriaSnapshot(),
  );
}

export function resetManualSearchNlFilters(): void {
  state.searchNlMode = null;
  state.searchLanguageFilter = null;
}

export function resetSearchStructuralModifiers(): void {
  resetSearchStructuralState(state);
}
