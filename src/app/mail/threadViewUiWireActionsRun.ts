import { tryHandleThreadViewUiAiWire } from "./threadViewUiAiWireRun";
import { tryHandleThreadViewUiModalsWire } from "./threadViewUiModalsWireRun";

export async function tryHandleThreadViewUiWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleThreadViewUiAiWire(action)) return true;
  return tryHandleThreadViewUiModalsWire(action, element);
}
