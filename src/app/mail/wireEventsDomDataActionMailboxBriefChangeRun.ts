// @ts-nocheck — DOM wiring; tighten types incrementally.
import { enqueueMailboxDigestRefreshWhenIdle, mailboxDigestSlotInList } from "./mailboxDigest";
import { state } from "../state";
import { render } from "../dispatch";

export function tryHandleMailboxBriefModeChange(t: HTMLElement): boolean {
  if (t.dataset.action !== "mailbox-brief-mode") return false;
  const v = (t as HTMLSelectElement).value as "auto" | "quick" | "decision" | "deep";
  if (v === state.mailboxBriefMode) return true;
  state.mailboxBriefMode = v;
  if (mailboxDigestSlotInList()) {
    void enqueueMailboxDigestRefreshWhenIdle(true);
  }
  render();
  return true;
}
