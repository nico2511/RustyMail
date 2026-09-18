import { tryHandleThreadReplyComposeWire } from "./threadReplyComposeWireRun";
import { tryHandleThreadReplyMailLinksWire } from "./threadReplyMailLinksWireRun";

export async function tryHandleThreadReplyWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleThreadReplyComposeWire(action, element)) return true;
  return tryHandleThreadReplyMailLinksWire(action, element);
}
