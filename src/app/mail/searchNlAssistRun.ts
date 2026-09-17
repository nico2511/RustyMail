import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { extractNlSearchFallbackText } from "../../searchQueryState";
import type { Tag } from "../types";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openTextPromptModal } from "../modals/promptConfirm";
import { state } from "../state";
import { applySearchQueryFromNl, requireSearchCommitDeps } from "./searchCommitQuery";
import { searchThreads } from "./searchThreadsRun";

export async function searchNlAssist(): Promise<void> {
  const d = requireSearchCommitDeps();
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureSearchNlEnabled")) {
    toast("Recherche en langage naturel désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Recherche NL : Tauri requis.");
    return;
  }
  const phrase =
    (
      await openTextPromptModal({
        title: "Recherche en langage naturel",
        body: "Décrivez ce que vous cherchez ; la requête sera traduite puis appliquée à la barre de recherche.",
        label: "Description",
        defaultValue: "",
      })
    )?.trim() ?? "";
  if (!phrase) return;
  const accountId = state.selectedAccountId?.trim();
  if (!accountId) {
    toast("Sélectionnez un compte avant la recherche en langage naturel.");
    return;
  }
  const ran = await d.withLlmQueue("Recherche NL", async (signal) => {
    if (signal.aborted) return;
    const sq = await withTimeout(
      invoke<{
        text?: string | null;
        sender?: string | null;
        senders?: string[];
        tags?: Tag[];
        mode?: string | null;
        accountId?: string | null;
        mailbox?: string | null;
        language?: string | null;
      }>("llm_search_nl", { accountId, phrase }),
      LLM_INVOKE_TIMEOUT_MS,
    );
    if (signal.aborted) return;
    applySearchQueryFromNl(sq);
    if (!state.search.trim() && !state.searchSenders.length && !state.searchTags.length && phrase) {
      const fb = extractNlSearchFallbackText(phrase);
      if (fb) {
        state.search = fb;
        state.searchDraft = fb;
        state.searchNlMode = "lexical";
      }
    }
    if (
      !state.search.trim() &&
      !state.searchSenders.length &&
      !state.searchTags.length &&
      !state.searchLanguageFilter?.trim()
    ) {
      toast(
        "Recherche NL : aucun critère exploitable. Reformulez avec des mots-clés (ex. facture, Amazon) ou un expéditeur.",
      );
      return;
    }
    await searchThreads();
    const n = d.threadsVisibleInList().length;
    const bits = [
      state.search ? `texte: ${state.search}` : "",
      state.searchSenders.length ? `de: ${state.searchSenders.join(", ")}` : "",
      state.searchTags.length ? `${state.searchTags.length} tag(s)` : "",
      state.searchNlMode ? `mode: ${state.searchNlMode}` : "",
      state.searchLanguageFilter ? `langue: ${state.searchLanguageFilter}` : "",
    ].filter(Boolean);
    if (n === 0) {
      toast(
        bits.length
          ? `Aucun résultat — ${bits.join(" · ")}. Essayez un mot plus court (ex. facture) ou #compte.`
          : "Aucun résultat pour cette recherche NL.",
      );
    } else {
      toast(bits.length ? `Recherche appliquée — ${bits.join(" · ")}` : "Recherche appliquée.");
    }
  });
  if (ran === null) return;
}
