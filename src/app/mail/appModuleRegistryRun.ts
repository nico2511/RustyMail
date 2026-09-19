import { getAddressBookRowsCache } from "./addressBookListState";
import { registerAppAccountOrgWireDeps, registerAppBackgroundServices } from "./appAccountOrgWireRegistry";
import { registerAppComposeWireDeps } from "./appComposeWireRegistry";
import { registerAppRenderDeps } from "./appRenderRegistry";
import { registerAppSearchWireDeps } from "./appSearchWireRegistry";
import { registerAppShellWireContext } from "./appShellRender";
import { registerAppThreadWireDeps } from "./appThreadWireRegistry";

/** Startup module wiring order (formerly `application.ts` body). */
export function registerAllAppModules(): void {
  registerAppShellWireContext(getAddressBookRowsCache);
  registerAppRenderDeps();
  registerAppSearchWireDeps();
  registerAppThreadWireDeps();
  registerAppComposeWireDeps();
  registerAppAccountOrgWireDeps();
  registerAppBackgroundServices();
}
