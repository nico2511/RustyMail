import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import type { FluxAffinerResult } from "../types";
import { currentAccount } from "../core/accountContext";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openTextPromptModal } from "../modals/promptConfirm";
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

const GENERIC_AFFINER_TITLES = new Set([
  "recherche",
  "search",
  "inbox",
  "flux",
  "flux courant",
  "dossier",
  "folder",
  "divers",
  "misc",
]);

function foldAffinerLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function validateAffinerFolderTitleClient(title: string, existing: string[]): string | null {
  const t = title.trim();
  if (!t) return "Indiquez un nom de dossier.";
  if (t.length > 80) return "Nom trop long (max 80).";
  if (/[/\\]/.test(t) || t.includes("\n")) return "Pas de séparateur de chemin dans le nom.";
  const folded = foldAffinerLabel(t);
  if (GENERIC_AFFINER_TITLES.has(folded)) {
    return "Nom trop générique — choisissez un libellé thématique.";
  }
  if (existing.some((m) => foldAffinerLabel(m) === folded)) {
    return "Ce dossier existe déjà.";
  }
  return null;
}

export async function runFluxAffinerSuggestAndConfirm(): Promise<FluxAffinerApplyContext | null> {
  const d = requireSearchViewBatchDeps();
  if (!isTauriRuntime()) {
    toast.warning("Affiner : disponible dans l’app Tauri.");
    return null;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureOrgProposalsEnabled")) {
    toast.warning("Activez « Propositions Organiser (LLM) » dans Paramètres → IA.");
    return null;
  }
  const account = currentAccount();
  if (!account?.id) {
    toast.warning("Compte requis.");
    return null;
  }
  const visible = searchViewBatchThreads().slice(0, 50);
  if (visible.length < 5) {
    toast.warning("Affiner : au moins 5 fils visibles requis.");
    return null;
  }
  const viewLabel =
    d.activeSavedSearchItem()?.name?.trim() ||
    state.search.trim() ||
    "Flux courant";
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
    const edited = await openTextPromptModal({
      title: "Affiner — dossier suggéré",
      body: `${pct} % de confiance\n\n${result.rationale}\n\nModifiez le nom si besoin, puis validez pour créer le dossier IMAP et y déplacer ${visible.length} fil(s).`,
      label: "Nom du dossier IMAP",
      defaultValue: result.folderTitle.trim(),
    });
    if (edited == null) return null;
    const mailbox = edited.trim();
    const clientErr = validateAffinerFolderTitleClient(mailbox, state.mailboxes);
    if (clientErr) {
      toast.warning(clientErr);
      return null;
    }
    return { accountId: account.id, visible, mailbox };
  } catch (e) {
    const msg = tauriErrorMessage(e);
    if (!msg.toLowerCase().includes("annul")) toast(msg);
    return null;
  }
}
