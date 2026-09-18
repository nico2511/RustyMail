/** List, search, settings shell helpers for `buildAppRenderDeps`. */
import type { RenderDeps } from "../ui/render/renderDeps";
import { buildShellListRenderDepsFragment } from "./appRenderRegistryDepsShellListRun";
import { buildShellSearchRenderDepsFragment } from "./appRenderRegistryDepsShellSearchRun";
import { buildShellSettingsRenderDepsFragment } from "./appRenderRegistryDepsShellSettingsRun";

export function buildShellRenderDepsFragment(): Pick<
  RenderDeps,
  | "navCurrentBreadcrumbSegment"
  | "effectiveSearchMailboxPath"
  | "inboxSearchContextActive"
  | "canSaveSearchView"
  | "canSaveSearchViewInModal"
  | "searchDraftDiffersFromCommitted"
  | "activeSavedSearchItem"
  | "searchViewCanOpenOrganizer"
  | "searchViewCanAffinerFlux"
  | "sourceMailboxForThread"
  | "currentAccount"
  | "renderSettings"
  | "renderContactsListPage"
  | "renderContactDetailPage"
  | "renderOrganizationPage"
  | "renderOrganizationV2Page"
  | "renderFolderManagerPage"
  | "renderList"
  | "threadsVisibleInList"
  | "isSearchActive"
  | "folderManagerPanelMailbox"
  | "threadListFollowed"
  | "settingsDraftProfile"
  | "mergedProfileForAccountsForm"
  | "buildSettingsAiPanelDeps"
  | "addressBookRowsCache"
  | "addressBookEditEmail"
  | "addressBookListQuery"
  | "accountsFormIdentityScratch"
> {
  return {
    ...buildShellSearchRenderDepsFragment(),
    ...buildShellListRenderDepsFragment(),
    ...buildShellSettingsRenderDepsFragment(),
  };
}
