import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import type { FluxAffinerResult } from "../types";
import { currentAccount } from "../core/accountContext";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { state } from "../state";
import { withLlmQueue } from "./llmJobQueue";
import {
  requireSearchViewBatchDeps,
  searchViewBatchThreads,
} from "./searchViewBatchContext";

export type FluxAffinerApplyContext = {
  accountId: string;
  visible: ReturnType<typeof searchViewBatchThreads>;
  mailbox: string;
};

export async function runFluxAffinerSuggestAndConfirm(): Promise<FluxAffinerApplyContext | null> {
  const d = requireSearchViewBatchDeps();
  if (!isTauriRuntime()) {
    toast("Affiner : disponible dans l’app Tauri.");
    return null;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureOrgProposalsEnabled")) {
    toast("Activez « Propositions Organiser (LLM) » dans Paramètres → IA.");
    return null;
  }
  const account = currentAccount();
  if (!account?.id) {
    toast("Compte requis.");
    return null;
  }
  const visible = searchViewBatchThreads().slice(0, 50);
  if (visible.length < 5) {
    toast("Affiner : au moins 5 fils visibles requis.");
    return null;
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
    if (!result) return null;
    const pct = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100);
    const ok = await openConfirmModal({
      title: "Affiner — dossier suggéré",
      body: `« ${result.folderTitle} » (${pct} % de confiance)\n\n${result.rationale}\n\nCréer ce dossier IMAP et y déplacer ${visible.length} fil(s) ?`,
      confirmLabel: "Créer et déplacer",
    });
    if (!ok) return null;
    const mailbox = result.folderTitle.trim();
    return { accountId: account.id, visible, mailbox };
  } catch (e) {
    const msg = tauriErrorMessage(e);
    if (!msg.toLowerCase().includes("annul")) toast(msg);
    return null;
  }
}
