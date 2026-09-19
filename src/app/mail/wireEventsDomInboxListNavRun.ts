// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomInboxListOpenThreadNav } from "./wireEventsDomInboxListOpenThreadNavRun";
import { wireEventsDomInboxListSidebarNav } from "./wireEventsDomInboxListSidebarNavRun";

export function wireEventsDomInboxListNav(): void {
  wireEventsDomInboxListSidebarNav();
  wireEventsDomInboxListOpenThreadNav();
}
