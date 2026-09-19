// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomAccountEmailPreset } from "./wireEventsDomAccountEmailPresetRun";
import { wireEventsDomAccountSelect } from "./wireEventsDomAccountSelectRun";

export function wireEventsDomAccountForm(_signal: AbortSignal): void {
  wireEventsDomAccountSelect();
  wireEventsDomAccountEmailPreset();
}
