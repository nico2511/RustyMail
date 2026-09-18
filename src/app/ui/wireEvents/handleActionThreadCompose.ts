import { tryHandleAddressBookSidebarWire } from "./handleActionAddressBookSidebarWireRun";
import { tryHandleComposeWire } from "./handleActionComposeWireRun";
import { tryHandleSearchModalWire } from "./handleActionSearchModalWireRun";
import { tryHandleThreadLlmWire } from "./handleActionThreadLlmWireRun";
import { tryHandleThreadNavWire } from "./handleActionThreadNavWireRun";
import { tryHandleThreadViewWire } from "./handleActionThreadViewWireRun";

export async function tryHandleThreadCompose(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleThreadNavWire(action, element)) return true;
  if (await tryHandleThreadViewWire(action, element)) return true;
  if (await tryHandleComposeWire(action, element)) return true;
  if (await tryHandleThreadLlmWire(action, element)) return true;
  if (await tryHandleSearchModalWire(action, element)) return true;
  if (await tryHandleAddressBookSidebarWire(action, element)) return true;
  return false;
}
