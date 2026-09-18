import { recordActivity } from "../../activity";
import { applySavedSearchToState } from "../../savedSearchApply";
import { applySavedSearchCmd, markSavedSearchSeenCmd } from "../../savedSearches";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { searchThreads } from "./searchThreadsRun";
import { resolveSearchMailboxPath } from "./searchMailboxResolve";
import { refreshSavedSearches } from "./savedSearchListRun";
import { refreshSuggestedSavedViews } from "./savedSearchSuggestionsRun";
import { findNewsletterRuleByParts } from "./savedSearchViewsHelpers";

export async function applySavedSearchView(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    toast("Compte requis pour ouvrir une vue.");
    return;
  }
  try {
    const saved = await applySavedSearchCmd(accountId, id);
    state.activeSavedSearchId = saved.id;
    state.view = "list";
    state.selectedContactEmail = undefined;
    await markSavedSearchSeenCmd(accountId, saved.id);
    applySavedSearchToState(saved, state, {
      findNewsletterRule: findNewsletterRuleByParts,
      resolveMailboxPath: resolveSearchMailboxPath,
    });
    if (saved.query.accountId?.trim()) {
      state.selectedAccountId = saved.query.accountId.trim();
    }
    document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
      el.value = state.searchDraft;
    });
    await searchThreads();
    recordActivity({ eventType: "saved_view_applied", metaJson: JSON.stringify({ savedSearchId: saved.id }) });
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}
