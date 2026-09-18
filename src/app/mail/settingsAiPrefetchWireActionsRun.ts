import { tryHandleSettingsAiPrefetchLlmWire } from "./settingsAiPrefetchLlmWireRun";
import { tryHandleSettingsAiPrefetchSemanticWire } from "./settingsAiPrefetchSemanticWireRun";
import { tryHandleSettingsAiPrefetchWhisperWire } from "./settingsAiPrefetchWhisperWireRun";

export async function tryHandleSettingsAiPrefetchWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleSettingsAiPrefetchLlmWire(action)) return true;
  if (await tryHandleSettingsAiPrefetchSemanticWire(action)) return true;
  return tryHandleSettingsAiPrefetchWhisperWire(action);
}
