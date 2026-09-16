import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { threadMailboxListLabel } from "../../mailboxKinds";
import { parseSearchBarDraft } from "../../searchBarParse";
import {
  applyNlSearchQueryToState,
  extractNlSearchFallbackText,
  parsedSearchBarHasModifiers,
  resetSearchStructuralState,
  type SearchStructuralState,
} from "../../searchQueryState";
import type { Tag, ThreadListItem } from "../types";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { formatNewsletterRuleInput } from "../lib/newsletterRuleFormat";
import { withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { searchThreads } from "./searchThreadsRun";

export type SearchCommitDeps = {
  loadMailView: (append: boolean) => Promise<void>;
  loadThreadsForSearchContext: (append?: boolean) => Promise<void>;
  isSearchActive: () => boolean;
  searchQueryUsesThreadsApi: () => boolean;
  threadsVisibleInList: () => ThreadListItem[];
  searchMailboxForQuery: () => string | null;
  effectiveSearchMailboxPath: () => string | null | undefined;
  clearThreadAiSummaryState: () => void;
  withLlmQueue: <T>(label: string, fn: (signal: AbortSignal) => Promise<T>) => Promise<T | null>;
  recordSearchCommittedActivity: () => void;
  resolveSearchMailboxPath: (requested: string) => string | null;
  resolveAccountIdFromRef: (ref: string) => string | null;
  tagFamilyForInvoke: (family: string) => Tag["family"];
  canonicalEmailForNlMatch: (raw: string) => string | null;
};

let searchCommitDeps: SearchCommitDeps | null = null;

export function registerSearchCommitDeps(deps: SearchCommitDeps): void {
  searchCommitDeps = deps;
}

function deps(): SearchCommitDeps {
  if (!searchCommitDeps) throw new Error("registerSearchCommitDeps not called");
  return searchCommitDeps;
}

function mergeSearchBarTagOnTarget(
  target: SearchStructuralState & { searchTags: Tag[] },
  raw: { family: string; value: string },
): void {
  const d = deps();
  const value = raw.value.trim();
  if (!value) return;
  const family = d.tagFamilyForInvoke(raw.family);
  const key = `${family}:${value}`.toLowerCase();
  if (target.searchTags.some((t) => `${t.family}:${t.value}`.toLowerCase() === key)) return;
  target.searchTags.push({ family, value });
}

function addSearchSenderOnTarget(target: SearchStructuralState, email: string): void {
  const c = deps().canonicalEmailForNlMatch(email) ?? email.trim().toLowerCase();
  if (!c) return;
  if (!target.searchSenders.some((s) => s.toLowerCase() === c)) target.searchSenders.push(c);
}

export function applyParsedSearchBarToStructural(
  target: SearchStructuralState & { searchTags: Tag[] },
  parsed: ReturnType<typeof parseSearchBarDraft>,
): void {
  const d = deps();
  target.search = parsed.text;
  if (parsed.scope !== undefined) target.searchScope = parsed.scope;
  if (parsed.mailboxPath !== undefined) {
    const raw = parsed.mailboxPath?.trim() || null;
    target.searchMailboxPath = raw ? d.resolveSearchMailboxPath(raw) : null;
    if (target.searchMailboxPath) target.searchScope = "mailbox";
  }
  if (parsed.accountRef !== undefined) {
    const id = parsed.accountRef?.trim() ? d.resolveAccountIdFromRef(parsed.accountRef) : null;
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

function activeSearchInputElement(): HTMLInputElement | null {
  if (state.searchModalOpen) {
    return document.querySelector<HTMLInputElement>("#search-modal-input");
  }
  return document.querySelector<HTMLInputElement>("#search-input");
}

export function hasSearchBarCriteria(): boolean {
  return Boolean(
    state.search.trim() ||
      state.searchSenders.length > 0 ||
      state.searchMailboxPath?.trim() ||
      state.searchAccountOverrideId?.trim() ||
      state.searchTags.length > 0 ||
      state.searchNewsletterRule ||
      state.searchLanguageFilter?.trim() ||
      state.listFilter !== "all" ||
      state.searchModifiersTouched ||
      state.searchRelativeDays != null ||
      state.searchHasAttachment != null ||
      state.searchMinSecurityScore != null ||
      state.searchMailboxPrefix?.trim(),
  );
}

export function toastSearchBarResult(): void {
  const d = deps();
  const n = d.threadsVisibleInList().length;
  const mbTarget = d.searchMailboxForQuery();
  const scope =
    state.searchScope === "account" && !mbTarget
      ? " · tout le compte"
      : ` · ${threadMailboxListLabel(mbTarget ?? (state.selectedMailbox || "INBOX")).full}`;
  const parts: string[] = [];
  if (state.searchSenders.length) parts.push(`de: ${state.searchSenders.join(", ")}`);
  if (state.searchMailboxPath?.trim()) parts.push(`dossier: ${state.searchMailboxPath}`);
  if (state.searchTags.length) parts.push(`${state.searchTags.length} tag(s)`);
  if (state.search.trim()) parts.push(`« ${state.search.trim()} »`);
  if (state.searchNewsletterRule) parts.push(formatNewsletterRuleInput(state.searchNewsletterRule));
  if (state.listFilter === "auto") parts.push("auto");
  else if (state.listFilter === "focused") parts.push("priorité");
  else if (state.listFilter === "unread") parts.push("non lus");
  else if (state.listFilter === "starred") parts.push("suivis");
  const hint = parts.length ? parts.join(" · ") : "tous les messages";
  if (n === 0) {
    const scopeHint =
      state.searchScope === "mailbox"
        ? " Essayez #compte dans la barre si les messages sont dans un autre dossier."
        : "";
    toast(`Aucun résultat (${hint})${scope}.${scopeHint}`);
  } else toast(`${n} conversation${n === 1 ? "" : "s"} · ${hint}${scope}.`);
}

export async function applySearchBarQuery(): Promise<void> {
  const d = deps();
  if (d.searchQueryUsesThreadsApi()) {
    await searchThreads();
    return;
  }
  if (d.isSearchActive()) {
    await d.loadThreadsForSearchContext(false);
    return;
  }
  await d.loadMailView(false);
}

export function resetManualSearchNlFilters(): void {
  state.searchNlMode = null;
  state.searchLanguageFilter = null;
}

export function resetSearchStructuralModifiers(): void {
  resetSearchStructuralState(state);
}

export async function clearSearchAndReloadInbox(): Promise<void> {
  const d = deps();
  state.search = "";
  state.searchDraft = "";
  state.searchSenders = [];
  state.searchMailboxPath = null;
  state.searchAccountOverrideId = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchScope = "account";
  state.searchModifiersTouched = false;
  state.searchRelativeDays = null;
  state.searchHasAttachment = null;
  state.searchMinSecurityScore = null;
  state.searchMailboxPrefix = null;
  state.activeSavedSearchId = null;
  resetManualSearchNlFilters();
  await d.loadMailView(false);
  render();
}

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
  const d = deps();
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
    (raw) => d.canonicalEmailForNlMatch(raw) ?? (raw.trim().toLowerCase() || null),
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

export function commitSearchQuery(opts?: { fromModal?: boolean }): void {
  const d = deps();
  const input = activeSearchInputElement();
  const raw = (input?.value ?? state.searchDraft).trim();
  const parsed = parseSearchBarDraft(raw, state.newsletterRules);
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parsed);
  state.searchDraft = raw;
  state.searchModifiersTouched = false;
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
    el.value = raw;
  });
  const closeModal = opts?.fromModal ?? state.searchModalOpen;
  if (!hasSearchBarCriteria()) {
    if (closeModal) state.searchModalOpen = false;
    void clearSearchAndReloadInbox();
    return;
  }
  const plainTextOnly =
    !parsedSearchBarHasModifiers(parsed) &&
    state.search.trim().split(/\s+/).filter((w) => w.length > 0).length >= 3 &&
    isAiFeatureEnabled(state.appPrefs.ai, "featureSearchNlEnabled") &&
    isTauriRuntime();

  if (plainTextOnly) {
    const accountId = state.selectedAccountId?.trim();
    const phrase = state.searchDraft.trim();
    if (!accountId || !phrase) {
      void applySearchBarQuery().then(() => {
        toastSearchBarResult();
        if (closeModal) state.searchModalOpen = false;
        if (state.view === "thread") d.clearThreadAiSummaryState();
        if (state.view !== "list") state.view = "list";
        render();
      });
      return;
    }
    void (async () => {
      const ran = await d.withLlmQueue("Recherche NL", async (signal) => {
        if (signal.aborted) return;
        let sq:
          | {
              text?: string | null;
              sender?: string | null;
              senders?: string[];
              tags?: Tag[];
              mode?: string | null;
              accountId?: string | null;
              mailbox?: string | null;
              language?: string | null;
            }
          | null = null;
        try {
          sq = await withTimeout(
            invoke<{
              text?: string | null;
              sender?: string | null;
              senders?: string[];
              tags?: Tag[];
              mode?: string | null;
              accountId?: string | null;
              mailbox?: string | null;
              language?: string | null;
            }>("llm_search_nl", { accountId, phrase }),
            LLM_INVOKE_TIMEOUT_MS,
          );
        } catch (err) {
          console.error("llm_search_nl from search bar", err);
        }
        if (signal.aborted) return;
        if (sq) {
          applySearchQueryFromNl(sq);
          if (!state.search.trim() && !state.searchSenders.length && !state.searchTags.length && phrase) {
            const fb = extractNlSearchFallbackText(phrase);
            if (fb) {
              state.search = fb;
              state.searchDraft = fb;
              state.searchNlMode = "lexical";
            }
          }
        } else {
          const fb = extractNlSearchFallbackText(phrase);
          if (fb) {
            state.search = fb;
            state.searchDraft = fb;
            state.searchNlMode = "lexical";
          } else {
            state.search = phrase;
            state.searchDraft = phrase;
            state.searchNlMode = null;
          }
        }
        if (
          !state.search.trim() &&
          !state.searchSenders.length &&
          !state.searchTags.length &&
          !state.searchLanguageFilter?.trim()
        ) {
          toast(
            "Recherche NL : aucun critère exploitable. Reformulez avec des mots-clés (ex. facture, Amazon) ou un expéditeur.",
          );
          return;
        }
        await searchThreads();
        const n = d.threadsVisibleInList().length;
        const bits = [
          n === 0 ? "aucun résultat" : `${n} fil${n === 1 ? "" : "s"}`,
          state.searchNlMode ? `mode ${state.searchNlMode}` : null,
          state.searchLanguageFilter ? `langue ${state.searchLanguageFilter.toUpperCase()}` : null,
        ].filter(Boolean);
        const scope =
          state.searchScope === "account"
            ? " (compte entier)"
            : d.effectiveSearchMailboxPath()
              ? " (dossier précis)"
              : "";
        toast(`Recherche NL : ${bits.join(" · ")}${scope}.`);
        d.recordSearchCommittedActivity();
      });
      if (!ran) return;
      if (closeModal) state.searchModalOpen = false;
      if (state.view === "thread") d.clearThreadAiSummaryState();
      if (state.view !== "list") state.view = "list";
      render();
    })();
  } else {
    void applySearchBarQuery().then(() => {
      toastSearchBarResult();
      d.recordSearchCommittedActivity();
      if (closeModal) state.searchModalOpen = false;
      if (state.view === "thread") d.clearThreadAiSummaryState();
      if (state.view !== "list") state.view = "list";
      render();
    });
  }
}
