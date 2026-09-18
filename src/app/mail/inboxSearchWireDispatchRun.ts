import { tryHandleAgentAssistWire } from "./agentAssistWireActionsRun";
import { tryHandleContactsWire } from "./contactsWireActionsRun";
import { tryHandleListThreadWire } from "./listThreadWireActionsRun";
import { tryHandleSearchViewsWire } from "./searchViewsWireActionsRun";

export async function tryHandleInboxSearch(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleContactsWire(action, element)) return true;
  if (await tryHandleAgentAssistWire(action, element)) return true;
  if (await tryHandleSearchViewsWire(action, element)) return true;
  if (await tryHandleListThreadWire(action, element)) return true;
  return false;
}
