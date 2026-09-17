import { buildSearchQueryPayload } from "../../searchQueryBuild";
import { parseSearchBarDraft } from "../../searchBarParse";
import {
  hasCommittedSearchCriteria,
  snapshotFromStructuralState,
  type SearchCriteriaSnapshot,
} from "../../searchQueryState";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { folderManagerPanelMailbox, listMailboxForPanel } from "./mailboxPanelContext";
import { resolveSearchMailboxPath } from "./searchMailboxResolve";
import { state } from "../state";

export function folderManagerBrowsingPanel(): boolean {
  return Boolean(folderManagerPanelMailbox()) && !isSearchActive();
}

export function effectiveSearchMailboxPath(): string | null {
  const parsed = parseSearchBarDraft(state.searchDraft, state.newsletterRules);
  const fromDraft = parsed.mailboxPath?.trim();
  if (fromDraft && !isSavedDraftsVirtualMailbox(fromDraft)) {
    return resolveSearchMailboxPath(fromDraft);
  }
  const committed = state.searchMailboxPath?.trim();
  if (committed && !isSavedDraftsVirtualMailbox(committed)) return committed;
  return null;
}

export function committedSearchCriteriaSnapshot(): SearchCriteriaSnapshot {
  return snapshotFromStructuralState(state);
}

export function isSearchActive(): boolean {
  if (state.view === "folderManager" && folderManagerPanelMailbox()) return false;
  if (state.activeSavedSearchId) return true;
  return hasCommittedSearchCriteria(committedSearchCriteriaSnapshot());
}

export function searchQueryUsesThreadsApi(): boolean {
  return Boolean(
    state.search.trim() ||
      state.searchSenders.length > 0 ||
      state.searchTags.length > 0 ||
      state.searchLanguageFilter?.trim() ||
      state.searchRelativeDays != null ||
      state.searchHasAttachment != null ||
      state.searchMinSecurityScore != null ||
      state.searchMailboxPrefix?.trim(),
  );
}

export function searchAccountIdForQuery(): string {
  return (
    state.searchAccountOverrideId?.trim() ||
    state.selectedAccountId?.trim() ||
    currentAccount()?.id?.trim() ||
    ""
  );
}

export function searchMailboxForQuery(): string | null {
  const explicit = effectiveSearchMailboxPath();
  if (explicit) return explicit;
  if (state.searchScope === "mailbox") {
    const m = (folderManagerPanelMailbox() ?? state.selectedMailbox)?.trim();
    return m && !isSavedDraftsVirtualMailbox(m) ? m : "INBOX";
  }
  return null;
}

export function searchQueryMailboxForList(): string {
  const explicit = searchMailboxForQuery();
  if (explicit) return explicit;
  const panelMb = folderManagerPanelMailbox();
  if (panelMb) return panelMb;
  return state.selectedMailbox?.trim() || "INBOX";
}

export function usesSearchContextLoader(): boolean {
  if (state.view === "folderManager" && folderManagerBrowsingPanel()) return false;
  if (isSavedDraftsVirtualMailbox(listMailboxForPanel())) return false;
  if (isSearchActive()) return true;
  return (
    state.searchScope === "account" &&
    (state.listFilter !== "all" || state.searchNewsletterRule !== null)
  );
}

export function buildSearchQueryFromCurrentState() {
  const archiveRoot = (state.appPrefs.general.archiveRoot ?? "Archive").trim() || "Archive";
  const mailboxPrefixRaw = state.searchMailboxPrefix?.trim();
  const mailboxPrefix =
    mailboxPrefixRaw?.toLowerCase() === "archive" ? archiveRoot : mailboxPrefixRaw || null;
  return buildSearchQueryPayload({
    search: state.search,
    searchTags: state.searchTags,
    searchSenders: state.searchSenders,
    searchNlMode: state.searchNlMode,
    searchLanguageFilter: state.searchLanguageFilter,
    accountId: searchAccountIdForQuery(),
    mailbox: searchMailboxForQuery(),
    semanticSearchEnabled: state.appPrefs.ai.semanticSearchEnabled,
    semanticModelAvailable: state.semanticModelAvailable,
    relativeDays: state.searchRelativeDays,
    hasAttachment: state.searchHasAttachment,
    minSecurityScore: state.searchMinSecurityScore,
    mailboxPrefix,
    hybridLexicalWeight: state.appPrefs.general.hybridLexicalWeight ?? null,
  });
}
