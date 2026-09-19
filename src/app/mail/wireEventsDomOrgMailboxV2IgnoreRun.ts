// @ts-nocheck — DOM wiring; tighten types incrementally.
import { onOrgV2IgnoreMailboxUi, onOrgV2UnignoreMailboxUi } from "./orgFolderWireActions";

export function wireEventsDomOrgMailboxV2Ignore(signal: AbortSignal): void {
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
