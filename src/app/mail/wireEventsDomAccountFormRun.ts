// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomAccountEmailPreset } from "./wireEventsDomAccountEmailPresetRun";
import { wireEventsDomAccountSelect } from "./wireEventsDomAccountSelectRun";

export function wireEventsDomAccountForm(signal: AbortSignal): void {
  wireEventsDomAccountSelect(signal);
  wireEventsDomAccountEmailPreset(signal);
}
