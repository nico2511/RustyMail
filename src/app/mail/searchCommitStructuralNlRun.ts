import {
  applyNlSearchQueryToState,
  type SearchStructuralState,
} from "../../searchQueryState";
import type { Tag } from "../types";
import { state } from "../state";
import { canonicalEmailForNlMatch } from "./searchAccountResolve";
import { mergeSearchBarTag } from "./searchCommitStructuralBarRun";

export function applySearchQueryFromNl(sq: {
  text?: string | null;
  sender?: string | null;
  senders?: string[];
  tags?: Tag[];
  mode?: string | null;
  language?: string | null;
  mailbox?: string | null;
  accountId?: string | null;
}): void {
  const applied: SearchStructuralState = {
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
  applyNlSearchQueryToState(
    applied,
    sq,
    (raw) => canonicalEmailForNlMatch(raw) ?? (raw.trim().toLowerCase() || null),
    (id) => state.accounts.some((a) => a.id === id),
  );
  state.search = applied.search;
  state.searchDraft = applied.search;
  state.searchSenders = applied.searchSenders;
  state.searchMailboxPath = applied.searchMailboxPath;
  state.searchAccountOverrideId = applied.searchAccountOverrideId;
  state.searchNewsletterRule = applied.searchNewsletterRule as typeof state.searchNewsletterRule;
  state.searchScope = applied.searchScope;
  state.listFilter = applied.listFilter;
  state.searchNlMode = applied.searchNlMode;
  state.searchLanguageFilter = applied.searchLanguageFilter;
  state.searchRelativeDays = applied.searchRelativeDays;
  state.searchHasAttachment = applied.searchHasAttachment;
  state.searchMinSecurityScore = applied.searchMinSecurityScore;
  state.searchMailboxPrefix = applied.searchMailboxPrefix;
  state.searchTags = [];
  for (const t of applied.searchTags) mergeSearchBarTag(t);
  const aid = sq.accountId?.trim();
  if (aid && state.accounts.some((a) => a.id === aid)) {
    state.selectedAccountId = aid;
  }
  state.searchModifiersTouched = true;
}
