import { buildSearchQueryPayload } from "../../searchQueryBuild";
import { currentAccount } from "../core/accountContext";
import { state } from "../state";
import { searchMailboxForQuery } from "./searchQueryContextActiveRun";

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
