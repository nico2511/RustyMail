import { render, state } from "./depsCore";
import {
  openContactsView,
  openFolderManagerView,
  openOrganizationV2View,
  openOrganizationView,
} from "./depsOrgFolder";

export function tryHandleOrgFolderNav(action: string): boolean {
  switch (action) {
    case "open-contacts-view":
      void openContactsView();
      return true;
    case "open-organization-view":
      void openOrganizationView();
      return true;
    case "open-organization-v2-view":
      void openOrganizationV2View();
      return true;
    case "open-folder-manager-view":
      state.mailboxManageOpen = false;
      void openFolderManagerView();
      return true;
    default:
      return false;
  }
}
