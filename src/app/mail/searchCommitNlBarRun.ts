import { invoke } from "@tauri-apps/api/core";
import { extractNlSearchFallbackText } from "../../searchQueryState";
import type { Tag } from "../types";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  applySearchQueryFromNl,
  requireSearchCommitDeps,
} from "./searchCommitQuery";
import { effectiveSearchMailboxPath } from "./searchQueryContext";
import { searchThreads } from "./searchThreadsRun";
import { recordSearchCommittedActivity } from "./threadActivityTracking";

export async function runNlSearchCommitFromBar(opts: {
  accountId: string;
  phrase: string;
  closeModal: boolean;
}): Promise<void> {
  const d = requireSearchCommitDeps();
  const { accountId, phrase, closeModal } = opts;
  const ran = await d.withLlmQueue("Recherche NL", async (signal) => {
    if (signal.aborted) return;
    let sq:
      | {
          text?: string | null;
          sender?: string | null;
          senders?: string[];
          tags?: Tag[];
          mode?: string | null;
          accountId?: string | null;
          mailbox?: string | null;
          language?: string | null;
        }
      | null = null;
    try {
      sq = await withTimeout(
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
    } catch (err) {
      console.error("llm_search_nl from search bar", err);
    }
    if (signal.aborted) return;
    if (sq) {
      applySearchQueryFromNl(sq);
      if (!state.search.trim() && !state.searchSenders.length && !state.searchTags.length && phrase) {
        const fb = extractNlSearchFallbackText(phrase);
        if (fb) {
          state.search = fb;
          state.searchDraft = fb;
          state.searchNlMode = "lexical";
        }
      }
    } else {
      const fb = extractNlSearchFallbackText(phrase);
      if (fb) {
        state.search = fb;
        state.searchDraft = fb;
        state.searchNlMode = "lexical";
      } else {
        state.search = phrase;
        state.searchDraft = phrase;
        state.searchNlMode = null;
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
      n === 0 ? "aucun résultat" : `${n} fil${n === 1 ? "" : "s"}`,
      state.searchNlMode ? `mode ${state.searchNlMode}` : null,
      state.searchLanguageFilter ? `langue ${state.searchLanguageFilter.toUpperCase()}` : null,
    ].filter(Boolean);
    const scope =
      state.searchScope === "account"
        ? " (compte entier)"
        : effectiveSearchMailboxPath()
          ? " (dossier précis)"
          : "";
    toast(`Recherche NL : ${bits.join(" · ")}${scope}.`);
    recordSearchCommittedActivity();
  });
  if (!ran) return;
  if (closeModal) state.searchModalOpen = false;
  if (state.view === "thread") d.clearThreadAiSummaryState();
  if (state.view !== "list") state.view = "list";
  render();
}
