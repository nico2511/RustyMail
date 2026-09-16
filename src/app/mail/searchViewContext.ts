import { isAiFeatureEnabled } from "../../aiFeatures";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { hasCommittedSearchCriteria } from "../../searchQueryState";
import type { SavedSearchListItem } from "../../savedSearches";
import type { ThreadListItem } from "../types";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import { draftSearchCriteriaSnapshot } from "./searchCommitQuery";
import {
  committedSearchCriteriaSnapshot,
  folderManagerBrowsingPanel,
  searchAccountIdForQuery,
  searchMailboxForQuery,
} from "./searchQueryContext";

export type SearchViewContextDeps = {
  threadsVisibleInList: () => ThreadListItem[];
};

let searchViewContextDeps: SearchViewContextDeps | null = null;

export function registerSearchViewContextDeps(deps: SearchViewContextDeps): void {
  searchViewContextDeps = deps;
}

function viewContextDeps(): SearchViewContextDeps {
  if (!searchViewContextDeps) throw new Error("registerSearchViewContextDeps not called");
  return searchViewContextDeps;
}

export function canSaveSearchView(): boolean {
  if (!isTauriRuntime() || !searchAccountIdForQuery()) return false;
  if (state.activeSavedSearchId) return true;
  return hasCommittedSearchCriteria(committedSearchCriteriaSnapshot());
}

export function canSaveSearchViewInModal(): boolean {
  if (!isTauriRuntime() || !searchAccountIdForQuery()) return false;
  if (canSaveSearchView()) return true;
  return hasCommittedSearchCriteria(draftSearchCriteriaSnapshot());
}

export function inboxSearchContextActive(): boolean {
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) return false;
  if (state.view === "folderManager" && folderManagerBrowsingPanel()) return false;
  if (state.activeSavedSearchId) return true;
  return hasCommittedSearchCriteria(committedSearchCriteriaSnapshot());
}

export function activeSavedSearchItem(): SavedSearchListItem | undefined {
  const id = state.activeSavedSearchId;
  if (!id) return undefined;
  return state.savedSearches.find((s) => s.id === id);
}

export function searchViewTargetsInbox(): boolean {
  const mb = (searchMailboxForQuery() ?? state.selectedMailbox ?? "INBOX").trim();
  const u = mb.toUpperCase();
  return u === "INBOX" || u.endsWith(".INBOX");
}

export function searchViewCanOpenOrganizer(): boolean {
  return (
    inboxSearchContextActive() &&
    searchViewTargetsInbox() &&
    viewContextDeps().threadsVisibleInList().length >= 15
  );
}

export function searchViewCanAffinerFlux(): boolean {
  return (
    isTauriRuntime() &&
    inboxSearchContextActive() &&
    isAiFeatureEnabled(state.appPrefs.ai, "featureOrgProposalsEnabled") &&
    viewContextDeps().threadsVisibleInList().length >= 5
  );
}
