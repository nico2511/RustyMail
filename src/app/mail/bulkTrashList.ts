import { invoke } from "@tauri-apps/api/core";
import { optimisticOrgRemoveThreads } from "../../organizationView";
import {
  clearThreadsRecentlyRemoved,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";
import { isSavedDraftsVirtualMailbox, mailboxKind } from "../../mailboxKinds";
import type { ThreadListItem } from "../types";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import { isSearchActive } from "./searchQueryContext";
import { clearStatusBarJob, upsertStatusBarJob } from "./statusBarProgressJobs";

export type BulkTrashListDeps = {
  threadsVisibleInList: () => ThreadListItem[];
  sourceMailboxForThread: (threadId: string) => string;
  loadMailboxUnread: () => Promise<void>;
  loadMailView: (append?: boolean) => Promise<void>;
};

let bulkTrashListDeps: BulkTrashListDeps | null = null;

export function registerBulkTrashListDeps(deps: BulkTrashListDeps): void {
  bulkTrashListDeps = deps;
}

function trashDeps(): BulkTrashListDeps {
  if (!bulkTrashListDeps) throw new Error("registerBulkTrashListDeps not called");
  return bulkTrashListDeps;
}

export async function bulkTrashVisibleThreads(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Corbeille : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Corbeille : actions IMAP uniquement.");
    return;
  }
  if (mailboxKind(state.selectedMailbox || "") === "trash") {
    toast("Utilisez « Vider la corbeille » dans ce dossier.");
    return;
  }
  if (isSearchActive()) {
    toast("Tout supprimer : désactivé pendant une recherche. Retirez les filtres de recherche d’abord.");
    return;
  }
  const d = trashDeps();
  const visible = d.threadsVisibleInList();
  if (!visible.length) {
    toast("Aucune conversation à supprimer dans cette vue.");
    return;
  }
  const lf = state.listFilter;
  const filterLabel =
    lf === "unread"
      ? "Non lus"
      : lf === "focused"
        ? "Priorité"
        : lf === "auto"
          ? "Auto"
          : lf === "starred"
            ? "Suivis"
            : "Tout";
  const ok = await openConfirmModal({
    title: "Tout mettre à la corbeille ?",
    body: `Déplacer vers la corbeille toutes les conversations actuellement affichées dans « ${filterLabel} » (${visible.length}).`,
    danger: true,
    confirmLabel: "Tout supprimer",
  });
  if (!ok) return;

  const prevThreads = state.threads;
  const prevSelectedId = state.selectedThreadId;
  const prevView = state.view;
  const prevOrgReport = state.organization.report;

  const ids = visible.map((t) => String(t.id));
  markThreadsRecentlyRemoved(ids);
  state.threads = state.threads.filter((t) => !ids.includes(String(t.id)));
  if (state.view === "thread" && state.selectedThreadId && ids.includes(String(state.selectedThreadId))) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, ids);
  }
  render();

  let moved = 0;
  const errors: string[] = [];
  const total = ids.length;
  upsertStatusBarJob({ id: "bulk-trash", label: "Corbeille (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < ids.length; i++) {
      const tid = ids[i]!;
      try {
        const mailbox = d.sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("move_thread_trash", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        moved++;
      } catch (err) {
        errors.push(`${tid}: ${tauriErrorMessage(err)}`);
      }
      upsertStatusBarJob({ id: "bulk-trash", label: "Corbeille (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-trash");
  }

  if (errors.length) {
    clearThreadsRecentlyRemoved(ids);
    state.threads = prevThreads;
    state.selectedThreadId = prevSelectedId;
    state.view = prevView;
    state.organization.report = prevOrgReport;
    toast(`Échec corbeille (lot) : ${errors[0]}${errors.length > 1 ? "…" : ""}`);
    render();
    return;
  }

  toast(`${moved} conversation${moved === 1 ? "" : "s"} déplacée${moved === 1 ? "" : "s"} dans la corbeille.`);
  void d.loadMailboxUnread();
  await d.loadMailView(false);
  render();
}
