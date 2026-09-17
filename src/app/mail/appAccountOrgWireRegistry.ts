/** Account, settings, org/folder navigation wire deps */
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { openContactDetailView } from "./addressBookWireActions";
import { registerAppNavigationStackDeps } from "./appNavigationStack";
import { fmSelectMailbox, refreshFolderManagerTree } from "./orgFolderWireActions";
import { registerFolderManagerRunDeps } from "./folderManagerActions";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import {
  initIdleAiCachePrefetch,
} from "./idleAiCachePrefetch";
import { initMailboxDigest } from "./mailboxDigest";
import {
  loadMailView,
  loadMailboxUnread,
} from "./mailListView";
import { openThread } from "./openThreadView";
import { registerOrgApplyRunDeps } from "./orgApplyRun";
import { registerOrgV2ApplyRunDeps } from "./orgV2ApplyRun";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { refreshSavedSearches, refreshSuggestedSavedViews } from "./savedSearchViews";
import { registerSettingsWireActionsDeps } from "./settingsWireActions";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";
import { syncActivityRecordingPrefs } from "./threadActivityTracking";
import { registerSwitchActiveAccountDeps } from "./switchActiveAccountAction";
import {
  summarizeThreadCore,
  translateThreadCore,
} from "./threadAiRun";
import { threadIsAutoMail } from "./threadAutoMail";
import { langFromKindTags } from "./threadLangGuess";
import { normalizeIso639Primary } from "./threadLangGuessSamples";

export function registerAppAccountOrgWireDeps(): void {
  registerSettingsWireActionsDeps({
    syncActivityRecordingPrefs,
  });

  registerFolderManagerRunDeps({ loadMailView });
  registerOrgApplyRunDeps({ loadMailView });
  registerOrgV2ApplyRunDeps({ loadMailView });

  registerSwitchActiveAccountDeps({
    loadMailView,
    loadMailboxUnread,
    refreshSavedDraftsMailboxCount,
    refreshSavedSearches,
    refreshSuggestedSavedViews,
  });

  registerAppNavigationStackDeps({
    openThread,
    openContactDetailView,
    fmSelectMailbox,
    refreshFolderManagerTree,
  });
}

export function registerAppBackgroundServices(): void {
  initMailboxDigest({
    withTimeout,
    currentAccount,
    refreshLlmRuntimeStatus,
    tauriErrorMessage,
  });

  initIdleAiCachePrefetch({
    withTimeout,
    currentAccount,
    aiCacheKeySegment,
    refreshLlmRuntimeStatus,
    threadIsAutoMail,
    langFromKindTags,
    normalizeIso639Primary,
    summarizeThreadCore,
    translateThreadCore,
  });
}
