// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomOrgMailboxDeleteSync } from "./wireEventsDomOrgMailboxDeleteSyncRun";
import { wireEventsDomOrgMailboxV2Ignore } from "./wireEventsDomOrgMailboxV2IgnoreRun";

export function wireEventsDomOrgMailboxInline(signal: AbortSignal): void {
  wireEventsDomOrgMailboxDeleteSync(signal);
  wireEventsDomOrgMailboxV2Ignore(signal);
}
