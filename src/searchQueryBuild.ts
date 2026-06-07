/** Construction du payload `SearchQuery` pour IPC (aligné sur `searchThreads`). */

export type SearchTag = {
  family: "Source" | "Kind" | "State" | "Entity";
  value: string;
};

export type SearchQueryPayload = {
  text: string | null;
  tags: SearchTag[];
  senders: string[];
  sender: string | null;
  accountId: string | null;
  mailbox: string | null;
  mode: "lexical" | "semantic" | "hybrid";
  language: string | null;
};

export type SearchQueryBuildOpts = {
  search: string;
  searchTags: SearchTag[];
  searchSenders: string[];
  searchNlMode: "lexical" | "semantic" | "hybrid" | null;
  searchLanguageFilter: string | null;
  accountId: string;
  mailbox: string | null;
  semanticSearchEnabled: boolean;
  semanticModelAvailable: boolean;
};

export function buildSearchQueryPayload(opts: SearchQueryBuildOpts): SearchQueryPayload {
  const useSemantic = Boolean(opts.accountId) && opts.semanticSearchEnabled && opts.semanticModelAvailable;
  let mode: "lexical" | "semantic" | "hybrid" = useSemantic ? "hybrid" : "lexical";
  if (opts.searchNlMode) {
    if (opts.searchNlMode === "semantic" && !useSemantic) {
      mode = "lexical";
    } else {
      mode = opts.searchNlMode;
    }
  }
  return {
    text: opts.search.trim() || null,
    tags: opts.searchTags,
    senders: opts.searchSenders,
    sender: opts.searchSenders[0] ?? null,
    accountId: opts.accountId || null,
    mailbox: opts.mailbox,
    mode,
    language: opts.searchLanguageFilter?.trim() || null,
  };
}
