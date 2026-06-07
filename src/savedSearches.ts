/** IPC vues de recherche enregistrées (aligné domaine Rust). */

import { invoke } from "@tauri-apps/api/core";
import type { SearchQueryPayload } from "./searchQueryBuild";

export type SavedSearchUiState = {
  listFilter?: string | null;
  searchScope?: string | null;
  searchNlMode?: string | null;
  searchDraft?: string | null;
  newsletterDomain?: string | null;
  newsletterLocalPart?: string | null;
  searchModifiersTouched?: boolean;
};

export type SavedSearch = {
  id: string;
  accountId: string;
  name: string;
  query: SearchQueryPayload & { mode?: string };
  uiState: SavedSearchUiState;
  pinned: boolean;
  sortOrder: number;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SavedSearchListItem = SavedSearch & {
  newCount?: number;
};

export type SavedSearchUpsert = {
  id?: string | null;
  accountId: string;
  name: string;
  query: SearchQueryPayload & { mode?: string };
  uiState?: SavedSearchUiState;
  pinned?: boolean;
  sortOrder?: number | null;
};

export async function listSavedSearchesCmd(
  accountId: string,
  includeCounts = true,
): Promise<SavedSearchListItem[]> {
  return invoke<SavedSearchListItem[]>("list_saved_searches_cmd", {
    payload: { accountId, includeCounts },
  });
}

export async function upsertSavedSearchCmd(payload: SavedSearchUpsert): Promise<SavedSearch> {
  return invoke<SavedSearch>("upsert_saved_search_cmd", { payload });
}

export async function deleteSavedSearchCmd(accountId: string, id: string): Promise<void> {
  await invoke("delete_saved_search_cmd", { payload: { accountId, id } });
}

export async function applySavedSearchCmd(accountId: string, id: string): Promise<SavedSearch> {
  return invoke<SavedSearch>("apply_saved_search_cmd", { payload: { accountId, id } });
}

export async function markSavedSearchSeenCmd(accountId: string, id: string): Promise<SavedSearch> {
  return invoke<SavedSearch>("mark_saved_search_seen_cmd", { payload: { accountId, id } });
}
