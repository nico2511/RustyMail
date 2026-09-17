import { recordActivity } from "../../activity";
import { applySavedSearchToState, buildSavedSearchUiState, buildSavedSearchUpsert } from "../../savedSearchApply";
import {
  applySavedSearchCmd,
  deleteSavedSearchCmd,
  markSavedSearchSeenCmd,
  upsertSavedSearchCmd,
} from "../../savedSearches";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import { buildSearchQueryFromCurrentState, searchAccountIdForQuery } from "./searchQueryContext";
import { canSaveSearchView } from "./searchViewContext";
import { searchThreads } from "./searchThreadsRun";
import { resolveSearchMailboxPath } from "./searchMailboxResolve";
import { refreshSavedSearches } from "./savedSearchListRun";
import { refreshSuggestedSavedViews } from "./savedSearchSuggestionsRun";
import {
  findNewsletterRuleByParts,
  suggestSavedSearchName,
  syncCommitSearchDraftForSave,
} from "./savedSearchViewsHelpers";

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

export async function deleteSavedSearchView(id: string): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !id.trim()) return;
  const item = state.savedSearches.find((s) => s.id === id);
  const ok = await openConfirmModal({
    title: "Supprimer la vue ?",
    body: item ? `« ${item.name} » sera retirée de la sidebar.` : "Cette vue sera supprimée.",
    danger: true,
    confirmLabel: "Supprimer",
  });
  if (!ok) return;
  try {
    await deleteSavedSearchCmd(accountId, id);
    if (state.activeSavedSearchId === id) state.activeSavedSearchId = null;
    toast("Vue supprimée.");
    await refreshSavedSearches(true);
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}
