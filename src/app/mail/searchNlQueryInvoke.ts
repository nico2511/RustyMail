import { invoke } from "@tauri-apps/api/core";
import { extractNlSearchFallbackText } from "../../searchQueryState";
import type { Tag } from "../types";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { state } from "../state";
import { applySearchQueryFromNl } from "./searchCommitQuery";

export type LlmSearchNlPayload = {
  text?: string | null;
  sender?: string | null;
  senders?: string[];
  tags?: Tag[];
  mode?: string | null;
  accountId?: string | null;
  mailbox?: string | null;
  language?: string | null;
};

export function nlSearchCriteriaEmpty(): boolean {
  return (
    !state.search.trim() &&
    !state.searchSenders.length &&
    !state.searchTags.length &&
    !state.searchLanguageFilter?.trim()
  );
}

export async function invokeLlmSearchNl(accountId: string, phrase: string): Promise<LlmSearchNlPayload> {
  return withTimeout(invoke<LlmSearchNlPayload>("llm_search_nl", { accountId, phrase }), LLM_INVOKE_TIMEOUT_MS);
}

export async function invokeLlmSearchNlOptional(
  accountId: string,
  phrase: string,
  logContext: string,
): Promise<LlmSearchNlPayload | null> {
  try {
    return await invokeLlmSearchNl(accountId, phrase);
  } catch (err) {
    console.error(logContext, err);
    return null;
  }
}

/** Apply LLM NL payload; when invoke failed (`sq` null), fall back to lexical or raw phrase (bar commit). */
export function applyNlSearchResultToState(phrase: string, sq: LlmSearchNlPayload | null): void {
  if (sq) {
    applySearchQueryFromNl(sq);
    if (nlSearchCriteriaEmpty() && phrase) {
      const fb = extractNlSearchFallbackText(phrase);
      if (fb) {
        state.search = fb;
        state.searchDraft = fb;
        state.searchNlMode = "lexical";
      }
    }
    return;
  }
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

/** Assist path: only lexical fallback when LLM returned empty criteria. */
export function applyNlSearchResultFromAssist(phrase: string, sq: LlmSearchNlPayload): void {
  applySearchQueryFromNl(sq);
  if (nlSearchCriteriaEmpty() && phrase) {
    const fb = extractNlSearchFallbackText(phrase);
    if (fb) {
      state.search = fb;
      state.searchDraft = fb;
      state.searchNlMode = "lexical";
    }
  }
}

export const NL_SEARCH_NO_CRITERIA_TOAST =
  "Recherche NL : aucun critère exploitable. Reformulez avec des mots-clés (ex. facture, Amazon) ou un expéditeur.";
