// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomDataActionChange } from "./wireEventsDomDataActionChangeRun";
import { wireEventsDomDataActionClick } from "./wireEventsDomDataActionClickRun";

export function wireEventsDomDataActionDispatch(signal: AbortSignal): void {
  wireEventsDomDataActionClick();
  wireEventsDomDataActionChange(signal);
}
