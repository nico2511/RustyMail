import { invoke } from "@tauri-apps/api/core";

import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { maybeShowFirstRunWizard } from "../../setupWizard";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { state } from "../state";
import {
  applyDefaultAccountFromPrefs,
  defaultListFilterFromPrefs,
} from "./accountDefaultPrefs";
import { applyListFilter } from "./mailListView";
import {
  buildMailboxBriefGateBannerHtml,
  isMailboxDigestFeatureEnabled,
  mailboxDigestPanelEligible,
} from "./mailboxDigest";
import { isSearchActive } from "./searchQueryContext";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";

export function runBootDeferredPostPrefsSteps(): void {
  void refreshLlmRuntimeStatus().then(() => {
    if (
      isMailboxDigestFeatureEnabled() &&
      state.mailboxDigestPanelOpen &&
      mailboxDigestPanelEligible()
    ) {
      const accountId = currentAccount()?.id?.trim();
      const mailbox = state.selectedMailbox || "INBOX";
      if (accountId) {
        state.mailboxActionBrief = null;
        state.mailboxBriefBannerHtml = buildMailboxBriefGateBannerHtml();
        state.mailboxDigestKey = `${accountId}|${mailbox}`;
        state.mailboxDigestRefreshing = false;
      }
    }
    render();
  });
  if (state.appPrefs.ai.localLlmEnabled && (state.appPrefs.ai.aiBackgroundLlmPrefetch || state.appPrefs.ai.llamaServerEnabled)) {
    void invoke("prefetch_llm_model", {}).catch(() => {});
  }
  maybeShowFirstRunWizard({
    prefs: state.appPrefs,
    toast,
    onDismiss: (p) => {
      state.appPrefs = p;
      void (async () => {
        try {
          await invoke("set_app_prefs", { prefs: state.appPrefs });
        } catch (e) {
          console.warn("first-run prefs", e);
        }
        render();
      })();
    },
  });
  applyDefaultAccountFromPrefs();
}

export async function applyBootDefaultListFilterIfNeeded(): Promise<void> {
  const prefFilter = defaultListFilterFromPrefs();
  if (
    prefFilter !== state.listFilter &&
    state.view === "list" &&
    !isSearchActive() &&
    !isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")
  ) {
    await applyListFilter(prefFilter);
  }
}
