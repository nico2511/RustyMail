import { tryHandleSettingsAiDictationWire } from "./settingsAiDictationWireActionsRun";
import { tryHandleSettingsAiPrefetchWire } from "./settingsAiPrefetchWireActionsRun";
import { tryHandleSettingsAiRuntimeWire } from "./settingsAiRuntimeWireActionsRun";

export async function tryHandleSettingsAiWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleSettingsAiRuntimeWire(action, element)) return true;
  if (await tryHandleSettingsAiPrefetchWire(action, element)) return true;
  if (await tryHandleSettingsAiDictationWire(action)) return true;
  return false;
}
