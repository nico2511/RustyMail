/** Settings, contacts, address book helpers for shell `RenderDeps`. */
import { renderContactDetailPage, renderContactsListPage } from "../../contactsView";
import type { RenderDeps } from "../ui/render/renderDeps";
import { renderSettings } from "../ui/render/settingsRender";
import {
  getAddressBookListQuery,
  getAddressBookRowsCache,
} from "./addressBookListState";
import { getAddressBookEditEmail } from "./appShellRender";
import {
  buildSettingsAiPanelDeps,
  mergedProfileForAccountsForm,
  settingsDraftProfile,
} from "./settingsRenderHelpers";
import { getAccountsFormIdentityScratch } from "./settingsAccountsFormState";

export function buildShellSettingsRenderDepsFragment(): Pick<
  RenderDeps,
  | "renderSettings"
  | "renderContactsListPage"
  | "renderContactDetailPage"
  | "settingsDraftProfile"
  | "mergedProfileForAccountsForm"
  | "buildSettingsAiPanelDeps"
  | "addressBookRowsCache"
  | "addressBookEditEmail"
  | "addressBookListQuery"
  | "accountsFormIdentityScratch"
> {
  return {
    renderSettings,
    renderContactsListPage,
    renderContactDetailPage,
    settingsDraftProfile,
    mergedProfileForAccountsForm,
    buildSettingsAiPanelDeps,
    addressBookRowsCache: getAddressBookRowsCache,
    addressBookEditEmail: () => getAddressBookEditEmail(),
    addressBookListQuery: getAddressBookListQuery,
    accountsFormIdentityScratch: getAccountsFormIdentityScratch,
  };
}
