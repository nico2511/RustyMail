// @ts-nocheck — DOM wiring; tighten types incrementally.
import {
  wireSettingsAiDomModalChangeListener,
  wireSettingsAiDomModalInputListener,
} from "./settingsAiDomWireModalChangeRun";

export function wireSettingsAiDomModalListeners(signal: AbortSignal, immediateCheckboxIds: Set<string>): void {
  wireSettingsAiDomModalChangeListener(signal, immediateCheckboxIds);
  wireSettingsAiDomModalInputListener(signal);
}
