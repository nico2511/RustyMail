import { invoke } from "@tauri-apps/api/core";
import { recordActivity } from "../../activity";
import { isAiFeatureEnabled } from "../../aiFeatures";
import type { FluxAffinerResult } from "../types";
import { currentAccount } from "../core/accountContext";
import { LLM_INVOKE_TIMEOUT_MS, MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import { withLlmQueue } from "./llmJobQueue";
import { searchThreads } from "./searchThreadsRun";
import {
  requireSearchViewBatchDeps,
  searchViewBatchThreads,
  setSearchViewBatchJob,
} from "./searchViewBatchContext";

export async function runFluxAffinerFromSearchView(): Promise<void> {
  const d = requireSearchViewBatchDeps();
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
