/** Orchestrates startup module wiring — extracted from application.ts */
import { getAddressBookRowsCache } from "./addressBookListState";
import { registerAppAccountOrgWireDeps, registerAppBackgroundServices } from "./appAccountOrgWireRegistry";
import { registerAppComposeWireDeps } from "./appComposeWireRegistry";
import { registerAppRenderDeps } from "./appRenderRegistry";
import { registerAppSearchWireDeps } from "./appSearchWireRegistry";
import { registerAppShellWireContext } from "./appShellRender";
import { registerAppThreadWireDeps } from "./appThreadWireRegistry";

export function registerAllAppModules(): void {
  registerAppShellWireContext(getAddressBookRowsCache);
  registerAppRenderDeps();
  registerAppSearchWireDeps();
  registerAppThreadWireDeps();
  registerAppComposeWireDeps();
  registerAppAccountOrgWireDeps();
  registerAppBackgroundServices();
}
