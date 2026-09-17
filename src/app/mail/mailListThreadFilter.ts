import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import type { NewsletterRuleRow, ThreadListItem } from "../types";
import { state } from "../state";
import { isSearchActive } from "./searchQueryContext";
import { firstMatchingNewsletterRule } from "./newsletterRulesMatch";

export function threadMatchesNewsletterRule(thread: ThreadListItem, rule: NewsletterRuleRow): boolean {
  for (const p of thread.participants) {
    const matched = firstMatchingNewsletterRule(p);
    if (!matched) continue;
    if (
      matched.domain.toLowerCase() === rule.domain.toLowerCase() &&
      matched.localPart.toLowerCase() === (rule.localPart ?? "*").toLowerCase()
    ) {
      return true;
    }
  }
  return false;
}

export function threadListFollowed(thread: ThreadListItem): boolean {
  return Boolean(thread.followed);
}

export function threadsVisibleInList(): ThreadListItem[] {
  let base = state.threads;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) return base;
  if (state.searchNewsletterRule) {
    const rule = state.searchNewsletterRule;
    base = base.filter((t) => threadMatchesNewsletterRule(t, rule));
  }
  if (isSearchActive()) return base;
  if (state.listFilter === "unread") return base.filter((t) => t.unread);
  if (state.listFilter === "starred") return base.filter((t) => threadListFollowed(t));
  if (state.listFilter === "focused") return base.filter((t) => !t.isNewsletterThread);
  if (state.listFilter === "auto") return base.filter((t) => Boolean(t.isNewsletterThread));
  return base;
}
