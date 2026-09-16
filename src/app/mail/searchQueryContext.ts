import { buildSearchQueryPayload } from "../../searchQueryBuild";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { folderManagerPanelMailbox } from "./mailboxPanelContext";
import { state } from "../state";

let effectiveSearchMailboxPathImpl: () => string | null = () => null;

export function registerSearchQueryContext(deps: { effectiveSearchMailboxPath: () => string | null }): void {
  effectiveSearchMailboxPathImpl = deps.effectiveSearchMailboxPath;
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
  const explicit = effectiveSearchMailboxPathImpl();
  if (explicit) return explicit;
  if (state.searchScope === "mailbox") {
    const m = (folderManagerPanelMailbox() ?? state.selectedMailbox)?.trim();
    return m && !isSavedDraftsVirtualMailbox(m) ? m : "INBOX";
  }
  return null;
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
