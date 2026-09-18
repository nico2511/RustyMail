import { tryHandleAgentAssistComposeWire } from "./agentAssistComposeWireActionsRun";
import { tryHandleAgentAssistMailboxWire } from "./agentAssistMailboxWireActionsRun";
import { tryHandleAgentAssistSessionWire } from "./agentAssistSessionWireActionsRun";

export async function tryHandleAgentAssistWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleAgentAssistSessionWire(action, element)) return true;
  if (await tryHandleAgentAssistComposeWire(action)) return true;
  return tryHandleAgentAssistMailboxWire(action);
}
