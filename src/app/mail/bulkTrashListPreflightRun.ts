import { isSavedDraftsVirtualMailbox, mailboxKind } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { state } from "../state";
import { isSearchActive } from "./searchQueryContext";
import { requireBulkTrashListDeps } from "./bulkTrashListDepsRun";

function listFilterLabelForBulkTrash(): string {
  const lf = state.listFilter;
  return lf === "unread"
    ? "Non lus"
    : lf === "focused"
      ? "Priorité"
      : lf === "auto"
        ? "Auto"
        : lf === "starred"
          ? "Suivis"
          : "Tout";
}

export async function confirmBulkTrashVisibleThreadIds(): Promise<string[] | null> {
  if (!isTauriRuntime()) {
    toast("Corbeille : IMAP requiert l’app Tauri.");
    return null;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return null;
  }
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Corbeille : actions IMAP uniquement.");
    return null;
  }
  if (mailboxKind(state.selectedMailbox || "") === "trash") {
    toast("Utilisez « Vider la corbeille » dans ce dossier.");
    return null;
  }
  if (isSearchActive()) {
    toast("Tout supprimer : désactivé pendant une recherche. Retirez les filtres de recherche d’abord.");
    return null;
  }
  const d = requireBulkTrashListDeps();
  const visible = d.threadsVisibleInList();
  if (!visible.length) {
    toast("Aucune conversation à supprimer dans cette vue.");
    return null;
  }
  const filterLabel = listFilterLabelForBulkTrash();
  const ok = await openConfirmModal({
    title: "Tout mettre à la corbeille ?",
    body: `Déplacer vers la corbeille toutes les conversations actuellement affichées dans « ${filterLabel} » (${visible.length}).`,
    danger: true,
    confirmLabel: "Tout supprimer",
  });
  if (!ok) return null;
  return visible.map((t) => String(t.id));
}
