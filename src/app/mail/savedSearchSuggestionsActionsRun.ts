import {
  dismissViewSuggestionCmd,
  recordActivityImmediate,
} from "../../activity";
import { buildSearchQueryPayload } from "../../searchQueryBuild";
import { buildSavedSearchUiState, buildSavedSearchUpsert } from "../../savedSearchApply";
import { upsertSavedSearchCmd } from "../../savedSearches";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshSavedSearches } from "./savedSearchListRun";
import { refreshSuggestedSavedViews } from "./savedSearchSuggestionsRefreshRun";

export async function acceptSuggestedSavedView(senderEmail: string): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  const item = state.suggestedSavedViews.find(
    (s) => s.senderEmail.toLowerCase() === senderEmail.trim().toLowerCase(),
  );
  if (!item) return;
  recordActivityImmediate({
    eventType: "suggestion_clicked",
    senderEmail: item.senderEmail,
    metaJson: JSON.stringify({ cardKind: "saved_view", action: "accept" }),
  });
  const query = buildSearchQueryPayload({
    search: `@${item.senderEmail}`,
    searchTags: [],
    searchSenders: [item.senderEmail],
    searchNlMode: null,
    searchLanguageFilter: null,
    accountId,
    mailbox: null,
    semanticSearchEnabled: Boolean(state.appPrefs.ai?.semanticSearchEnabled),
    semanticModelAvailable: Boolean(state.semanticModelAvailable),
  });
  const ui = buildSavedSearchUiState({
    listFilter: "all",
    searchScope: "account",
    searchNlMode: null,
    searchDraft: `@${item.senderEmail}`,
    searchNewsletterRule: null,
    searchModifiersTouched: true,
  });
  try {
    const saved = await upsertSavedSearchCmd(
      buildSavedSearchUpsert(accountId, item.suggestedName, query, ui),
    );
    await dismissViewSuggestionCmd(accountId, item.senderEmail, "accepted");
    state.activeSavedSearchId = saved.id;
    toast(`Vue « ${item.suggestedName} » enregistrée.`);
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function dismissSuggestedSavedView(
  senderEmail: string,
  decision: "dismiss" | "snooze",
): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  recordActivityImmediate({
    eventType: "suggestion_clicked",
    senderEmail,
    metaJson: JSON.stringify({ cardKind: "saved_view", action: decision }),
  });
  try {
    await dismissViewSuggestionCmd(accountId, senderEmail, decision);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}
