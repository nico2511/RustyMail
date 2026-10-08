import { recordActivity } from "../../activity";
import { buildSavedSearchUiState, buildSavedSearchUpsert } from "../../savedSearchApply";
import { markSavedSearchSeenCmd, upsertSavedSearchCmd } from "../../savedSearches";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openTextPromptModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import { buildSearchQueryFromCurrentState, searchAccountIdForQuery } from "./searchQueryContext";
import { canSaveSearchView } from "./searchViewContext";
import { refreshSavedSearches } from "./savedSearchListRun";
import { refreshSuggestedSavedViews } from "./savedSearchSuggestionsRun";
import { suggestSavedSearchName, syncCommitSearchDraftForSave } from "./savedSearchViewsHelpers";

export async function saveCurrentSearchView(): Promise<void> {
  if (!isTauriRuntime()) {
    toast.warning("Vues enregistrées : disponible dans l’app Tauri.");
    return;
  }
  const accountId = searchAccountIdForQuery();
  if (!accountId) {
    toast.warning("Choisissez un compte avant d’enregistrer une vue.");
    return;
  }
  syncCommitSearchDraftForSave();
  if (!canSaveSearchView()) {
    toast.warning("Lancez d’abord la recherche (Entrée), puis enregistrez la vue.");
    return;
  }
  const defaultName = suggestSavedSearchName();
  const name = await openTextPromptModal({
    title: "Enregistrer la vue",
    label: "Nom de la vue",
    defaultValue: defaultName,
  });
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toast.error("Nom de vue invalide.");
    return;
  }
  const iconRaw = await openTextPromptModal({
    title: "Enregistrer la vue",
    label: "Icône courte (2–4 caractères)",
    defaultValue: "Vu",
  });
  if (iconRaw === null) return;
  const icon = iconRaw.trim();
  if (icon.length < 2 || icon.length > 4) {
    toast.error("Icône : 2 à 4 caractères.");
    return;
  }
  const query = buildSearchQueryFromCurrentState();
  const ui = buildSavedSearchUiState({
    listFilter: state.listFilter,
    searchScope: state.searchScope,
    searchNlMode: state.searchNlMode,
    searchDraft: state.searchDraft,
    searchNewsletterRule: state.searchNewsletterRule,
    searchModifiersTouched: state.searchModifiersTouched,
    listDateSort: state.listDateSort,
  });
  try {
    const saved = await upsertSavedSearchCmd(
      buildSavedSearchUpsert(accountId, trimmed, query, ui, { icon }),
    );
    state.activeSavedSearchId = saved.id;
    await markSavedSearchSeenCmd(accountId, saved.id);
    recordActivity({ eventType: "saved_view_created", metaJson: JSON.stringify({ savedSearchId: saved.id }) });
    toast.success(`Vue « ${trimmed} » enregistrée — surveillance à jour.`);
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast.error(tauriErrorMessage(e));
  }
}
