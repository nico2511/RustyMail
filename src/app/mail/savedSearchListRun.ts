import { recordActivity } from "../../activity";
import { listSavedSearchesCmd, markSavedSearchSeenCmd } from "../../savedSearches";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";

export function patchSavedSearchNewCount(id: string, count: number, lastSeenAt?: string): void {
  const seen = lastSeenAt ?? new Date().toISOString();
  state.savedSearches = state.savedSearches.map((s) =>
    s.id === id ? { ...s, newCount: count, lastSeenAt: seen } : s,
  );
}

export async function refreshSavedSearches(includeCounts = true): Promise<void> {
  if (!isTauriRuntime()) {
    state.savedSearches = [];
    return;
  }
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    state.savedSearches = [];
    state.activeSavedSearchId = null;
    return;
  }
  try {
    state.savedSearches = await listSavedSearchesCmd(accountId, includeCounts);
    if (state.activeSavedSearchId && !state.savedSearches.some((s) => s.id === state.activeSavedSearchId)) {
      state.activeSavedSearchId = null;
    }
  } catch (e) {
    console.warn("list_saved_searches", e);
  }
}

export async function markActiveSavedSearchSeen(options?: { toast?: boolean }): Promise<boolean> {
  const accountId = currentAccount()?.id?.trim();
  const sid = state.activeSavedSearchId;
  if (!accountId || !sid) {
    if (options?.toast !== false) toast("Aucune vue active à marquer.");
    return false;
  }
  if (state.savedSearchMarkingSeenId === sid) return false;
  state.savedSearchMarkingSeenId = sid;
  try {
    patchSavedSearchNewCount(sid, 0);
    render();
    const updated = await markSavedSearchSeenCmd(accountId, sid);
    patchSavedSearchNewCount(sid, 0, updated.lastSeenAt ?? undefined);
    recordActivity({ eventType: "saved_view_seen", metaJson: JSON.stringify({ savedSearchId: sid }) });
    await refreshSavedSearches(true);
    const row = state.savedSearches.find((s) => s.id === sid);
    if (row && (row.newCount ?? 0) > 0) patchSavedSearchNewCount(sid, 0, updated.lastSeenAt ?? undefined);
    if (options?.toast) toast("Vue marquée à jour.");
    render();
    return true;
  } catch (e) {
    await refreshSavedSearches(true);
    render();
    toast(tauriErrorMessage(e));
    return false;
  } finally {
    state.savedSearchMarkingSeenId = null;
  }
}
