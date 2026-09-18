import { tryHandleThreadLlmAiUiWire } from "./threadLlmAiUiWireActionsRun";
import { tryHandleThreadLlmDemoWire } from "./threadLlmDemoWireActionsRun";
import { tryHandleThreadLlmQuickReplyWire } from "./threadLlmQuickReplyWireActionsRun";

export async function tryHandleThreadLlmWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleThreadLlmQuickReplyWire(action, element)) return true;
  if (await tryHandleThreadLlmAiUiWire(action, element)) return true;
  return tryHandleThreadLlmDemoWire(action);
}
