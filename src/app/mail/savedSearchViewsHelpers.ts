import { parseSearchBarDraft } from "../../searchBarParse";
import {
  hasSavableSearchCriteria,
  searchCriteriaSnapshotsEqual,
} from "../../searchQueryState";
import type { NewsletterRuleRow } from "../types";
import { formatNewsletterRuleInput } from "../lib/newsletterRuleFormat";
import { state } from "../state";
import {
  applyParsedSearchBarToState,
  draftSearchCriteriaSnapshot,
  resetSearchStructuralModifiers,
  searchDraftDiffersFromCommitted,
} from "./searchCommitQuery";
import { committedSearchCriteriaSnapshot } from "./searchQueryContext";

export function syncCommitSearchDraftForSave(): void {
  if (!searchDraftDiffersFromCommitted()) return;
  const draftSnap = draftSearchCriteriaSnapshot();
  if (!hasSavableSearchCriteria(draftSnap)) return;
  if (searchCriteriaSnapshotsEqual(draftSnap, committedSearchCriteriaSnapshot())) return;
  const raw = state.searchDraft.trim();
  const parsed = parseSearchBarDraft(raw, state.newsletterRules);
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parsed);
  state.search = parsed.text;
  state.searchModifiersTouched = false;
}

export function suggestSavedSearchName(): string {
  if (state.searchTags.length === 1) {
    const t = state.searchTags[0]!;
    return `#${String(t.family).toLowerCase()}:${t.value}`.slice(0, 100);
  }
  if (state.searchSenders.length === 1) return state.searchSenders[0]!.slice(0, 100);
  const q = state.search.trim();
  if (q) return q.slice(0, 100);
  if (state.searchNewsletterRule) return formatNewsletterRuleInput(state.searchNewsletterRule).slice(0, 100);
  return "Ma vue";
}

export function findNewsletterRuleByParts(domain: string, localPart: string | null): NewsletterRuleRow | null {
  const dom = domain.trim().toLowerCase();
  if (!dom) return null;
  const lp = (localPart?.trim() || "*").toLowerCase();
  const hit = state.newsletterRules.find(
    (r) => r.domain.toLowerCase() === dom && (r.localPart ?? "*").toLowerCase() === lp,
  );
  if (hit) return hit;
  return { domain: dom, localPart: lp };
}
