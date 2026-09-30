// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomInboxListMove } from "./wireEventsDomInboxListMoveRun";
import { wireEventsDomInboxListNav } from "./wireEventsDomInboxListNavRun";

export function wireEventsDomInboxList(signal: AbortSignal): void {
  wireEventsDomInboxListNav(signal);
  wireEventsDomInboxListMove(signal);
}
