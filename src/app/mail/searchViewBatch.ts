import { invoke } from "@tauri-apps/api/core";
import { recordActivity } from "../../activity";
import { isAiFeatureEnabled } from "../../aiFeatures";
import {
  clearThreadsRecentlyRemoved,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import type { FluxAffinerResult, SearchViewBatchJob, ThreadListItem } from "../types";
import { SAVED_VIEW_BATCH_MAX } from "../lib/savedViewBatch";
import { currentAccount } from "../core/accountContext";
import { LLM_INVOKE_TIMEOUT_MS, MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import { isSearchActive } from "./searchQueryContext";
import { searchThreads } from "./searchThreadsRun";
import { clearStatusBarJob, scheduleStatusBarProgressPaint, upsertStatusBarJob } from "./statusBarProgressJobs";
import { withLlmQueue } from "./llmJobQueue";

export function searchViewBatchJobStatusText(): string {
  const j = state.searchViewBatchJob;
  if (!j) return "";
  const target = j.target.trim() || "dossier";
  if (j.phase === "create") return `Création « ${target} »…`;
  return `Déplacement ${j.done}/${j.total} → ${target}…`;
}

export function setSearchViewBatchJob(job: SearchViewBatchJob | null, renderNow = true): void {
  state.searchViewBatchJob = job;
  if (renderNow) render();
  else scheduleStatusBarProgressPaint();
}

export type SearchViewBatchDeps = {
  threadsVisibleInList: () => ThreadListItem[];
  sourceMailboxForThread: (threadId: string) => string;
  activeSavedSearchItem: () => { name?: string } | undefined;
  refreshMailboxesAfterImapChange: () => Promise<void>;
};

let searchViewBatchDeps: SearchViewBatchDeps | null = null;

export function registerSearchViewBatchDeps(deps: SearchViewBatchDeps): void {
  searchViewBatchDeps = deps;
}

function batchDeps(): SearchViewBatchDeps {
  if (!searchViewBatchDeps) throw new Error("registerSearchViewBatchDeps not called");
  return searchViewBatchDeps;
}

function searchViewBatchThreads(): ThreadListItem[] {
  return batchDeps().threadsVisibleInList().slice(0, SAVED_VIEW_BATCH_MAX);
}

export async function bulkMarkReadSearchViewThreads(): Promise<void> {
  const d = batchDeps();
  if (!isTauriRuntime()) {
    toast("Marquer lus : IMAP requiert l’app Tauri.");
    return;
  }
  if (!isSearchActive() && !state.activeSavedSearchId) {
    toast("Actions lot : ouvrez une recherche ou une vue enregistrée.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const visible = searchViewBatchThreads();
  if (!visible.length) {
    toast("Aucune conversation dans cette vue.");
    return;
  }
  const ok = await openConfirmModal({
    title: "Marquer comme lus ?",
    body: `Marquer comme lus jusqu’à ${visible.length} conversation(s) affichée(s) (plafond ${SAVED_VIEW_BATCH_MAX}).`,
    confirmLabel: "Marquer lus",
  });
  if (!ok) return;
  recordActivity({
    eventType: "bulk_mark_read",
    metaJson: JSON.stringify({ count: visible.length }),
  });
  const unreadTargets = visible.filter((t) => t.unread);
  let done = 0;
  const errors: string[] = [];
  const total = unreadTargets.length;
  if (total > 0) upsertStatusBarJob({ id: "bulk-mark-read", label: "Marquage lu (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < unreadTargets.length; i++) {
      const t = unreadTargets[i]!;
      const tid = String(t.id);
      try {
        const mailbox = d.sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("thread_mark_read", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        t.unread = false;
        done++;
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
      upsertStatusBarJob({ id: "bulk-mark-read", label: "Marquage lu (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-mark-read");
  }
  if (errors.length) toast(`Marquage partiel : ${errors[0]}`);
  else toast(done ? `${done} conversation(s) marquée(s) lue(s).` : "Aucun fil non lu dans la sélection.");
  render();
}

export async function bulkArchiveSearchViewThreads(): Promise<void> {
  const d = batchDeps();
  if (!isTauriRuntime()) {
    toast("Archivage : IMAP requiert l’app Tauri.");
    return;
  }
  if (!isSearchActive() && !state.activeSavedSearchId) {
    toast("Actions lot : ouvrez une recherche ou une vue enregistrée.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Archivage : actions IMAP uniquement.");
    return;
  }
  const visible = searchViewBatchThreads();
  if (!visible.length) {
    toast("Aucune conversation dans cette vue.");
    return;
  }
  const ok = await openConfirmModal({
    title: "Archiver le lot ?",
    body: `Archiver jusqu’à ${visible.length} conversation(s) (plafond ${SAVED_VIEW_BATCH_MAX}).`,
    confirmLabel: "Archiver",
  });
  if (!ok) return;
  recordActivity({
    eventType: "bulk_archive",
    metaJson: JSON.stringify({ count: visible.length }),
  });
  const prevThreads = state.threads;
  const ids = new Set(visible.map((t) => String(t.id)));
  markThreadsRecentlyRemoved(ids);
  state.threads = state.threads.filter((t) => !ids.has(String(t.id)));
  if (state.view === "thread" && state.selectedThreadId && ids.has(String(state.selectedThreadId))) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  render();
  let moved = 0;
  const errors: string[] = [];
  const idList = [...ids];
  const total = idList.length;
  upsertStatusBarJob({ id: "bulk-archive", label: "Archivage (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < idList.length; i++) {
      const tid = idList[i]!;
      try {
        const mailbox = d.sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("move_thread_archive", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        moved++;
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
      upsertStatusBarJob({ id: "bulk-archive", label: "Archivage (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-archive");
  }
  if (errors.length) {
    clearThreadsRecentlyRemoved(ids);
    state.threads = prevThreads;
    toast(`Archivage partiel : ${errors[0]}`);
    render();
    return;
  }
  toast(`${moved} conversation(s) archivée(s).`);
  await searchThreads();
}

export async function runFluxAffinerFromSearchView(): Promise<void> {
  const d = batchDeps();
  if (!isTauriRuntime()) {
    toast("Affiner : disponible dans l’app Tauri.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureOrgProposalsEnabled")) {
    toast("Activez « Propositions Organiser (LLM) » dans Paramètres → IA.");
    return;
  }
  const account = currentAccount();
  if (!account?.id) {
    toast("Compte requis.");
    return;
  }
  const visible = searchViewBatchThreads().slice(0, 50);
  if (visible.length < 5) {
    toast("Affiner : au moins 5 fils visibles requis.");
    return;
  }
  const viewLabel =
    d.activeSavedSearchItem()?.name?.trim() ||
    state.search.trim() ||
    "Recherche";
  const samples = visible.map((t) => ({
    subject: t.subject,
    sender: t.participants[0] ?? "",
    mailbox: t.mailbox ?? state.selectedMailbox ?? "INBOX",
  }));
  try {
    const result = await withLlmQueue("Affiner le flux", async (signal) => {
      if (signal.aborted) throw new Error("Annulé");
      return withTimeout(
        invoke<FluxAffinerResult>("llm_affiner_flux_cmd", {
          payload: {
            accountId: account.id,
            viewLabel,
            samples,
            existingMailboxes: state.mailboxes,
          },
        }),
        LLM_INVOKE_TIMEOUT_MS,
      );
    });
    if (!result) return;
    const pct = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100);
    const ok = await openConfirmModal({
      title: "Affiner — dossier suggéré",
      body: `« ${result.folderTitle} » (${pct} % de confiance)\n\n${result.rationale}\n\nCréer ce dossier IMAP et y déplacer ${visible.length} fil(s) ?`,
      confirmLabel: "Créer et déplacer",
    });
    if (!ok) return;
    const mailbox = result.folderTitle.trim();
    const total = visible.length;
    setSearchViewBatchJob({ phase: "create", done: 0, total: 1, target: mailbox });
    toast(`Création du dossier « ${mailbox} »…`, 4500);
    await withTimeout(
      invoke<string>("create_imap_mailbox", { accountId: account.id, mailbox }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    setSearchViewBatchJob({ phase: "move", done: 0, total, target: mailbox });
    toast(`Déplacement de ${total} fil(s) vers « ${mailbox} »…`, 5000);
    const ids = new Set(visible.map((t) => String(t.id)));
    let moved = 0;
    const errors: string[] = [];
    for (const t of visible) {
      const tid = String(t.id);
      const src = (t.mailbox?.trim() || d.sourceMailboxForThread(tid)).trim() || "INBOX";
      try {
        await withTimeout(
          invoke<string>("move_thread_mailbox", {
            accountId: account.id,
            mailbox: src,
            threadId: tid,
            destMailbox: mailbox,
          }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        moved++;
        setSearchViewBatchJob({ phase: "move", done: moved, total, target: mailbox });
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
    }
    setSearchViewBatchJob(null, false);
    if (moved > 0) {
      state.threads = state.threads.filter((row) => !ids.has(String(row.id)));
      if (state.view === "thread" && state.selectedThreadId && ids.has(String(state.selectedThreadId))) {
        state.view = "list";
        state.selectedThread = undefined;
        state.selectedThreadId = undefined;
      }
    }
    if (errors.length && moved === 0) {
      toast(`Déplacement échoué : ${errors[0]}`, 10_000);
    } else if (errors.length) {
      toast(`${moved}/${total} fil(s) déplacé(s) vers « ${mailbox} » · ${errors.length} échec(s).`, 10_000);
    } else {
      toast(`${moved} fil(s) déplacé(s) vers « ${mailbox} ».`, 10_000);
    }
    state.syncMessage = moved > 0 ? `${moved} déplacé(s) → ${mailbox}` : "";
    if (moved > 0) {
      recordActivity({
        eventType: "affiner_applied",
        metaJson: JSON.stringify({ mailbox, moved, total }),
      });
    }
    await d.refreshMailboxesAfterImapChange();
    if (moved > 0) await searchThreads();
    else render();
    if (state.syncMessage) {
      window.setTimeout(() => {
        if (state.syncMessage === `${moved} déplacé(s) → ${mailbox}`) {
          state.syncMessage = "";
          render();
        }
      }, 3500);
    }
  } catch (e) {
    setSearchViewBatchJob(null, false);
    const msg = tauriErrorMessage(e);
    if (!msg.toLowerCase().includes("annul")) toast(msg);
  }
}
