// @ts-nocheck — DOM wiring; tighten types incrementally.
import {
  onOrgDeleteMailboxOne,
  onOrgSyncMailbox,
  onOrgV2IgnoreMailboxUi,
  onOrgV2UnignoreMailboxUi,
} from "./orgFolderWireActions";

export function wireEventsDomOrgMailboxInline(signal: AbortSignal): void {
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
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-v2-ignore-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void onOrgV2IgnoreMailboxUi(mb);
      },
      { signal },
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-v2-unignore-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void onOrgV2UnignoreMailboxUi(mb);
      },
      { signal },
    );
  });
}
