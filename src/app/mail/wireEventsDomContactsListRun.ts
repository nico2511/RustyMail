// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomContactsListScroll } from "./wireEventsDomContactsListScrollRun";
import { wireEventsDomContactsListSearch } from "./wireEventsDomContactsListSearchRun";

export function wireEventsDomContactsList(signal: AbortSignal): void {
  wireEventsDomContactsListSearch(signal);
  wireEventsDomContactsListScroll(signal);
}
