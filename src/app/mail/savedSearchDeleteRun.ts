import { deleteSavedSearchCmd } from "../../savedSearches";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshSavedSearches } from "./savedSearchListRun";

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
