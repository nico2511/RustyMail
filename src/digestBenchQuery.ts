/** Requête du banc d'essai : même barre, même `SearchQuery`, mode lexical forcé. */

import { parseSearchBarDraft, type ParsedSearchBar } from "./searchBarParse";
import type { NewsletterRuleRef } from "./hashAutocomplete";
import { buildSearchQueryPayload, type SearchQueryPayload } from "./searchQueryBuild";
import { applyParsedSearchBarToStructural } from "./app/mail/searchStructuralBarApplyRun";
import type { SearchStructuralState } from "./searchQueryState";
import { resetSearchStructuralState } from "./searchQueryState";
import type { Tag } from "./app/types";

type BenchScratch = SearchStructuralState & { searchTags: Tag[] };

export function buildDigestBenchSearchQuery(opts: {
  draft: string;
  accountId: string;
  newsletterRules: NewsletterRuleRef[];
  archiveRoot?: string;
}): SearchQueryPayload {
  const parsed: ParsedSearchBar = parseSearchBarDraft(opts.draft, opts.newsletterRules);
  const scratch: BenchScratch = {
    search: "",
    searchSenders: [],
    searchTags: [],
    searchMailboxPath: null,
    searchAccountOverrideId: null,
    searchNewsletterRule: null,
    searchScope: "account",
    listFilter: "all",
    searchNlMode: "lexical",
    searchLanguageFilter: null,
    searchRelativeDays: null,
    searchHasAttachment: null,
    searchMinSecurityScore: null,
    searchMailboxPrefix: null,
  };
  resetSearchStructuralState(scratch);
  applyParsedSearchBarToStructural(scratch, parsed);
  const archiveRoot = (opts.archiveRoot ?? "Archive").trim() || "Archive";
  const mailboxPrefixRaw = scratch.searchMailboxPrefix?.trim();
  const mailboxPrefix =
    mailboxPrefixRaw?.toLowerCase() === "archive" ? archiveRoot : mailboxPrefixRaw || null;
  const payload = buildSearchQueryPayload({
    search: scratch.search,
    searchTags: scratch.searchTags,
    searchSenders: scratch.searchSenders,
    searchNlMode: "lexical",
    searchLanguageFilter: null,
    accountId: scratch.searchAccountOverrideId?.trim() || opts.accountId,
    mailbox: mailboxPrefix ? null : scratch.searchMailboxPath,
    semanticSearchEnabled: false,
    semanticModelAvailable: false,
    relativeDays: scratch.searchRelativeDays,
    hasAttachment: scratch.searchHasAttachment,
    minSecurityScore: scratch.searchMinSecurityScore,
    mailboxPrefix,
    hybridLexicalWeight: null,
  });
  payload.mode = "lexical";
  return payload;
}
