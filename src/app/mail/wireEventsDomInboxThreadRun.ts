// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomInboxList } from "./wireEventsDomInboxListRun";
import { wireEventsDomOrgConfirmModals, wireEventsDomOrgMailboxInline } from "./wireEventsDomOrgMailboxRun";
import { wireEventsDomThreadAttachments } from "./wireEventsDomThreadAttachmentsRun";
import { wireEventsDomInboxThreadChrome } from "./wireEventsDomInboxThreadChromeRun";

export function wireEventsDomInboxThread(signal: AbortSignal): void {
  wireEventsDomInboxList(signal);
  wireEventsDomOrgMailboxInline(signal);
  wireEventsDomThreadAttachments(signal);
  wireEventsDomInboxThreadChrome();
  wireEventsDomOrgConfirmModals(signal);
}
