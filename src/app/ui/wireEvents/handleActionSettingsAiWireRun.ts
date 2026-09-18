import { tryHandleSettingsAiDictationWire } from "./handleActionSettingsAiDictationWireRun";
import { tryHandleSettingsAiPrefetchWire } from "./handleActionSettingsAiPrefetchWireRun";
import { tryHandleSettingsAiRuntimeWire } from "./handleActionSettingsAiRuntimeWireRun";

export async function tryHandleSettingsAiWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleSettingsAiRuntimeWire(action, element)) return true;
  if (await tryHandleSettingsAiPrefetchWire(action, element)) return true;
  if (await tryHandleSettingsAiDictationWire(action)) return true;
  return false;
}
