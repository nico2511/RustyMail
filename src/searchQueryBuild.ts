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
  mailboxPrefix?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  relativeDays?: number | null;
  hasAttachment?: boolean | null;
  minSecurityScore?: number | null;
  hybridLexicalWeight?: number | null;
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
  /** `#last:Nd` */
  relativeDays?: number | null;
  /** `#pj` / `has:attachment` */
  hasAttachment?: boolean | null;
  /** `#security:N` */
  minSecurityScore?: number | null;
  /** Préfixe boîte (`#archive` → `Archive`) */
  mailboxPrefix?: string | null;
  /** Prefs `hybridLexicalWeight` (0–1) si mode hybride */
  hybridLexicalWeight?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
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

  const mailboxPrefix = opts.mailboxPrefix?.trim() || null;
  const relativeDays =
    opts.relativeDays != null && Number.isFinite(opts.relativeDays) && opts.relativeDays > 0
      ? Math.floor(opts.relativeDays)
      : null;
  const minSecurityScore =
    opts.minSecurityScore != null && Number.isFinite(opts.minSecurityScore)
      ? opts.minSecurityScore
      : null;
  const hybridLexicalWeight =
    mode === "hybrid" &&
    opts.hybridLexicalWeight != null &&
    Number.isFinite(opts.hybridLexicalWeight)
      ? Math.min(1, Math.max(0, opts.hybridLexicalWeight))
      : null;

  const payload: SearchQueryPayload = {
    text: opts.search.trim() || null,
    tags: opts.searchTags,
    senders: opts.searchSenders,
    sender: opts.searchSenders[0] ?? null,
    accountId: opts.accountId || null,
    mailbox: mailboxPrefix ? null : opts.mailbox,
    mode,
    language: opts.searchLanguageFilter?.trim() || null,
  };

  if (mailboxPrefix) payload.mailboxPrefix = mailboxPrefix;
  if (opts.dateFrom?.trim()) payload.dateFrom = opts.dateFrom.trim();
  if (opts.dateTo?.trim()) payload.dateTo = opts.dateTo.trim();
  if (relativeDays != null) payload.relativeDays = relativeDays;
  if (opts.hasAttachment === true || opts.hasAttachment === false) {
    payload.hasAttachment = opts.hasAttachment;
  }
  if (minSecurityScore != null) payload.minSecurityScore = minSecurityScore;
  if (hybridLexicalWeight != null) payload.hybridLexicalWeight = hybridLexicalWeight;

  return payload;
}
