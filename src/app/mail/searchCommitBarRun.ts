import { isAiFeatureEnabled } from "../../aiFeatures";
import { threadMailboxListLabel } from "../../mailboxKinds";
import { parseSearchBarDraft } from "../../searchBarParse";
import { parsedSearchBarHasModifiers } from "../../searchQueryState";
import { formatNewsletterRuleInput } from "../lib/newsletterRuleFormat";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { requireSearchCommitDeps } from "./searchCommitContext";
import { runNlSearchCommitFromBar } from "./searchCommitNlBarRun";
import {
  applyParsedSearchBarToState,
  resetManualSearchNlFilters,
  resetSearchStructuralModifiers,
} from "./searchCommitStructuralRun";
import { searchThreads } from "./searchThreadsRun";
import { recordSearchCommittedActivity } from "./threadActivityTracking";
import { isSearchActive, searchMailboxForQuery, searchQueryUsesThreadsApi } from "./searchQueryContext";

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
  const d = requireSearchCommitDeps();
  const n = d.threadsVisibleInList().length;
  const mbTarget = searchMailboxForQuery();
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
  const d = requireSearchCommitDeps();
  if (searchQueryUsesThreadsApi()) {
    await searchThreads();
    return;
  }
  if (isSearchActive()) {
    await d.loadThreadsForSearchContext(false);
    return;
  }
  await d.loadMailView(false);
}

export async function clearSearchAndReloadInbox(): Promise<void> {
  const d = requireSearchCommitDeps();
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

export function commitSearchQuery(opts?: { fromModal?: boolean }): void {
  const d = requireSearchCommitDeps();
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
    void runNlSearchCommitFromBar({ accountId, phrase, closeModal });
  } else {
    void applySearchBarQuery().then(() => {
      toastSearchBarResult();
      recordSearchCommittedActivity();
      if (closeModal) state.searchModalOpen = false;
      if (state.view === "thread") d.clearThreadAiSummaryState();
      if (state.view !== "list") state.view = "list";
      render();
    });
  }
}
