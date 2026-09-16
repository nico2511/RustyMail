// @ts-nocheck
/** Shared imports for wireEvents DOM wiring and handleAction dispatchers. */
export { invoke } from "@tauri-apps/api/core";
export { ipcThrottleMs } from "../../ipc_bridge";
export { clearSuggestionShownKeys } from "../../activity";
export {
  accountFieldTouched,
  applyDomainPresetIfSafe,
  serverFieldSelectors,
  serverSidesFromPreset,
} from "../../accountSetup";
export {
  clearAccountOAuthWizard,
  resetNewAccountSetupState,
} from "../../account/accountWizardState";
export {
  clearDiscoveredServerSnap,
  setDiscoveredServersFormSnap,
} from "../../account/discoveredServerSnap";
export { isAtAutocompletePanelOpen } from "../../atAutocomplete";
export { isHashAutocompletePanelOpen } from "../../hashAutocomplete";
export { isAiFeatureEnabled, setAllAiFeatures } from "../../aiFeatures";
export {
  captureAiFeatureTogglesFromDom,
  captureAiPrefsFieldsFromDom,
  persistAiFeaturePrefs,
  syncLlmEnginePrefsToDom,
} from "../../aiPrefsPersist";
export { defaultEnabledSkillIds, type AssistMode, type AssistSkillId } from "../../assistAgent";
export {
  contactsListHasMore,
  getContactDetail,
  getContactsKeywordDraft,
  isContactsListLoading,
  loadContactDetail,
  loadContactProfile,
  loadContactsList,
  setContactsKeywordDraft,
} from "../../contactsView";
export { setLocale, t } from "../../i18n";
export {
  DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY,
  ENABLE_CLEAN_MESSAGE_VIEW,
  LIST_FILTER_VALUES,
} from "../../lib/appUiConstants";
export { safeInvoke, tauriErrorMessage, withTimeout } from "../../lib/tauriCommand";
export {
  isSavedDraftsVirtualMailbox,
  mailboxKind,
  threadMailboxListLabel,
} from "../../mailboxKinds";
export { saveFolderTreeExpanded } from "../../mailboxTree";
export { navCanGoBack } from "../../navigation";
export { orgRetagAccount, orgScanAccount, orgUndoLast } from "../../organizationView";
export { orgV2ScanAccount } from "../../organizationViewV2";
export { normalizeAiPrefsMerged } from "../../prefs_defaults";
export {
  clearThreadsRecentlyRemoved,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";
export {
  applyEngineConnectionMode,
  normalizeSettingsAiModalId,
} from "../../settingsAiPanel";
export { setMailboxLocked } from "../../folderManagerView";
export { composeRewriteStyleFromTone, type Tone } from "../core/composeTone";
export {
  BOOT_INVOKE_TIMEOUT_MS,
  DEFAULT_INVOKE_TIMEOUT_MS,
  MAIL_ACTION_TIMEOUT_MS,
  OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
} from "../core/timeouts";
export { isTauriRuntime } from "../lib/tauriRuntime";
export { toast } from "../lib/toast";
export {
  dismissMailboxDigestPanel,
  enqueueMailboxDigestRefreshWhenIdle,
  mailboxDigestSlotInList,
} from "../mail/mailboxDigest";
export {
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
} from "../mail/idleAiCachePrefetch";
export {
  finishConfirmModal,
  finishTextPromptModal,
  openConfirmModal,
} from "../modals/promptConfirm";
export { currentAccount } from "../core/accountContext";
export { threadIdsMatch } from "../lib/threadIdsMatch";
export { applyListFilter, loadMailView, loadMailboxUnread } from "../mail/mailListView";
export { searchThreads } from "../mail/searchThreadsRun";
export { fetchOpenThreadOrNotify } from "../mail/fetchOpenThread";
export { openThread } from "../mail/openThreadView";
export {
  clearSearchAndReloadInbox,
  commitSearchQuery,
  resetManualSearchNlFilters,
  searchDraftDiffersFromCommitted,
} from "../mail/searchCommitQuery";
export { isSearchActive } from "../mail/searchQueryContext";
export {
  closeSearchModal,
  openSearchModal,
  syncSearchBarChrome,
} from "../mail/searchBarUi";
export { state } from "../state";
export { app } from "../wireEventsBridge";
export { callApp } from "./callApp";
export type {
  Draft,
  OAuthDesktopLoginOutcome,
  PromptCatalogItem,
  State,
} from "../../types";

export function setSkipAccountIdentityCaptureOnce(value: boolean): void {
  (app()["skipAccountIdentityCaptureOnceRef"] as { current: boolean }).current = value;
}

export function setAddressBookEditEmail(value: string | null): void {
  (app()["addressBookEditEmailRef"] as { current: string | null }).current = value;
}

export function addressBookRowsCache(): unknown[] {
  return (app()["addressBookRowsCache"] as () => unknown[])();
}
