import { tryHandleThreadReplyWire } from "./threadReplyWireActionsRun";
import { tryHandleThreadSecurityWire } from "./threadSecurityWireActionsRun";
import { tryHandleThreadViewUiWire } from "./threadViewUiWireActionsRun";

export async function tryHandleThreadViewWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleThreadViewUiWire(action, element)) return true;
  if (await tryHandleThreadReplyWire(action, element)) return true;
  if (await tryHandleThreadSecurityWire(action, element)) return true;
  return false;
}
