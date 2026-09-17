import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { requireSearchCommitDeps } from "./searchCommitQuery";
import { effectiveSearchMailboxPath } from "./searchQueryContext";
import {
  applyNlSearchResultToState,
  invokeLlmSearchNlOptional,
  nlSearchCriteriaEmpty,
  NL_SEARCH_NO_CRITERIA_TOAST,
} from "./searchNlQueryInvoke";
import { searchThreads } from "./searchThreadsRun";
import { recordSearchCommittedActivity } from "./threadActivityTracking";

export async function runNlSearchCommitFromBar(opts: {
  accountId: string;
  phrase: string;
  closeModal: boolean;
}): Promise<void> {
  const d = requireSearchCommitDeps();
  const { accountId, phrase, closeModal } = opts;
  const ran = await d.withLlmQueue("Recherche NL", async (signal) => {
    if (signal.aborted) return;
    const sq = await invokeLlmSearchNlOptional(accountId, phrase, "llm_search_nl from search bar");
    if (signal.aborted) return;
    applyNlSearchResultToState(phrase, sq);
    if (nlSearchCriteriaEmpty()) {
      toast(NL_SEARCH_NO_CRITERIA_TOAST);
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
        : effectiveSearchMailboxPath()
          ? " (dossier précis)"
          : "";
    toast(`Recherche NL : ${bits.join(" · ")}${scope}.`);
    recordSearchCommittedActivity();
  });
  if (!ran) return;
  if (closeModal) state.searchModalOpen = false;
  if (state.view === "thread") d.clearThreadAiSummaryState();
  if (state.view !== "list") state.view = "list";
  render();
}
