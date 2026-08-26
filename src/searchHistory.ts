/** IPC historique de recherche locale (suggestions). */

import { invoke } from "@tauri-apps/api/core";

export type SearchHistoryEntry = {
  id: number;
  accountId: string;
  queryText: string;
  queryJson: string;
  usedAt: string;
};

/**
 * Enregistre une recherche validée.
 * Commande Tauri attendue : `record_search_history_cmd`
 * `{ payload: { accountId, queryText, queryJson } }`
 */
export async function recordSearchHistory(
  accountId: string,
  queryText: string,
  queryJson: string,
): Promise<void> {
  await invoke("record_search_history_cmd", {
    payload: { accountId, queryText, queryJson },
  });
}

/**
 * Liste l’historique récent.
 * Commande Tauri attendue : `list_search_history_cmd`
 * `{ payload: { accountId, limit } }`
 */
export async function listSearchHistory(
  accountId: string,
  limit = 20,
): Promise<SearchHistoryEntry[]> {
  return invoke<SearchHistoryEntry[]>("list_search_history_cmd", {
    payload: { accountId, limit },
  });
}

/**
 * Efface l’historique du compte.
 * Commande Tauri attendue : `clear_search_history_cmd`
 * `{ payload: { accountId } }`
 */
export async function clearSearchHistory(accountId: string): Promise<void> {
  await invoke("clear_search_history_cmd", {
    payload: { accountId },
  });
}
