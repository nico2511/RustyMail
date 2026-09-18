import { recordActivity } from "../../activity";
import { buildSavedSearchUiState, buildSavedSearchUpsert } from "../../savedSearchApply";
import { markSavedSearchSeenCmd, upsertSavedSearchCmd } from "../../savedSearches";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { buildSearchQueryFromCurrentState, searchAccountIdForQuery } from "./searchQueryContext";
import { canSaveSearchView } from "./searchViewContext";
import { refreshSavedSearches } from "./savedSearchListRun";
import { refreshSuggestedSavedViews } from "./savedSearchSuggestionsRun";
import { suggestSavedSearchName, syncCommitSearchDraftForSave } from "./savedSearchViewsHelpers";

export async function saveCurrentSearchView(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Vues enregistrées : disponible dans l’app Tauri.");
    return;
  }
  const accountId = searchAccountIdForQuery();
  if (!accountId) {
    toast("Choisissez un compte avant d’enregistrer une vue.");
    return;
  }
  syncCommitSearchDraftForSave();
  if (!canSaveSearchView()) {
    toast("Lancez d’abord la recherche (Entrée), puis enregistrez la vue.");
    return;
  }
  const defaultName = suggestSavedSearchName();
  const name = window.prompt("Nom de la vue enregistrée", defaultName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toast("Nom de vue invalide.");
    return;
  }
  const iconRaw = window.prompt("Icône courte (2–4 caractères)", "Vu");
  if (iconRaw === null) return;
  const icon = (iconRaw.trim() || "Vu").slice(0, 4);
  const query = buildSearchQueryFromCurrentState();
  const ui = buildSavedSearchUiState({
    listFilter: state.listFilter,
    searchScope: state.searchScope,
    searchNlMode: state.searchNlMode,
    searchDraft: state.searchDraft,
    searchNewsletterRule: state.searchNewsletterRule,
    searchModifiersTouched: state.searchModifiersTouched,
  });
  try {
    const saved = await upsertSavedSearchCmd(
      buildSavedSearchUpsert(accountId, trimmed, query, ui, { icon }),
    );
    state.activeSavedSearchId = saved.id;
    await markSavedSearchSeenCmd(accountId, saved.id);
    recordActivity({ eventType: "saved_view_created", metaJson: JSON.stringify({ savedSearchId: saved.id }) });
    toast(`Vue « ${trimmed} » enregistrée — surveillance à jour.`);
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}
