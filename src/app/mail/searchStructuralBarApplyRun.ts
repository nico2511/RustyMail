import { parseSearchBarDraft } from "../../searchBarParse";
import type { SearchStructuralState } from "../../searchQueryState";
import type { Tag } from "../types";
import { tagFamilyForInvoke } from "../lib/tagFamilyForInvoke";
import { state } from "../state";
import {
  canonicalEmailForNlMatch,
  resolveAccountIdFromRef,
} from "./searchAccountResolve";
import { resolveSearchMailboxPath } from "./searchMailboxResolve";

function mergeSearchBarTagOnTarget(
  target: SearchStructuralState & { searchTags: Tag[] },
  raw: { family: string; value: string },
): void {
  const value = raw.value.trim();
  if (!value) return;
  const family = tagFamilyForInvoke(raw.family);
  const key = `${family}:${value}`.toLowerCase();
  if (target.searchTags.some((t) => `${t.family}:${t.value}`.toLowerCase() === key)) return;
  target.searchTags.push({ family, value });
}

function addSearchSenderOnTarget(target: SearchStructuralState, email: string): void {
  const c = canonicalEmailForNlMatch(email) ?? email.trim().toLowerCase();
  if (!c) return;
  if (!target.searchSenders.some((s) => s.toLowerCase() === c)) target.searchSenders.push(c);
}

export function applyParsedSearchBarToStructural(
  target: SearchStructuralState & { searchTags: Tag[] },
  parsed: ReturnType<typeof parseSearchBarDraft>,
): void {
  target.search = parsed.text;
  if (parsed.scope !== undefined) target.searchScope = parsed.scope;
  if (parsed.mailboxPath !== undefined) {
    const raw = parsed.mailboxPath?.trim() || null;
    target.searchMailboxPath = raw ? resolveSearchMailboxPath(raw) : null;
    if (target.searchMailboxPath) target.searchScope = "mailbox";
  }
  if (parsed.accountRef !== undefined) {
    const id = parsed.accountRef?.trim() ? resolveAccountIdFromRef(parsed.accountRef) : null;
    target.searchAccountOverrideId = id;
    if (id && target === state) {
      state.selectedAccountId = id;
      target.searchScope = "account";
    } else if (id) {
      target.searchScope = "account";
    } else if (!parsed.accountRef?.trim()) {
      target.searchAccountOverrideId = null;
    }
  }
  for (const s of parsed.senders) addSearchSenderOnTarget(target, s);
  for (const t of parsed.tags) mergeSearchBarTagOnTarget(target, t);
  if (parsed.listFilter !== undefined) {
    target.listFilter = parsed.listFilter;
    if (parsed.listFilter === "all") target.searchNewsletterRule = null;
  }
  if (parsed.newsletterRule !== undefined) {
    target.searchNewsletterRule = parsed.newsletterRule;
  }
  if (parsed.relativeDays !== undefined) {
    target.searchRelativeDays =
      parsed.relativeDays > 0 ? Math.floor(parsed.relativeDays) : null;
  }
  if (parsed.hasAttachment !== undefined) {
    target.searchHasAttachment = parsed.hasAttachment;
  }
  if (parsed.minSecurityScore !== undefined) {
    target.searchMinSecurityScore = Number.isFinite(parsed.minSecurityScore)
      ? parsed.minSecurityScore
      : null;
  }
  if (parsed.mailboxPrefix !== undefined) {
    const prefix = parsed.mailboxPrefix?.trim() || null;
    target.searchMailboxPrefix = prefix;
    if (prefix) target.searchScope = "account";
  }
}

export function applyParsedSearchBarToState(parsed: ReturnType<typeof parseSearchBarDraft>): void {
  applyParsedSearchBarToStructural(state, parsed);
}

export function mergeSearchBarTag(raw: { family: string; value: string }): void {
  mergeSearchBarTagOnTarget(state, raw);
}
