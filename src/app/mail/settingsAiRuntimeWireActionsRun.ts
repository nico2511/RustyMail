import { tryHandleSettingsAiRuntimeEngineModeWire } from "./settingsAiRuntimeEngineModeWireRun";
import { tryHandleSettingsAiRuntimeRecommendedWire } from "./settingsAiRuntimeRecommendedWireRun";
import { tryHandleSettingsAiRuntimeStatusWire } from "./settingsAiRuntimeStatusWireRun";

export async function tryHandleSettingsAiRuntimeWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleSettingsAiRuntimeStatusWire(action)) return true;
  if (await tryHandleSettingsAiRuntimeRecommendedWire(action)) return true;
  if (await tryHandleSettingsAiRuntimeEngineModeWire(action, element)) return true;
  return false;
}
