import { tryHandleAddressBookSidebarWire } from "./addressBookSidebarWireActionsRun";
import { tryHandleComposeWire } from "./composeWireDispatchRun";
import { tryHandleSearchModalWire } from "./searchModalWireActionsRun";
import { tryHandleThreadLlmWire } from "./threadLlmWireActionsRun";
import { tryHandleThreadNavWire } from "./threadNavWireActionsRun";
import { tryHandleThreadViewWire } from "./threadViewWireDispatchRun";

export async function tryHandleThreadCompose(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleThreadNavWire(action, element)) return true;
  if (await tryHandleThreadViewWire(action, element)) return true;
  if (await tryHandleComposeWire(action, element)) return true;
  if (await tryHandleThreadLlmWire(action, element)) return true;
  if (await tryHandleSearchModalWire(action, element)) return true;
  if (await tryHandleAddressBookSidebarWire(action, element)) return true;
  return false;
}
