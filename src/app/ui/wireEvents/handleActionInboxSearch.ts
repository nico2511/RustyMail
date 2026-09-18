import { tryHandleAgentAssistWire } from "./handleActionAgentAssistWireRun";
import { tryHandleContactsWire } from "./handleActionContactsWireRun";
import { tryHandleListThreadWire } from "./handleActionListThreadWireRun";
import { tryHandleSearchViewsWire } from "./handleActionSearchViewsWireRun";

export async function tryHandleInboxSearch(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleContactsWire(action, element)) return true;
  if (await tryHandleAgentAssistWire(action, element)) return true;
  if (await tryHandleSearchViewsWire(action, element)) return true;
  if (await tryHandleListThreadWire(action, element)) return true;
  return false;
}
