// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomInboxListMove } from "./wireEventsDomInboxListMoveRun";
import { wireEventsDomInboxListNav } from "./wireEventsDomInboxListNavRun";

export function wireEventsDomInboxList(_signal: AbortSignal): void {
  wireEventsDomInboxListNav();
  wireEventsDomInboxListMove();
}
