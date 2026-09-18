import { tryHandleThreadReplyWire } from "./handleActionThreadReplyWireRun";
import { tryHandleThreadSecurityWire } from "./handleActionThreadSecurityWireRun";
import { tryHandleThreadViewUiWire } from "./handleActionThreadViewUiWireRun";

export async function tryHandleThreadViewWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleThreadViewUiWire(action, element)) return true;
  if (await tryHandleThreadReplyWire(action, element)) return true;
  if (await tryHandleThreadSecurityWire(action, element)) return true;
  return false;
}
