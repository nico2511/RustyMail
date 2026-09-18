/** List, search, settings shell helpers for `buildAppRenderDeps`. */
import { renderContactDetailPage, renderContactsListPage } from "../../contactsView";
import { currentAccount } from "../core/accountContext";
import type { RenderDeps } from "../ui/render/renderDeps";
import { renderList } from "../ui/render/listRender";
import { renderSettings } from "../ui/render/settingsRender";
import {
  getAddressBookListQuery,
  getAddressBookRowsCache,
} from "./addressBookListState";
import { getAddressBookEditEmail } from "./appShellRender";
import {
  renderFolderManagerPageForState,
  renderOrganizationPageForState,
  renderOrganizationV2PageForState,
} from "./appRenderRegistryPagesRun";
import { folderManagerPanelMailbox } from "./mailboxPanelContext";
import { threadsVisibleInList, threadListFollowed } from "./mailListThreadFilter";
import { navCurrentBreadcrumbSegment } from "./navBreadcrumbSegments";
import {
  buildSettingsAiPanelDeps,
  mergedProfileForAccountsForm,
  settingsDraftProfile,
} from "./settingsRenderHelpers";
import { getAccountsFormIdentityScratch } from "./settingsAccountsFormState";
import { sourceMailboxForThread } from "./threadListActions";
import { effectiveSearchMailboxPath, isSearchActive } from "./searchQueryContext";
import { searchDraftDiffersFromCommitted } from "./searchCommitQuery";
import {
  activeSavedSearchItem,
  canSaveSearchView,
  canSaveSearchViewInModal,
  inboxSearchContextActive,
  searchViewCanAffinerFlux,
  searchViewCanOpenOrganizer,
} from "./searchViewContext";

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
    navCurrentBreadcrumbSegment,
    effectiveSearchMailboxPath,
    inboxSearchContextActive,
    canSaveSearchView,
    canSaveSearchViewInModal,
    searchDraftDiffersFromCommitted,
    activeSavedSearchItem,
    searchViewCanOpenOrganizer,
    searchViewCanAffinerFlux,
    sourceMailboxForThread,
    currentAccount,
    renderSettings,
    renderContactsListPage,
    renderContactDetailPage,
    renderOrganizationPage: renderOrganizationPageForState,
    renderOrganizationV2Page: renderOrganizationV2PageForState,
    renderFolderManagerPage: renderFolderManagerPageForState,
    renderList,
    threadsVisibleInList,
    isSearchActive,
    folderManagerPanelMailbox,
    threadListFollowed,
    settingsDraftProfile,
    mergedProfileForAccountsForm,
    buildSettingsAiPanelDeps,
    addressBookRowsCache: getAddressBookRowsCache,
    addressBookEditEmail: () => getAddressBookEditEmail(),
    addressBookListQuery: getAddressBookListQuery,
    accountsFormIdentityScratch: getAccountsFormIdentityScratch,
  };
}
