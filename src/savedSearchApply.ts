/** Application d’une vue enregistrée vers l’état barre de recherche. */

import type { SearchQueryPayload } from "./searchQueryBuild";
import type { SavedSearch, SavedSearchUiState, SavedSearchUpsert } from "./savedSearches";
import type { ListFilter, SearchStructuralState } from "./searchQueryState";
import { resetSearchStructuralState } from "./searchQueryState";

export type NewsletterRuleLike = {
  domain: string;
  localPart?: string | null;
};

export function buildSavedSearchUiState(s: {
  listFilter: ListFilter;
  searchScope: "account" | "mailbox";
  searchNlMode: "lexical" | "semantic" | "hybrid" | null;
  searchDraft: string;
  searchNewsletterRule: NewsletterRuleLike | null;
  searchModifiersTouched: boolean;
}): SavedSearchUiState {
  const rule = s.searchNewsletterRule;
  return {
    listFilter: s.listFilter === "all" ? null : s.listFilter,
    searchScope: s.searchScope,
    searchNlMode: s.searchNlMode,
    searchDraft: s.searchDraft.trim() || null,
    newsletterDomain: rule?.domain ?? null,
    newsletterLocalPart: rule?.localPart ?? null,
    searchModifiersTouched: s.searchModifiersTouched,
  };
}

function normalizeTagFamily(raw: string): "Source" | "Kind" | "State" | "Entity" {
  const f = raw.trim().toLowerCase();
  if (f === "source") return "Source";
  if (f === "kind") return "Kind";
  if (f === "state") return "State";
  return "Entity";
}

function parseNlMode(raw: string | null | undefined): "lexical" | "semantic" | "hybrid" | null {
  const m = (raw ?? "").trim().toLowerCase();
  if (m === "lexical" || m === "semantic" || m === "hybrid") return m;
  return null;
}

function parseListFilter(raw: string | null | undefined): ListFilter {
  const f = (raw ?? "").trim().toLowerCase();
  if (f === "unread" || f === "starred" || f === "focused" || f === "auto") return f;
  return "all";
}

export function applySavedSearchToState(
  saved: SavedSearch,
  state: SearchStructuralState & {
    searchDraft: string;
    searchModifiersTouched: boolean;
    searchNewsletterRule: NewsletterRuleLike | null;
  },
  opts: {
    findNewsletterRule: (domain: string, localPart: string | null) => NewsletterRuleLike | null;
    resolveMailboxPath: (raw: string) => string | null;
  },
): void {
  resetSearchStructuralState(state);
  const q = saved.query;
  const ui = saved.uiState ?? {};

  state.search = (q.text ?? "").trim();
  state.searchDraft = (ui.searchDraft ?? state.search).trim();
  state.searchSenders = [...(q.senders ?? [])];
  if (!state.searchSenders.length && q.sender?.trim()) {
    state.searchSenders = [q.sender.trim()];
  }
  state.searchTags = (q.tags ?? []).map((t) => ({
    family: normalizeTagFamily(String(t.family)),
    value: t.value.trim(),
  }));

  const mb = q.mailbox?.trim();
  state.searchMailboxPath = mb ? opts.resolveMailboxPath(mb) : null;
  const acc = q.accountId?.trim();
  state.searchAccountOverrideId = acc || null;

  state.searchScope = ui.searchScope === "mailbox" ? "mailbox" : "account";
  if (state.searchMailboxPath) state.searchScope = "mailbox";

  state.listFilter = parseListFilter(ui.listFilter);
  state.searchNlMode = parseNlMode(ui.searchNlMode ?? q.mode);
  state.searchLanguageFilter = q.language?.trim() || null;
  state.searchModifiersTouched = Boolean(ui.searchModifiersTouched);

  state.searchRelativeDays =
    q.relativeDays != null && Number.isFinite(q.relativeDays) && q.relativeDays > 0
      ? Math.floor(q.relativeDays)
      : null;
  state.searchHasAttachment =
    q.hasAttachment === true || q.hasAttachment === false ? q.hasAttachment : null;
  state.searchMinSecurityScore =
    q.minSecurityScore != null && Number.isFinite(q.minSecurityScore)
      ? q.minSecurityScore
      : null;
  const prefix = q.mailboxPrefix?.trim();
  state.searchMailboxPrefix = prefix || null;
  if (prefix) state.searchScope = "account";

  const dom = ui.newsletterDomain?.trim();
  if (dom) {
    const lp = ui.newsletterLocalPart?.trim() || "*";
    state.searchNewsletterRule = opts.findNewsletterRule(dom, lp === "*" ? null : lp);
  }
}

export function buildSavedSearchUpsert(
  accountId: string,
  name: string,
  query: SearchQueryPayload,
  ui: SavedSearchUiState,
  opts?: { id?: string; pinned?: boolean; sortOrder?: number; icon?: string | null; shortcut?: string | null },
): SavedSearchUpsert {
  return {
    id: opts?.id ?? null,
    accountId,
    name: name.trim(),
    query,
    uiState: ui,
    pinned: opts?.pinned ?? true,
    sortOrder: opts?.sortOrder ?? null,
    icon: opts?.icon?.trim() || null,
    shortcut: opts?.shortcut?.trim() || null,
  };
}
