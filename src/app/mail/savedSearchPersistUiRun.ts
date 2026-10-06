/** Persiste l’état UI de la vue filtrée active (tri date, etc.) sans renommer. */

import { buildSavedSearchUiState, buildSavedSearchUpsert } from "../../savedSearchApply";
import { upsertSavedSearchCmd } from "../../savedSearches";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import { buildSearchQueryFromCurrentState, searchAccountIdForQuery } from "./searchQueryContext";
import { refreshSavedSearches } from "./savedSearchListRun";

export async function persistActiveSavedSearchUiState(): Promise<void> {
  if (!isTauriRuntime()) return;
  const id = state.activeSavedSearchId?.trim();
  if (!id) return;
  const existing = state.savedSearches.find((s) => s.id === id);
  if (!existing) return;
  const accountId = searchAccountIdForQuery() || existing.accountId;
  if (!accountId) return;
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
    await upsertSavedSearchCmd(
      buildSavedSearchUpsert(accountId, existing.name, query, ui, {
        id,
        pinned: existing.pinned,
        sortOrder: existing.sortOrder,
        icon: existing.icon,
        shortcut: existing.shortcut,
      }),
    );
    await refreshSavedSearches(false);
  } catch {
    // Best-effort : le tri reste appliqué en session même si la persistance échoue.
  }
}
