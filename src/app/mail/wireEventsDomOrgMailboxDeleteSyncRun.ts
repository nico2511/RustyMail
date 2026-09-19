// @ts-nocheck — DOM wiring; tighten types incrementally.
import { onOrgDeleteMailboxOne, onOrgSyncMailbox } from "./orgFolderWireActions";

export function wireEventsDomOrgMailboxDeleteSync(signal: AbortSignal): void {
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-delete-mailbox-one"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        const refId = el.dataset.mailboxRefId?.trim();
        if (mb && refId) void onOrgDeleteMailboxOne(mb, refId);
      },
      { signal },
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-sync-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void onOrgSyncMailbox(mb);
      },
      { signal },
    );
  });
}
