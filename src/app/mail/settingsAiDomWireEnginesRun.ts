import { wireSettingsAiDomBackgroundPrefsListeners } from "./settingsAiDomWireBackgroundPrefsRun";
import { wireSettingsAiDomLlamaServerListeners } from "./settingsAiDomWireLlamaServerRun";

export function wireSettingsAiDomEngineAndBackgroundListeners(signal: AbortSignal): void {
  wireSettingsAiDomLlamaServerListeners(signal);
  wireSettingsAiDomBackgroundPrefsListeners(signal);
}
