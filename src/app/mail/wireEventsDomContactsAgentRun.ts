// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomContactsList } from "./wireEventsDomContactsListRun";
import { wireEventsDomDataActionDispatch } from "./wireEventsDomDataActionDispatchRun";

export function wireEventsDomContactsAgent(signal: AbortSignal): void {
  wireEventsDomContactsList(signal);
  wireEventsDomDataActionDispatch(signal);
}
