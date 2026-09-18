import {
  clearSuggestionShownKeys,
  listSuggestedSavedViewsCmd,
  markSuggestionShownOnce,
  recordActivity,
} from "../../activity";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import { activityTrackingEnabled } from "./threadActivityTracking";

export async function refreshSuggestedSavedViews(): Promise<void> {
  if (!isTauriRuntime() || !activityTrackingEnabled()) {
    state.suggestedSavedViews = [];
    clearSuggestionShownKeys();
    return;
  }
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    state.suggestedSavedViews = [];
    clearSuggestionShownKeys();
    return;
  }
  try {
    state.suggestedSavedViews = await listSuggestedSavedViewsCmd(accountId);
    for (const s of state.suggestedSavedViews) {
      markSuggestionShownOnce(`${accountId}:${s.senderEmail}`, () => {
        recordActivity({
          eventType: "suggestion_shown",
          senderEmail: s.senderEmail,
          metaJson: JSON.stringify({ cardKind: "saved_view" }),
        });
      });
    }
  } catch (e) {
    console.warn("list_suggested_saved_views", e);
    state.suggestedSavedViews = [];
  }
}
