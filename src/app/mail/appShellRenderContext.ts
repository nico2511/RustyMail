import type { AddressBookRow } from "../types";
import { registerRender } from "../dispatch";
import { registerWireEventsContext } from "../ui/wireEventsBridge";
import {
  AI_PREFS_IMMEDIATE_CHECKBOX_IDS,
  addressBookEditEmailRef,
  composeInteractionsAbortRef,
  skipAccountIdentityCaptureOnceRef,
} from "./appShellRenderRefs";
import { renderAppShell } from "./appShellRenderRun";

export function registerAppShellWireContext(getAddressBookRowsCache: () => AddressBookRow[]): void {
  registerWireEventsContext({
    addressBookRowsCache: getAddressBookRowsCache,
    skipAccountIdentityCaptureOnceRef,
    addressBookEditEmailRef,
    AI_PREFS_IMMEDIATE_CHECKBOX_IDS,
    composeInteractionsAbortRef,
  });
  registerRender(renderAppShell);
}
