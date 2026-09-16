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
export { isAtAutocompletePanelOpen } from "../../atAutocomplete";
export { isHashAutocompletePanelOpen } from "../../hashAutocomplete";
export { isAiFeatureEnabled, setAllAiFeatures } from "../../aiFeatures";
export { captureAiPrefsFieldsFromDom, syncLlmEnginePrefsToDom } from "../../aiPrefsPersist";
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
export { state } from "../state";
export { app } from "../wireEventsBridge";
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

export async function safeInvoke<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  fallback: T,
  timeoutMs?: number,
): Promise<T> {
  return (app()["safeInvoke"] as (...a: unknown[]) => Promise<T>)(command, args, fallback, timeoutMs);
}

export const DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY = (): string =>
  app()["DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY"] as string;

export const LIST_FILTER_VALUES = (): State["listFilter"][] =>
  app()["LIST_FILTER_VALUES"] as State["listFilter"][];

export const ENABLE_CLEAN_MESSAGE_VIEW = (): boolean =>
  Boolean(app()["ENABLE_CLEAN_MESSAGE_VIEW"]);
