import { isAiFeatureEnabled } from "../../aiFeatures";
import { parseSearchBarDraft } from "../../searchBarParse";
import { parsedSearchBarHasModifiers } from "../../searchQueryState";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { state } from "../state";
import { requireSearchCommitDeps } from "./searchCommitContext";
import { runNlSearchCommitFromBar } from "./searchCommitNlBarRun";
import {
  applyParsedSearchBarToState,
  resetSearchStructuralModifiers,
} from "./searchCommitStructuralRun";
import { recordSearchCommittedActivity } from "./threadActivityTracking";
import {
  applySearchBarQuery,
  clearSearchAndReloadInbox,
  hasSearchBarCriteria,
  toastSearchBarResult,
} from "./searchCommitBarQueryRun";

function activeSearchInputElement(): HTMLInputElement | null {
  if (state.searchModalOpen) {
    return document.querySelector<HTMLInputElement>("#search-modal-input");
  }
  return document.querySelector<HTMLInputElement>("#search-input");
}

export {
  applySearchBarQuery,
  clearSearchAndReloadInbox,
  hasSearchBarCriteria,
  toastSearchBarResult,
} from "./searchCommitBarQueryRun";

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
